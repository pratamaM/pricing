const express = require('express');
const { queryAll, queryGet, queryRun } = require('../database/init');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// Layanan laut: Door to Port, Port to Port, Port to Door. Layanan darat selalu Door to Door.
const SEA_SERVICES = ['door_to_port', 'port_to_port', 'port_to_door'];

// ---- Komposisi layanan laut ----
// Master Sea disimpan sebagai Door to Port (lengkap dengan trucking asal). Layanan lain dihitung dari baris itu:
//  Port to Port = Door to Port tanpa Trucking Origin, Maint Fee, Investasi Truck (sisanya tetap, tetap dibagi 0,98)
//  Port to Door = Port to Port + trucking tujuan (diisi user saat menghitung, ditambahkan langsung per truk)
const PPH_DIVISOR = 0.98;
const round10k = (x) => Math.ceil(x / 10000 - 1e-9) * 10000;
function derivePortToPort(r, svc) {
    const cut = (Number(r.trucking_origin) || 0) + (Number(r.maint_fee) || 0) + (Number(r.investasi_truck) || 0);
    const temas = Number(r.temas_total_cost_pph) || 0;
    const meratus = Number(r.meratus_total_cost_pph) || 0;
    const margin = Math.floor(((Number(r.submit_value) || 0) - temas) / 10000) * 10000; // margin submit asli (kelipatan 10.000)
    const temasPtp = Math.max(0, temas - cut / PPH_DIVISOR);
    return Object.assign({}, r, {
        service_type: svc, derived: 1,
        trucking_origin: 0, maint_fee: 0, investasi_truck: 0, km_truck_origin: 0,
        temas_total_cost_pph: temasPtp,
        meratus_total_cost_pph: Math.max(0, meratus - cut / PPH_DIVISOR),
        submit_value: Number(r.submit_value) > 0 ? round10k(temasPtp + Math.max(0, margin)) : 0
    });
}

// Harga submit per pelayaran. Submit di master dihitung dari Temas; Meratus memakai margin submit yang sama.
function seaCarrierPrices(r) {
    const sub = Number(r.submit_value) || 0;
    const tem = Number(r.temas_total_cost_pph) || 0, mer = Number(r.meratus_total_cost_pph) || 0;
    const hasT = (Number(r.temas_freight) || 0) + (Number(r.temas_lss) || 0) > 0;
    const hasM = (Number(r.meratus_freight) || 0) + (Number(r.meratus_lss) || 0) > 0;
    if (!sub) return { submit_temas: 0, submit_meratus: 0 };
    if (!hasT && !hasM) return { submit_temas: sub, submit_meratus: 0 }; // data tanpa rincian pelayaran: harga tersimpan dianggap Temas
    const margin = Math.max(0, Math.floor((sub - tem) / 10000) * 10000);
    return { submit_temas: hasT ? sub : 0, submit_meratus: hasM && mer > 0 ? round10k(mer + margin) : 0 };
}
const isPtpFamily = (svc) => svc === 'port_to_port' || svc === 'port_to_door';

router.use(requireAuth);

router.get('/list', (req, res) => {
    try {
        const type = req.query.type === 'sea' ? 'sea' : 'land';
        const search = String(req.query.search || '').trim();
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;
        const table = `master_biaya_${type}`;
        const truckCol = type === 'sea' ? 'truck_type' : 'type_mobil';

        const where = [], params = [];
        if (search) {
            where.push(`(destination_provinsi LIKE ? OR destination_kota LIKE ? OR destination_kecamatan LIKE ? OR origin_provinsi LIKE ? OR origin_kota LIKE ? OR origin_kecamatan LIKE ?)`);
            params.push(...Array(6).fill(`%${search}%`));
        }
        // Filter tambahan (pilihan dropdown, cocok persis)
        const eq = (col, v) => { v = String(v || '').trim(); if (v) { where.push(`${col} = ?`); params.push(v); } };
        eq('origin_provinsi', req.query.origin_provinsi);
        eq('destination_provinsi', req.query.destination_provinsi);
        eq(truckCol, req.query.truck);
        const w = where.length ? ' WHERE ' + where.join(' AND ') : '';

        const total = queryGet(`SELECT COUNT(*) as total FROM ${table}${w}`, params).total;
        const data = queryAll(`SELECT * FROM ${table}${w} ORDER BY origin_provinsi, origin_kota, destination_kota, id LIMIT ? OFFSET ?`, [...params, limit, offset]);
        res.json({ data, total, page, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pilihan untuk dropdown filter (nilai unik yang ada di data)
router.get('/filter-options', (req, res) => {
    try {
        const type = req.query.type === 'sea' ? 'sea' : 'land';
        const table = `master_biaya_${type}`;
        const truckCol = type === 'sea' ? 'truck_type' : 'type_mobil';
        const uniq = (col) => queryAll(`SELECT DISTINCT ${col} AS v FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != '' ORDER BY ${col}`).map(r => r.v);
        res.json({ origin_provinsi: uniq('origin_provinsi'), destination_provinsi: uniq('destination_provinsi'), truck: uniq(truckCol) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/detail/:id', (req, res) => {
    try {
        const type = req.query.type === 'sea' ? 'sea' : 'land';
        const data = queryGet(`SELECT * FROM master_biaya_${type} WHERE id = ?`, [req.params.id]);
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/stats', (req, res) => {
    try {
        const type = req.query.type === 'sea' ? 'sea' : 'land';
        const valCol = type === 'sea' ? 'submit_value' : 'total';
        const data = queryAll(`SELECT destination_kota, SUM(${valCol}) as total FROM master_biaya_${type} WHERE destination_kota IS NOT NULL AND destination_kota != '' GROUP BY destination_kota`);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/locations', (req, res) => {
    try {
        const type = req.query.type === 'sea' ? 'sea' : 'land';
        const svc = type === 'sea' && SEA_SERVICES.includes(req.query.service_type) ? req.query.service_type : null;
        const data = queryAll(`SELECT DISTINCT origin_provinsi, origin_kota, origin_kecamatan, destination_provinsi, destination_kota, destination_kecamatan FROM master_biaya_${type} WHERE destination_kecamatan IS NOT NULL AND destination_kecamatan != ''${svc ? ' AND service_type = ?' : ''}`, svc ? [svc] : []);
        if (type === 'sea' && isPtpFamily(svc)) {
            // rute Port to Port / Port to Door ikut tersedia dari rute Door to Port
            const extra = queryAll(`SELECT DISTINCT origin_provinsi, origin_kota, origin_kecamatan, destination_provinsi, destination_kota, destination_kecamatan FROM master_biaya_sea WHERE destination_kecamatan IS NOT NULL AND destination_kecamatan != '' AND service_type = 'door_to_port'`);
            const seen = new Set(data.map(d => JSON.stringify(d)));
            for (const e of extra) if (!seen.has(JSON.stringify(e))) data.push(e);
        }
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Semua tarif pada satu rute (satu rute bisa punya beberapa baris dengan type truck/container berbeda)
router.get('/get-costs', (req, res) => {
    try {
        const type = req.query.type === 'sea' ? 'sea' : 'land';
        const { origin_kecamatan, dest_kecamatan } = req.query;
        const svc = type === 'sea' && SEA_SERVICES.includes(req.query.service_type) ? req.query.service_type : null;
        const rows = queryAll(`SELECT * FROM master_biaya_${type} WHERE origin_kecamatan = ? AND destination_kecamatan = ?${svc ? ' AND service_type = ?' : ''} ORDER BY id`, svc ? [origin_kecamatan, dest_kecamatan, svc] : [origin_kecamatan, dest_kecamatan]);
        if (type === 'sea' && isPtpFamily(svc)) {
            // hitung dari Door to Port (tanpa trucking asal); baris tersimpan layanan ini dipakai bila tidak ada Door to Port
            const dtp = queryAll(`SELECT * FROM master_biaya_sea WHERE origin_kecamatan = ? AND destination_kecamatan = ? AND service_type = 'door_to_port' ORDER BY id`, [origin_kecamatan, dest_kecamatan]);
            if (dtp.length) return res.json(dtp.map(r => derivePortToPort(r, svc)));
        }
        // Laut: harga per pelayaran (Temas / Meratus) sesuai Excel; tidak ada di Excel = 0
        if (type === 'sea') rows.forEach(r => Object.assign(r, seaCarrierPrices(r)));
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/get-cost', (req, res) => {
    try {
        const type = req.query.type === 'sea' ? 'sea' : 'land';
        const { origin_kecamatan, dest_kecamatan } = req.query;
        const data = queryGet(`SELECT * FROM master_biaya_${type} WHERE origin_kecamatan = ? AND destination_kecamatan = ?`, [origin_kecamatan, dest_kecamatan]);
        res.json(data || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/count', (req, res) => {
    try {
        const land = queryGet('SELECT COUNT(*) as c FROM master_biaya_land').c;
        const sea = queryGet('SELECT COUNT(*) as c FROM master_biaya_sea').c;
        res.json({ land, sea });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Edit baris master biaya (superadmin, admin, supervisor, atasan - sama dengan hak upload) ----
const LOC_FIELDS = ['origin_provinsi', 'origin_kota', 'origin_kecamatan', 'destination_provinsi', 'destination_kota', 'destination_kecamatan'];
const EDITABLE = {
    land: {
        text: [...LOC_FIELDS, 'gudang_muat', 'gudang_bongkar', 'type_mobil'],
        num: ['km', 'uj_sopir', 'tip_muat', 'tip_bongkar', 'tkbm', 'maint_fee', 'risk_claim_it', 'total_cost', 'marketing', 'cost_pph', 'total', 'jasa']
    },
    sea: {
        text: [...LOC_FIELDS, 'gudang_muat', 'gudang_bongkar', 'truck_type', 'port_origin', 'port_destination', 'thc_dest_note', 'tkbm_note'],
        num: ['km_truck_origin', 'trucking_origin', 'maint_fee', 'investasi_truck', 'profit', 'thc_origin_lolo', 'thc_dest', 'agent', 'tkbm', 'do_clean', 'risk_claim', 'marketing', 'jasa',
              'temas_freight', 'temas_lss', 'temas_total_cost_pph', 'meratus_freight', 'meratus_lss', 'meratus_total_cost_pph', 'submit_value']
    }
};

router.put('/:id', requireRole('superadmin', 'admin', 'supervisor', 'atasan'), (req, res) => {
    try {
        const type = req.query.type === 'sea' ? 'sea' : 'land';
        const table = `master_biaya_${type}`;
        if (!queryGet(`SELECT id FROM ${table} WHERE id = ?`, [req.params.id])) return res.status(404).json({ error: 'Not found' });

        const spec = EDITABLE[type];
        const sets = [], params = [];
        if (type === 'sea' && req.body.service_type !== undefined) {
            if (!SEA_SERVICES.includes(req.body.service_type)) return res.status(400).json({ error: 'service_type harus door_to_port, port_to_port, atau port_to_door' });
            sets.push('service_type = ?'); params.push(req.body.service_type);
        }
        for (const col of spec.text) {
            if (req.body[col] === undefined) continue;
            const v = req.body[col] === null ? '' : String(req.body[col]).trim();
            sets.push(`${col} = ?`); params.push(v === '' ? null : v);
        }
        for (const col of spec.num) {
            if (req.body[col] === undefined) continue;
            const raw = req.body[col];
            const v = (raw === '' || raw === null) ? 0 : Number(raw);
            if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: `Nilai ${col} harus berupa angka >= 0` });
            sets.push(`${col} = ?`); params.push(v);
        }
        if (sets.length === 0) return res.status(400).json({ error: 'Tidak ada field yang diubah' });

        queryRun(`UPDATE ${table} SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...params, req.params.id]);
        res.json(queryGet(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]));
    } catch (err) {
        res.status(500).json({ error: (err && err.message) ? err.message : String(err) });
    }
});

module.exports = router;
