const express = require('express');
const { queryAll, queryGet, queryRun } = require('../database/init');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// Layanan laut: Door to Port, Port to Port, Port to Door. Layanan darat selalu Door to Door.
const SEA_SERVICES = ['door_to_port', 'port_to_port', 'port_to_door'];

router.use(requireAuth);

router.get('/list', (req, res) => {
    try {
        const type = req.query.type === 'sea' ? 'sea' : 'land';
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        
        const table = `master_biaya_${type}`;
        
        let query = `SELECT * FROM ${table}`;
        let countQuery = `SELECT COUNT(*) as total FROM ${table}`;
        let params = [];
        
        if (search) {
            const where = ` WHERE destination_provinsi LIKE ? OR destination_kota LIKE ? OR destination_kecamatan LIKE ?
                OR origin_provinsi LIKE ? OR origin_kota LIKE ? OR origin_kecamatan LIKE ?`;
            query += where;
            countQuery += where;
            params = Array(6).fill(`%${search}%`);
        }
        
        query += ` LIMIT ? OFFSET ?`;
        
        const countRes = queryGet(countQuery, params);
        const data = queryAll(query, [...params, limit, offset]);
        
        res.json({ data, total: countRes.total, page, limit });
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
        res.json(queryAll(`SELECT * FROM master_biaya_${type} WHERE origin_kecamatan = ? AND destination_kecamatan = ?${svc ? ' AND service_type = ?' : ''} ORDER BY id`, svc ? [origin_kecamatan, dest_kecamatan, svc] : [origin_kecamatan, dest_kecamatan]));
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
        num: ['km', 'uj_sopir', 'tip_muat', 'tip_bongkar', 'tkbm', 'maint_fee', 'risk_claim_it', 'marketing', 'cost_pph', 'total']
    },
    sea: {
        text: [...LOC_FIELDS, 'gudang_muat', 'gudang_bongkar', 'truck_type'],
        num: ['km_truck_origin', 'trucking_origin', 'thc_origin_lolo', 'thc_dest', 'agent', 'tkbm', 'do_clean', 'risk_claim', 'marketing', 'jasa',
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
