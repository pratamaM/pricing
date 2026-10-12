const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'pricing.db');
let db = null;
let lastInsertId = 0;

// Database lama punya batasan CHECK(role IN ('admin','user','supervisor','atasan')) yang tidak bisa diubah
// dengan ALTER TABLE. Tabel users dibangun ulang (data, id, dan password tetap) agar role 'superadmin' diterima.
function migrateUsersRoleCheck() {
    const r = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
    if (!r.length || r[0].values[0][0].includes("'superadmin'")) return;

    console.log("Migrasi database: menambah role 'superadmin' pada tabel users...");
    const cols = db.exec('PRAGMA table_info(users)')[0].values.map(v => v[1]);
    const keep = ['id', 'username', 'password', 'name', 'email', 'role', 'created_at', 'updated_at'].filter(c => cols.includes(c)).join(', ');
    const fk = db.exec('PRAGMA foreign_keys')[0].values[0][0];

    db.run('PRAGMA foreign_keys = OFF');
    db.run('BEGIN');
    try {
        db.run(`CREATE TABLE users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            role TEXT NOT NULL CHECK(role IN ('superadmin', 'admin', 'user', 'supervisor', 'atasan')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`INSERT INTO users_new (${keep}) SELECT ${keep} FROM users`);
        db.run('DROP TABLE users');
        db.run('ALTER TABLE users_new RENAME TO users');
        db.run('COMMIT');
    } catch (e) {
        db.run('ROLLBACK');
        throw e;
    } finally {
        db.run(`PRAGMA foreign_keys = ${fk ? 'ON' : 'OFF'}`);
    }
}

// Tambah kolom ke tabel yang sudah ada (database lama) tanpa mengubah data.
function ensureColumn(table, column, ddl) {
    const cols = db.exec(`PRAGMA table_info(${table})`)[0].values.map(v => v[1]);
    if (!cols.includes(column)) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
        console.log(`Migrasi database: kolom ${table}.${column} ditambahkan.`);
    }
}

// Pastikan selalu ada minimal satu superadmin (tanpa itu tidak ada yang bisa memberi persetujuan akhir).
// Password awal: env SUPERADMIN_PASSWORD, atau 'superadmin123' -> WAJIB diganti setelah login pertama.
function ensureSuperadmin() {
    if (db.exec("SELECT COUNT(*) FROM users WHERE role = 'superadmin'")[0].values[0][0] > 0) return;

    const taken = (u) => { const st = db.prepare('SELECT 1 FROM users WHERE username = ?'); st.bind([u]); const f = st.step(); st.free(); return f; };
    let username = 'superadmin', n = 1;
    while (taken(username)) username = 'superadmin' + (++n);

    const password = process.env.SUPERADMIN_PASSWORD || 'superadmin123';
    db.run('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [username, bcrypt.hashSync(password, 10), 'Super Administrator', 'superadmin']);
    console.log(`Akun superadmin dibuat (username: ${username}). Segera ganti passwordnya setelah login.`);
}


async function initDb() {
    const SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }
    
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            role TEXT NOT NULL CHECK(role IN ('superadmin', 'admin', 'user', 'supervisor', 'atasan')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS master_biaya_land (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            origin_provinsi TEXT, origin_kota TEXT, origin_kecamatan TEXT,
            destination_provinsi TEXT, destination_kota TEXT, destination_kecamatan TEXT,
            km REAL, type_mobil TEXT,
            uj_sopir REAL DEFAULT 0, tip_muat REAL DEFAULT 0, tip_bongkar REAL DEFAULT 0,
            tkbm REAL DEFAULT 0, maint_fee REAL DEFAULT 0, risk_claim_it REAL DEFAULT 0,
            marketing REAL DEFAULT 0, cost_pph REAL DEFAULT 0, total REAL DEFAULT 0,
            uploaded_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(uploaded_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS master_biaya_sea (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            origin_provinsi TEXT, origin_kota TEXT, origin_kecamatan TEXT,
            destination_provinsi TEXT, destination_kota TEXT, destination_kecamatan TEXT,
            truck_type TEXT, km_truck_origin REAL,
            trucking_origin REAL DEFAULT 0, thc_origin_lolo REAL DEFAULT 0, thc_dest REAL DEFAULT 0,
            agent REAL DEFAULT 0, tkbm REAL DEFAULT 0, do_clean REAL DEFAULT 0,
            risk_claim REAL DEFAULT 0, marketing REAL DEFAULT 0, jasa REAL DEFAULT 0,
            temas_freight REAL DEFAULT 0, temas_lss REAL DEFAULT 0, temas_total_cost_pph REAL DEFAULT 0,
            meratus_freight REAL DEFAULT 0, meratus_lss REAL DEFAULT 0, meratus_total_cost_pph REAL DEFAULT 0,
            submit_value REAL DEFAULT 0,
            uploaded_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(uploaded_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS fix_cost_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_number TEXT NOT NULL UNIQUE,
            requester_id INTEGER NOT NULL,
            transport_type TEXT NOT NULL CHECK(transport_type IN ('land', 'sea')),
            origin_provinsi TEXT, origin_kota TEXT, origin_kecamatan TEXT,
            destination_provinsi TEXT, destination_kota TEXT, destination_kecamatan TEXT,
            original_cost REAL DEFAULT 0, discount_percentage REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0, fix_cost REAL DEFAULT 0,
            notes TEXT,
            truck_type TEXT, container_type TEXT, tonnage REAL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved_supervisor','rejected_supervisor','approved_atasan','rejected_atasan','approved_admin','rejected_admin')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(requester_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS fix_cost_approvals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fix_cost_request_id INTEGER NOT NULL,
            approver_id INTEGER NOT NULL,
            action TEXT NOT NULL CHECK(action IN ('approve','reject')),
            notes TEXT,
            level TEXT NOT NULL CHECK(level IN ('supervisor','atasan','admin')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(fix_cost_request_id) REFERENCES fix_cost_requests(id),
            FOREIGN KEY(approver_id) REFERENCES users(id)
        );
    `);

    migrateUsersRoleCheck();
    // Detail pengiriman pada pengajuan fix cost (diisi manual): type truck, type container (laut), tonase
    ensureColumn('fix_cost_requests', 'truck_type', 'TEXT');
    ensureColumn('fix_cost_requests', 'container_type', 'TEXT');
    ensureColumn('fix_cost_requests', 'tonnage', 'REAL');

    // Master Biaya: jenis layanan (Land = door_to_door; Sea = door_to_port / port_to_port / port_to_door) + gudang muat/bongkar
    const hadSeaService = db.exec('PRAGMA table_info(master_biaya_sea)')[0].values.some(v => v[1] === 'service_type');
    ensureColumn('master_biaya_land', 'service_type', "TEXT DEFAULT 'door_to_door'");
    ensureColumn('master_biaya_land', 'gudang_muat', 'TEXT');
    ensureColumn('master_biaya_land', 'gudang_bongkar', 'TEXT');
    ensureColumn('master_biaya_sea', 'service_type', "TEXT DEFAULT 'door_to_port'");
    ensureColumn('master_biaya_sea', 'gudang_muat', 'TEXT');
    ensureColumn('master_biaya_sea', 'gudang_bongkar', 'TEXT');
    if (!hadSeaService) console.log("Catatan: baris Master Biaya Sea lama diberi service_type 'door_to_port'; koreksi lewat Master Biaya > Edit bila perlu.");

    // Master Jasa (darat & laut) dan Master Kendaraan
    db.run(`
        CREATE TABLE IF NOT EXISTS master_jasa (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL CHECK(category IN ('land', 'sea')),
            code TEXT,
            name TEXT NOT NULL,
            amount REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS master_kendaraan (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL CHECK(category IN ('land', 'sea')),
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    if (db.exec('SELECT COUNT(*) FROM master_jasa')[0].values[0][0] === 0) {
        // code = jasa tambahan yang ditanyakan saat kalkulasi; nominal diisi lewat Master Jasa
        const jasa = [
            ['land', 'multipickup', 'Multi Pickup (per titik tambahan)'], ['land', 'multidrop', 'Multi Drop (per titik tambahan)'], ['land', 'kawalan', 'Kawalan'],
            ['sea', 'multipickup', 'Multi Pickup (per titik tambahan)'], ['sea', 'multidrop', 'Multi Drop (per titik tambahan)'], ['sea', 'kawalan', 'Kawalan'],
            ['sea', 'tkbm_dtp', 'TKBM Door to Port'], ['sea', 'tkbm_ptd', 'TKBM Port to Door']
        ];
        for (const j of jasa) db.run('INSERT INTO master_jasa (category, code, name, amount) VALUES (?, ?, ?, 0)', j);
    }
    if (db.exec('SELECT COUNT(*) FROM master_kendaraan')[0].values[0][0] === 0) {
        for (const k of [['land', '20 Feet'], ['land', '40 Feet'], ['land', 'Wingbox'], ['sea', '20 Feet'], ['sea', '40 Feet']]) {
            db.run('INSERT INTO master_kendaraan (category, name) VALUES (?, ?)', k);
        }
    }

    // Kalkulasi: layanan, gudang, jumlah truk, durasi takedown, pertanyaan biaya tambahan
    ensureColumn('fix_cost_requests', 'service_type', 'TEXT');
    ensureColumn('fix_cost_requests', 'gudang_muat', 'TEXT');
    ensureColumn('fix_cost_requests', 'gudang_bongkar', 'TEXT');
    ensureColumn('fix_cost_requests', 'truck_count', 'INTEGER DEFAULT 1');
    ensureColumn('fix_cost_requests', 'takedown_duration', 'REAL DEFAULT 0');
    ensureColumn('fix_cost_requests', 'multipickup_points', 'INTEGER DEFAULT 0');
    ensureColumn('fix_cost_requests', 'multidrop_points', 'INTEGER DEFAULT 0');
    ensureColumn('fix_cost_requests', 'kawalan', 'INTEGER DEFAULT 0');
    ensureColumn('fix_cost_requests', 'tkbm_dtp', 'TEXT');
    ensureColumn('fix_cost_requests', 'tkbm_ptd', 'TEXT');
    ensureColumn('fix_cost_requests', 'additional_cost', 'REAL DEFAULT 0');
    ensureColumn('fix_cost_requests', 'additional_detail', 'TEXT');
    ensureColumn('fix_cost_requests', 'total_cost', 'REAL');

    const res = db.exec('SELECT COUNT(*) as count FROM users');
    let count = 0;
    if (res.length > 0 && res[0].values.length > 0) {
        count = res[0].values[0][0];
    }
    
    if (count === 0) {
        const stmt = db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)');
        stmt.run(['admin', bcrypt.hashSync('admin123', 10), 'Administrator', 'admin']);
        stmt.run(['user1', bcrypt.hashSync('user123', 10), 'User Operasional', 'user']);
        stmt.run(['supervisor1', bcrypt.hashSync('super123', 10), 'Supervisor Logistik', 'supervisor']);
        stmt.run(['atasan1', bcrypt.hashSync('atasan123', 10), 'Manager Operasional', 'atasan']);
        stmt.free();
    }
    
    ensureSuperadmin();
    saveDb();
    return db;
}

function saveDb() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
    return db;
}

function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

function queryGet(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) {
        row = stmt.getAsObject();
    }
    stmt.free();
    return row;
}

function queryRun(sql, params = [], save = true) {
    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
    // db.export() di saveDb() mereset last_insert_rowid(), jadi ambil dulu sebelum simpan
    const res = db.exec('SELECT last_insert_rowid()');
    lastInsertId = res[0].values[0][0];
    if (save) saveDb();
}

function getLastInsertId() {
    return lastInsertId;
}

module.exports = { initDb, getDb, saveDb, queryAll, queryGet, queryRun, getLastInsertId };
