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
        fs.mkdirSync(dir, { recursive: true });
        setInterval(() => this.prune(), 60 * 60 * 1000).unref();
    }
    file(sid) { return path.join(this.dir, String(sid).replace(/[^A-Za-z0-9_-]/g, '_') + '.json'); }
    get(sid, cb) {
        fs.readFile(this.file(sid), 'utf8', (err, txt) => {
            if (err) return cb(null, null);
            try {
                const s = JSON.parse(txt);
                if (s.cookie && s.cookie.expires && new Date(s.cookie.expires) <= new Date()) return this.destroy(sid, () => cb(null, null));
                cb(null, s);
            } catch (e) { cb(null, null); }
        });
    }
    set(sid, sess, cb) {
        const f = this.file(sid), tmp = f + '.' + process.pid + '.tmp';
        fs.writeFile(tmp, JSON.stringify(sess), (err) => err ? cb(err) : fs.rename(tmp, f, cb));
    }
    destroy(sid, cb) { fs.unlink(this.file(sid), () => cb && cb(null)); }
    touch(sid, sess, cb) { this.set(sid, sess, cb); }
    prune() {
        fs.readdir(this.dir, (e, files) => (files || []).forEach(n => {
            const f = path.join(this.dir, n);
            fs.stat(f, (e2, st) => { if (!e2 && Date.now() - st.mtimeMs > 7 * 24 * 3600 * 1000) fs.unlink(f, () => {}); });
        }));
    }
}
module.exports = FileStore;
