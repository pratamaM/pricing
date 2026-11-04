// Versi (batch) Master Biaya. Tabel master_biaya_land / master_biaya_sea selalu berisi data AKTIF.
// Data lama yang di-expired dipindah ke tabel arsip master_biaya_<tipe>_arch (kolom sama + batch_id),
// sehingga semua query yang ada tetap hanya melihat data aktif. Admin bisa mengaktifkan versi lama kembali.
const TYPES = ['land', 'sea'];

function cols(db, table) {
    const r = db.exec(`PRAGMA table_info(${table})`);
    return r[0] ? r[0].values.map(v => v[1]) : [];
}

function count(db, sql, params = []) {
    const st = db.prepare(sql); st.bind(params); st.step();
    const v = st.getAsObject(); st.free();
    return Object.values(v)[0] || 0;
}

function ensureTables(db) {
    db.run(`CREATE TABLE IF NOT EXISTS master_upload_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        filename TEXT,
        file_path TEXT,
        row_count INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        uploaded_by INTEGER,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expired_at DATETIME,
        activated_at DATETIME,
        note TEXT
    )`);
    for (const t of TYPES) ensureArchive(db, t);
    // Data yang sudah ada sebelum fitur ini menjadi versi aktif pertama
    for (const t of TYPES) {
        const active = count(db, `SELECT COUNT(*) FROM master_upload_batches WHERE type = ? AND status = 'active'`, [t]);
        const rows = count(db, `SELECT COUNT(*) FROM master_biaya_${t}`);
        if (!active && rows) {
            db.run(`INSERT INTO master_upload_batches (type, filename, row_count, status, note) VALUES (?, ?, ?, 'active', ?)`,
                [t, 'Data awal (sebelum fitur versi)', rows, 'Dibuat otomatis dari data yang sudah ada']);
        }
    }
}

// Tabel arsip mengikuti kolom tabel utama (kolom baru ikut ditambahkan otomatis)
function ensureArchive(db, type) {
    const main = `master_biaya_${type}`, arch = `${main}_arch`;
    if (!cols(db, arch).length) db.run(`CREATE TABLE ${arch} AS SELECT * FROM ${main} WHERE 0`);
    const have = new Set(cols(db, arch));
    for (const c of cols(db, main)) if (!have.has(c)) db.run(`ALTER TABLE ${arch} ADD COLUMN ${c}`);
    if (!have.has('batch_id')) db.run(`ALTER TABLE ${arch} ADD COLUMN batch_id INTEGER`);
}

function activeBatch(db, type) {
    const st = db.prepare(`SELECT * FROM master_upload_batches WHERE type = ? AND status = 'active' ORDER BY id DESC LIMIT 1`);
    st.bind([type]); const r = st.step() ? st.getAsObject() : null; st.free();
    return r;
}

// Pindahkan seluruh data aktif ke arsip & tandai batch-nya expired. Harus dipanggil di dalam transaksi.
function expireActive(db, type) {
    ensureArchive(db, type);
    const main = `master_biaya_${type}`, arch = `${main}_arch`;
    let cur = activeBatch(db, type);
    const n = count(db, `SELECT COUNT(*) FROM ${main}`);
    if (!cur && n) {
        db.run(`INSERT INTO master_upload_batches (type, filename, row_count, status, note) VALUES (?, ?, ?, 'active', ?)`,
            [type, 'Data awal (sebelum fitur versi)', n, 'Dibuat otomatis dari data yang sudah ada']);
        cur = activeBatch(db, type);
    }
    if (!cur) return { expired: 0, batchId: null };
    const c = cols(db, main).filter(x => x !== 'id');
    if (n) {
        db.run(`INSERT INTO ${arch} (${c.join(', ')}, batch_id) SELECT ${c.join(', ')}, ${cur.id} FROM ${main}`);
        db.run(`DELETE FROM ${main}`);
    }
    db.run(`UPDATE master_upload_batches SET status = 'expired', expired_at = CURRENT_TIMESTAMP, row_count = ? WHERE id = ?`, [n, cur.id]);
    return { expired: n, batchId: cur.id };
}

function createBatch(db, type, filename, uploadedBy, rowCount) {
    db.run(`INSERT INTO master_upload_batches (type, filename, row_count, status, uploaded_by) VALUES (?, ?, ?, 'active', ?)`,
        [type, filename, rowCount, uploadedBy || null]);
    return db.exec('SELECT last_insert_rowid()')[0].values[0][0];
}

// Aktifkan kembali batch lama: data aktif sekarang di-expired, data batch itu dipulihkan. Di dalam transaksi.
function activate(db, batchId) {
    const st = db.prepare('SELECT * FROM master_upload_batches WHERE id = ?'); st.bind([batchId]);
    const b = st.step() ? st.getAsObject() : null; st.free();
    if (!b) return { error: 'Versi tidak ditemukan', code: 404 };
    if (b.status === 'active') return { error: 'Versi ini sudah aktif', code: 409 };
    const type = b.type, main = `master_biaya_${type}`, arch = `${main}_arch`;
    const { expired } = expireActive(db, type);
    const c = cols(db, main).filter(x => x !== 'id');
    db.run(`INSERT INTO ${main} (${c.join(', ')}) SELECT ${c.join(', ')} FROM ${arch} WHERE batch_id = ?`, [batchId]);
    db.run(`DELETE FROM ${arch} WHERE batch_id = ?`, [batchId]);
    const n = count(db, `SELECT COUNT(*) FROM ${main}`);
    db.run(`UPDATE master_upload_batches SET status = 'active', activated_at = CURRENT_TIMESTAMP, expired_at = NULL, row_count = ? WHERE id = ?`, [n, batchId]);
    return { type, expired, restored: n };
}

module.exports = { ensureTables, ensureArchive, expireActive, createBatch, activate, activeBatch, cols };
