const express = require('express');
const bcrypt = require('bcryptjs');
const { queryGet } = require('../database/init');
const router = express.Router();

router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const user = queryGet('SELECT * FROM users WHERE username = ?', [username]);
        
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;
            req.session.name = user.name;
            
            const userData = { id: user.id, username: user.username, role: user.role, name: user.name };
            return res.json(userData);
        }
        res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

router.get('/check', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ 
            id: req.session.userId, 
            username: req.session.username, 
            role: req.session.role, 
            name: req.session.name 
        });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

module.exports = router;
