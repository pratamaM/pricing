const express = require('express');
const { queryAll, queryGet, queryRun, getLastInsertId } = require('../database/init');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

const EDIT_ROLES = ['superadmin', 'admin', 'supervisor', 'atasan'];
const ADD_ROLES = ['superadmin', 'admin']; // tambah jasa / kendaraan hanya admin & superadmin
const errMsg = (err) => (err && err.message) ? err.message : String(err);

router.get('/', (req, res) => {
    try {
        const cat = ['land', 'sea'].includes(req.query.category) ? req.query.category : null;
        const rows = cat
            ? queryAll('SELECT * FROM master_kendaraan WHERE category = ? ORDER BY id', [cat])
            : queryAll('SELECT * FROM master_kendaraan ORDER BY category, id');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

router.post('/', requireRole(...ADD_ROLES), (req, res) => {
    try {
        const { category } = req.body;
        const name = String(req.body.name || '').trim().slice(0, 50);
        if (!['land', 'sea'].includes(category)) return res.status(400).json({ error: 'category harus land atau sea' });
        if (!name) return res.status(400).json({ error: 'Nama kendaraan wajib diisi' });
        if (queryGet('SELECT id FROM master_kendaraan WHERE category = ? AND LOWER(name) = LOWER(?)', [category, name])) return res.status(409).json({ error: 'Kendaraan sudah ada' });
        queryRun('INSERT INTO master_kendaraan (category, name) VALUES (?, ?)', [category, name]);
        res.json({ id: getLastInsertId() });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

router.put('/:id', requireRole(...EDIT_ROLES), (req, res) => {
    try {
        const row = queryGet('SELECT id, category FROM master_kendaraan WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Not found' });
        const name = String(req.body.name || '').trim().slice(0, 50);
        if (!name) return res.status(400).json({ error: 'Nama kendaraan wajib diisi' });
        if (queryGet('SELECT id FROM master_kendaraan WHERE category = ? AND LOWER(name) = LOWER(?) AND id != ?', [row.category, name, row.id])) return res.status(409).json({ error: 'Kendaraan sudah ada' });
        queryRun('UPDATE master_kendaraan SET name = ? WHERE id = ?', [name, row.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

router.delete('/:id', requireRole(...EDIT_ROLES), (req, res) => {
    try {
        if (!queryGet('SELECT id FROM master_kendaraan WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Not found' });
        queryRun('DELETE FROM master_kendaraan WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

module.exports = router;
