const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDb } = require('./database/init');
const FileStore = require('./middleware/file-session-store');

const app = express();
const PORT = process.env.PORT || 3000; // hosting (cPanel/Passenger) mengatur port lewat PORT

// Sub-alamat (mis. https://domain.com/pricing/). Di cPanel, PASSENGER_BASE_URI biasanya terisi otomatis;
// jika aplikasi tetap 404 di sub-alamat, set environment variable BASE_PATH=/pricing.
const BASE_PATH = (process.env.BASE_PATH || process.env.PASSENGER_BASE_URI || '').replace(/\/+$/, '');
if (BASE_PATH) {
    app.use((req, res, next) => {
        const q = req.url.indexOf('?');
        const pathname = q === -1 ? req.url : req.url.slice(0, q);
        const qs = q === -1 ? '' : req.url.slice(q);
        if (pathname === BASE_PATH) return res.redirect(301, BASE_PATH + '/' + qs);       // /pricing -> /pricing/
        if (pathname.startsWith(BASE_PATH + '/')) req.url = (pathname.slice(BASE_PATH.length) || '/') + qs; // buang prefix
        next();
    });
}

// Jika hosting meneruskan alamat lengkap tanpa membuang sub-alamat (mis. /pricing/api/auth/login),
// buang awalan sebelum "/api/" agar rute API tetap cocok. Tanpa menyimpan status (aman).
app.use((req, res, next) => {
    const m = req.url.match(/^(\/.+?)\/api(\/|\?|$)/);
    if (m) req.url = req.url.slice(m[1].length);
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    store: new FileStore(path.join(__dirname, 'sessions')),
    secret: process.env.SESSION_SECRET || 'pricing-secret-key-2026', // di server produksi, set SESSION_SECRET
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 3600 * 1000 }
}));

async function startServer() {
    await initDb();

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/users', require('./routes/users'));
    app.use('/api/master-biaya', require('./routes/master-biaya'));
    app.use('/api/master-kendaraan', require('./routes/master-kendaraan'));
    app.use('/api/fix-cost', require('./routes/fix-cost'));
    app.use('/api/dashboard', require('./routes/dashboard'));
    app.use('/api/upload', require('./routes/upload'));

    // API yang tidak dikenal dijawab JSON (bukan halaman HTML) supaya pesan errornya terbaca di browser
    app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint tidak ditemukan' }));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

startServer();
