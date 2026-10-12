const express = require('express');
const bcrypt = require('bcryptjs');
const { queryAll, queryGet, queryRun, getLastInsertId } = require('../database/init');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Konfigurasi User: superadmin, admin (setting), dan user (sesuai menu di UI)
router.use(requireRole('superadmin', 'admin', 'user'));

const VALID_ROLES = ['superadmin', 'admin', 'user', 'supervisor', 'atasan'];
const isSuper = (req) => req.session.role === 'superadmin';
const superCount = () => queryGet("SELECT COUNT(*) AS c FROM users WHERE role = 'superadmin'").c;
const NEED_SUPER = 'Hanya superadmin yang boleh membuat, mengubah, atau menghapus akun superadmin';
const errMsg = (err) => (err && err.message) ? err.message : String(err);

router.get('/', (req, res) => {
    try {
        const users = queryAll('SELECT id, username, name, email, role, created_at, updated_at FROM users');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

router.post('/', (req, res) => {
    try {
        const { username, password, name, email, role } = req.body;
        if (!username || !password || !name) return res.status(400).json({ error: 'username, password, dan name wajib diisi' });
        if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Role tidak valid' });
        if (role === 'superadmin' && !isSuper(req)) return res.status(403).json({ error: NEED_SUPER });
        if (queryGet('SELECT id FROM users WHERE username = ?', [username])) return res.status(409).json({ error: 'Username sudah dipakai' });
        const hash = bcrypt.hashSync(password, 10);
        queryRun('INSERT INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)', [username, hash, name, email || null, role]);
        res.json({ id: getLastInsertId() });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

router.put('/:id', (req, res) => {
    try {
        const { username, password, name, email, role } = req.body;
        if (!username || !name) return res.status(400).json({ error: 'username dan name wajib diisi' });
        if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Role tidak valid' });
        const target = queryGet('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
        if (!target) return res.status(404).json({ error: 'User tidak ditemukan' });
        if ((target.role === 'superadmin' || role === 'superadmin') && !isSuper(req)) return res.status(403).json({ error: NEED_SUPER });
        if (target.role === 'superadmin' && role !== 'superadmin' && superCount() <= 1) return res.status(400).json({ error: 'Harus ada minimal satu superadmin' });
        if (queryGet('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.params.id])) return res.status(409).json({ error: 'Username sudah dipakai' });
        
        if (password) {
            const hash = bcrypt.hashSync(password, 10);
            queryRun('UPDATE users SET username = ?, password = ?, name = ?, email = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [username, hash, name, email || null, role, req.params.id]);
        } else {
            queryRun('UPDATE users SET username = ?, name = ?, email = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [username, name, email || null, role, req.params.id]);
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

router.delete('/:id', (req, res) => {
    try {
        if (String(req.params.id) === String(req.session.userId)) return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
        const target = queryGet('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
        if (!target) return res.status(404).json({ error: 'User tidak ditemukan' });
        if (target.role === 'superadmin' && !isSuper(req)) return res.status(403).json({ error: NEED_SUPER });
        if (target.role === 'superadmin' && superCount() <= 1) return res.status(400).json({ error: 'Harus ada minimal satu superadmin' });
        queryRun('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: errMsg(err) });
    }
});

module.exports = router;
