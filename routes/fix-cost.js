const express = require('express');
const { queryAll, queryGet, queryRun, getLastInsertId } = require('../database/init');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Admin boleh membuat pengajuan serta melihat history & detail (read-only: tidak ikut approve/reject, lihat stageFor).
router.use(requireRole('superadmin', 'admin', 'user', 'supervisor', 'atasan'));

// Tahap persetujuan berurutan: supervisor -> atasan. Keputusan akhir ada di atasan (approved_atasan = Approved final).
// Status lama approved_admin/rejected_admin tetap dikenali agar data lama valid. Superadmin tetap boleh bertindak di tahap mana pun.
const STAGES = {
    pending:             { stage: 'supervisor', role: 'supervisor', approved: 'approved_supervisor', rejected: 'rejected_supervisor' },
    approved_supervisor: { stage: 'atasan',     role: 'atasan',     approved: 'approved_atasan',     rejected: 'rejected_atasan' }
};
function stageFor(role, status) {
    const s = STAGES[status];
    return s && (role === s.role || role === 'superadmin') ? s : null;
}

router.post('/create', (req, res) => {
    try {
        const { transport_type, origin_provinsi, origin_kota, origin_kecamatan, destination_provinsi, destination_kota, destination_kecamatan, original_cost, discount_percentage, discount_amount, fix_cost, notes,
                truck_type, container_type, tonnage } = req.body;

        // Validasi isian wajib dengan pesan yang jelas (sebelumnya: error 500 kosong)
        if (!['land', 'sea'].includes(transport_type)) return res.status(400).json({ error: 'transport_type harus land atau sea' });
        const kosong = ['origin_provinsi', 'origin_kota', 'origin_kecamatan', 'destination_provinsi', 'destination_kota', 'destination_kecamatan'].filter(k => !String(req.body[k] || '').trim());
        if (kosong.length) return res.status(400).json({ error: `Isian wajib kosong: ${kosong.join(', ')}` });
        for (const k of ['original_cost', 'fix_cost']) {
            if (req.body[k] === undefined || req.body[k] === null || req.body[k] === '' || !Number.isFinite(Number(req.body[k]))) return res.status(400).json({ error: `${k} harus berupa angka` });
        }

        // Jenis layanan: darat = Door to Door; laut = Door to Port / Port to Port / Port to Door
        const SEA_SERVICES = ['door_to_port', 'port_to_port', 'port_to_door'];
        const serviceType = transport_type === 'land' ? 'door_to_door' : req.body.service_type;
        if (transport_type === 'sea' && !SEA_SERVICES.includes(serviceType)) return res.status(400).json({ error: 'service_type laut harus door_to_port, port_to_port, atau port_to_door' });

        // Berat (tonase) wajib untuk pengiriman darat; untuk laut opsional tetapi kalau diisi harus > 0.
        let ton = null;
        if (tonnage !== undefined && tonnage !== null && tonnage !== '') {
            ton = Number(tonnage);
            if (!Number.isFinite(ton) || ton <= 0) return res.status(400).json({ error: 'Tonase harus berupa angka lebih dari 0' });
        }
        if (transport_type === 'land' && ton === null) return res.status(400).json({ error: 'Berat (tonase) wajib diisi untuk pengiriman darat' });

        // Jumlah truk (wajib, bilangan bulat >= 1)
        const truckCount = req.body.truck_count === undefined || req.body.truck_count === '' ? 1 : Number(req.body.truck_count);
        if (!Number.isInteger(truckCount) || truckCount < 1) return res.status(400).json({ error: 'Jumlah truk harus bilangan bulat minimal 1' });

        // Pertanyaan biaya tambahan: multipickup, multidrop, kawalan, TKBM Door to Port / Port to Door (laut)
        const pts = (v, label) => {
            const x = (v === undefined || v === null || v === '') ? 0 : Number(v);
            if (!Number.isInteger(x) || x < 0) throw Object.assign(new Error(`${label} harus bilangan bulat >= 0`), { status: 400 });
            return x;
        };
        const mpPoints = pts(req.body.multipickup_points, 'Jumlah titik multipickup');
        const mdPoints = pts(req.body.multidrop_points, 'Jumlah titik multidrop');
        const kawalan = req.body.kawalan === true || req.body.kawalan === 1 || req.body.kawalan === '1' ? 1 : 0;
        const payer = (v, label, needed) => {
            if (v === undefined || v === null || v === '') {
                if (needed) throw Object.assign(new Error(`${label}: pilih siapa yang menanggung (customer atau perusahaan)`), { status: 400 });
                return null;
            }
            if (!['customer', 'perusahaan'].includes(v)) throw Object.assign(new Error(`${label} harus customer atau perusahaan`), { status: 400 });
            return v;
        };
        const tkbmDtp = transport_type === 'sea' ? payer(req.body.tkbm_dtp, 'TKBM Door to Port', false) : null;
        const tkbmPtd = transport_type === 'sea' ? payer(req.body.tkbm_ptd, 'TKBM Port to Door', false) : null;

        // Semua jasa OPSIONAL dan tidak punya master: nominal diisi langsung per pengiriman.
        // jasa_amounts: nominal per satuan untuk jasa bawaan yang dipilih; extra_jasa: [{name, amount}] jasa lain.
        const JASA_NAMES = { multipickup: 'Multi Pickup (per titik)', multidrop: 'Multi Drop (per titik)', kawalan: 'Kawalan', tkbm_dtp: 'TKBM Door to Port', tkbm_ptd: 'TKBM Port to Door' };
        const ov = (req.body.jasa_amounts && typeof req.body.jasa_amounts === 'object') ? req.body.jasa_amounts : {};
        const toAmount = (raw, label) => {
            const n = (raw === undefined || raw === null || raw === '') ? NaN : Number(raw);
            if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error(`Nominal ${label} wajib diisi dengan angka >= 0`), { status: 400 });
            return n;
        };
        const detail = [];
        const addLine = (key, qty) => {
            if (qty <= 0) return;
            const amount = toAmount(ov[key], JASA_NAMES[key]);
            detail.push({ name: JASA_NAMES[key], qty, amount, subtotal: amount * qty });
        };
        addLine('multipickup', mpPoints);
        addLine('multidrop', mdPoints);
        addLine('kawalan', kawalan);
        if (tkbmDtp === 'perusahaan') addLine('tkbm_dtp', 1);
        if (tkbmPtd === 'perusahaan') addLine('tkbm_ptd', 1);
        if (Array.isArray(req.body.extra_jasa)) {
            if (req.body.extra_jasa.length > 20) return res.status(400).json({ error: 'Jasa lainnya maksimal 20 baris' });
            for (const e of req.body.extra_jasa) {
                const name = String((e && e.name) || '').trim().slice(0, 100);
                if (!name) return res.status(400).json({ error: 'Nama jasa lainnya wajib diisi' });
                const amount = toAmount(e.amount, name);
                detail.push({ name, qty: 1, amount, subtotal: amount });
            }
        }
        const additionalCost = detail.reduce((s, d) => s + d.subtotal, 0);
        const totalCost = (Number(fix_cost) + additionalCost) * truckCount;
        const gudangClean = (v) => { const s = (v === undefined || v === null) ? '' : String(v).trim(); return s ? s.slice(0, 100) : null; };
        const clean = (v) => { const t = (v === undefined || v === null) ? '' : String(v).trim(); return t ? t.slice(0, 50) : null; };
        const truckType = clean(truck_type);
        const containerType = transport_type === 'sea' ? clean(container_type) : null; // type container hanya untuk laut
        
        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const countRes = queryGet(`SELECT COUNT(*) as c FROM fix_cost_requests WHERE request_number LIKE ?`, [`FC-${dateStr}-%`]);
        const reqNum = `FC-${dateStr}-${String(countRes.c + 1).padStart(3, '0')}`;
        
        queryRun(`
            INSERT INTO fix_cost_requests 
            (request_number, requester_id, transport_type, origin_provinsi, origin_kota, origin_kecamatan, destination_provinsi, destination_kota, destination_kecamatan, original_cost, discount_percentage, discount_amount, fix_cost, notes, truck_type, container_type, tonnage,
             service_type, gudang_muat, gudang_bongkar, truck_count, multipickup_points, multidrop_points, kawalan, tkbm_dtp, tkbm_ptd, additional_cost, additional_detail, total_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [reqNum, req.session.userId, transport_type, origin_provinsi, origin_kota, origin_kecamatan, destination_provinsi, destination_kota, destination_kecamatan, original_cost, discount_percentage ?? 0, discount_amount ?? 0, fix_cost, notes ?? '', truckType, containerType, ton,
            serviceType, gudangClean(req.body.gudang_muat), gudangClean(req.body.gudang_bongkar), truckCount, mpPoints, mdPoints, kawalan, tkbmDtp, tkbmPtd, additionalCost, JSON.stringify(detail), totalCost]);

        res.json({ id: getLastInsertId(), request_number: reqNum, additional_cost: additionalCost, total_cost: totalCost });
    } catch (err) {
        res.status(err && err.status ? err.status : 500).json({ error: err.message });
    }
});

router.get('/list', (req, res) => {
    try {
        const role = req.session.role;
        const userId = req.session.userId;
        let query = 'SELECT f.*, u.name as requester_name FROM fix_cost_requests f JOIN users u ON f.requester_id = u.id';
        let params = [];
        
        if (role === 'user') {
            query += ' WHERE f.requester_id = ?';
            params.push(userId);
        } else if (role === 'supervisor') {
            query += " WHERE f.status = 'pending' OR f.requester_id = ?";
            params.push(userId);
        } else if (role === 'atasan') {
            query += " WHERE f.status = 'approved_supervisor' OR f.requester_id = ?";
            params.push(userId);
        } else if (role === 'superadmin' || role === 'admin') {
            // semua (admin read-only)
        }
        
        const data = queryAll(query, params);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/detail/:id', (req, res) => {
    try {
        const request = queryGet('SELECT f.*, u.name as requester_name FROM fix_cost_requests f JOIN users u ON f.requester_id = u.id WHERE f.id = ?', [req.params.id]);
        if (!request) return res.status(404).json({ error: 'Not found' });
        
        const approvals = queryAll('SELECT a.*, u.name as approver_name FROM fix_cost_approvals a JOIN users u ON a.approver_id = u.id WHERE a.fix_cost_request_id = ? ORDER BY a.created_at ASC', [req.params.id]);
        request.approvals = approvals;
        
        res.json(request);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/approve/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const role = req.session.role;
        
        const request = queryGet('SELECT status FROM fix_cost_requests WHERE id = ?', [id]);
        if (!request) return res.status(404).json({ error: 'Not found' });
        
        const st = stageFor(role, request.status);
        if (!st) return res.status(403).json({ error: 'Invalid state for approval' });
        const newStatus = st.approved;
        
        queryRun('UPDATE fix_cost_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, id]);
        queryRun('INSERT INTO fix_cost_approvals (fix_cost_request_id, approver_id, action, notes, level) VALUES (?, ?, ?, ?, ?)', [id, req.session.userId, 'approve', notes || '', st.stage]);
        
        res.json({ success: true, status: newStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/reject/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const role = req.session.role;
        
        const request = queryGet('SELECT status FROM fix_cost_requests WHERE id = ?', [id]);
        if (!request) return res.status(404).json({ error: 'Not found' });

        // Reject hanya boleh oleh approver yang gilirannya (atau superadmin), sama seperti approve
        const st = stageFor(role, request.status);
        if (!st) return res.status(403).json({ error: 'Invalid state for rejection' });
        const newStatus = st.rejected;
        
        queryRun('UPDATE fix_cost_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, id]);
        queryRun('INSERT INTO fix_cost_approvals (fix_cost_request_id, approver_id, action, notes, level) VALUES (?, ?, ?, ?, ?)', [id, req.session.userId, 'reject', notes || '', st.stage]);
        
        res.json({ success: true, status: newStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/pending-count', (req, res) => {
    try {
        const role = req.session.role;
        let count = 0;
        
        if (role === 'supervisor') {
            count = queryGet("SELECT COUNT(*) as c FROM fix_cost_requests WHERE status = 'pending'").c;
        } else if (role === 'atasan') {
            count = queryGet("SELECT COUNT(*) as c FROM fix_cost_requests WHERE status = 'approved_supervisor'").c;
        } else {
            // superadmin, admin, user: semua pengajuan yang masih menunggu approval
            count = queryGet("SELECT COUNT(*) as c FROM fix_cost_requests WHERE status IN ('pending','approved_supervisor')").c;
        }
        
        res.json({ count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
