const express = require('express');
const { queryAll, queryGet, queryRun, getLastInsertId } = require('../database/init');
const { requireAuth, requireRole } = require('../middleware/auth');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { normalizeVehicle } = require('../utils/vehicle');
const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

router.use(requireAuth);

const ADMIN_ROLES = ['superadmin', 'admin']; // tambah, ubah, hapus: hanya admin & superadmin
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

// Upload Excel daftar angkutan: kolom Number, Jenis_Angkutan (DARAT/LAUT), Nama_Truk. Nama yang sudah ada dilewati.
router.post('/upload', requireRole(...ADMIN_ROLES), upload.single('file'), (req, res) => {
    const filePath = req.file && req.file.path;
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const canon = (s) => String(s === null || s === undefined ? '' : s).toUpperCase().replace(/[\s_]+/g, '');
        const wb = xlsx.readFile(filePath);
        let added = 0, skipped = 0, found = false;
        for (const name of wb.SheetNames) {
            const aoa = xlsx.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
            const h = aoa.findIndex(r => r.some(c => canon(c) === 'JENISANGKUTAN') && r.some(c => canon(c) === 'NAMATRUK'));
            if (h < 0) continue;
            found = true;
            const ci = aoa[h].findIndex(c => canon(c) === 'JENISANGKUTAN'), ni = aoa[h].findIndex(c => canon(c) === 'NAMATRUK');
            for (const r of aoa.slice(h + 1)) {
                const jenis = canon(r[ci]);
                const cat = jenis === 'DARAT' || jenis === 'LAND' ? 'land' : (jenis === 'LAUT' || jenis === 'SEA' ? 'sea' : null);
                const nm = normalizeVehicle(r[ni]);
                if (!cat || !nm) continue;
                if (queryGet('SELECT id FROM master_kendaraan WHERE category = ? AND LOWER(name) = LOWER(?)', [cat, nm])) { skipped++; continue; }
                queryRun('INSERT INTO master_kendaraan (category, name) VALUES (?, ?)', [cat, nm.slice(0, 50)]);
                added++;
            }
        }
        if (!found) return res.status(400).json({ error: 'Header tidak ditemukan. Kolom yang dibutuhkan: Jenis_Angkutan (DARAT/LAUT) dan Nama_Truk.' });
        res.json({ added, skipped });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    } finally {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
});

router.post('/', requireRole(...ADMIN_ROLES), (req, res) => {
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

router.put('/:id', requireRole(...ADMIN_ROLES), (req, res) => {
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

router.delete('/:id', requireRole(...ADMIN_ROLES), (req, res) => {
    try {
        if (!queryGet('SELECT id FROM master_kendaraan WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Not found' });
        queryRun('DELETE FROM master_kendaraan WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

module.exports = router;
