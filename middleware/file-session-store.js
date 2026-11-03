// Penyimpanan sesi berbasis file (tanpa dependensi baru).
// Dipakai agar login tidak hilang ketika hosting (Passenger) menjalankan beberapa proses
// atau merestart aplikasi. Setiap sesi = satu file JSON di folder sessions/.
const fs = require('fs');
const path = require('path');
const session = require('express-session');

class FileStore extends session.Store {
    constructor(dir) {
        super();
        this.dir = dir;
        this.seq = 0;
        fs.mkdirSync(dir, { recursive: true });
        setInterval(() => this.prune(), 60 * 60 * 1000).unref();
    }
    file(sid) { return path.join(this.dir, String(sid).replace(/[^A-Za-z0-9_-]/g, '_') + '.json'); }
    get(sid, cb, attempt = 0) {
        fs.readFile(this.file(sid), 'utf8', (err, txt) => {
            if (err) return cb(null, null);
            try {
                const s = JSON.parse(txt);
                if (s.cookie && s.cookie.expires && new Date(s.cookie.expires) <= new Date()) return this.destroy(sid, () => cb(null, null));
                cb(null, s);
            } catch (e) {
                // file sedang ditulis proses lain: coba lagi sebentar sebelum dianggap tidak ada
                if (attempt < 3) return setTimeout(() => this.get(sid, cb, attempt + 1), 25);
                cb(null, null);
            }
        });
    }
    set(sid, sess, cb) {
        // nama file sementara unik per penulisan supaya permintaan paralel tidak saling menimpa
        const f = this.file(sid), tmp = f + '.' + process.pid + '.' + (++this.seq) + '.' + Math.random().toString(36).slice(2) + '.tmp';
        fs.writeFile(tmp, JSON.stringify(sess), (err) => {
            if (err) return cb && cb(err);
            fs.rename(tmp, f, (e2) => { if (e2) fs.unlink(tmp, () => {}); cb && cb(e2 && e2.code === 'ENOENT' ? null : e2); });
        });
    }
    destroy(sid, cb) { fs.unlink(this.file(sid), () => cb && cb(null)); }
    // Sesi berlaku 7 hari sejak login (sama dengan cookie); tidak perlu menulis ulang file tiap permintaan
    touch(sid, sess, cb) { cb && cb(null); }
    prune() {
        fs.readdir(this.dir, (e, files) => (files || []).forEach(n => {
            const f = path.join(this.dir, n);
            fs.stat(f, (e2, st) => { if (!e2 && Date.now() - st.mtimeMs > 7 * 24 * 3600 * 1000) fs.unlink(f, () => {}); });
        }));
    }
}
module.exports = FileStore;
