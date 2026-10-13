const express = require('express');
const { queryAll, queryGet, queryRun, getLastInsertId } = require('../database/init');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

const ADMIN_ROLES = ['superadmin', 'admin']; // tambah, ubah, hapus: hanya admin & superadmin
const errMsg = (err) => (err && err.message) ? err.message : String(err);

router.get('/', (req, res) => {
    try {
        const cat = ['land', 'sea'].includes(req.query.category) ? req.query.category : null;
        const rows = cat
            ? queryAll('SELECT * FROM master_jasa WHERE category = ? ORDER BY id', [cat])
            : queryAll('SELECT * FROM master_jasa ORDER BY category, id');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

function parseBody(body) {
    const name = String(body.name || '').trim().slice(0, 100);
    const amount = (body.amount === '' || body.amount === null || body.amount === undefined) ? 0 : Number(body.amount);
    if (!name) return { error: 'Nama jasa wajib diisi' };
    if (!Number.isFinite(amount) || amount < 0) return { error: 'Nominal harus berupa angka >= 0' };
    return { name, amount };
}

router.post('/', requireRole(...ADMIN_ROLES), (req, res) => {
    try {
        if (!['land', 'sea'].includes(req.body.category)) return res.status(400).json({ error: 'category harus land atau sea' });
        const p = parseBody(req.body);
        if (p.error) return res.status(400).json({ error: p.error });
        queryRun('INSERT INTO master_jasa (category, code, name, amount) VALUES (?, NULL, ?, ?)', [req.body.category, p.name, p.amount]);
        res.json({ id: getLastInsertId() });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

router.put('/:id', requireRole(...ADMIN_ROLES), (req, res) => {
    try {
        if (!queryGet('SELECT id FROM master_jasa WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Not found' });
        const p = parseBody(req.body);
        if (p.error) return res.status(400).json({ error: p.error });
        queryRun('UPDATE master_jasa SET name = ?, amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [p.name, p.amount, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

// Jasa bawaan (punya code, dipakai pertanyaan kalkulasi) tidak boleh dihapus; hanya jasa tambahan.
router.delete('/:id', requireRole(...ADMIN_ROLES), (req, res) => {
    try {
        const row = queryGet('SELECT id, code FROM master_jasa WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Not found' });
        if (row.code) return res.status(400).json({ error: 'Jasa bawaan tidak bisa dihapus (nominalnya bisa diubah)' });
        queryRun('DELETE FROM master_jasa WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

module.exports = router;
