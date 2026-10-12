const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { queryRun, saveDb, getDb } = require('../database/init');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

// Upload master biaya: superadmin, admin (setting), supervisor, atasan
router.use(requireRole('superadmin', 'admin', 'supervisor', 'atasan'));

// ---- Definisi kolom ----
// Header Excel dibandingkan setelah dinormalisasi (huruf besar, spasi ganda/spasi di ujung dibuang),
// jadi "UJ SOPIR " dan "uj  sopir" tetap terbaca. Satu kolom boleh punya beberapa nama alias.
const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toUpperCase();
const t = (col, ...headers) => ({ col, kind: 'text', headers });
const n = (col, ...headers) => ({ col, kind: 'num', headers });

const LOC = [
    t('origin_provinsi', 'ORIGIN PROVINSI'), t('origin_kota', 'ORIGIN KOTA/KABUPATEN'), t('origin_kecamatan', 'ORIGIN KECAMATAN'),
    t('destination_provinsi', 'DESTINATION PROVINSI'), t('destination_kota', 'DESTINATION KOTA/KABUPATEN'), t('destination_kecamatan', 'DESTINATION KECAMATAN')
];

// Jenis layanan: land selalu door_to_door; sea dibaca dari kolom "SERVICE TYPE" (Door to Port / Port to Port / Port to Door).
const SVC_SEA = { 'DOOR TO PORT': 'door_to_port', 'PORT TO PORT': 'port_to_port', 'PORT TO DOOR': 'port_to_door' };
const svcLand = { col: 'service_type', kind: 'const', value: 'door_to_door', headers: [] };
const svcSea = { col: 'service_type', kind: 'svc', headers: ['SERVICE TYPE', 'SERVICE', 'JENIS LAYANAN', 'LAYANAN'] };
const GUDANG = [t('gudang_muat', 'GUDANG MUAT'), t('gudang_bongkar', 'GUDANG BONGKAR')];

const SPEC = {
    land: [...LOC, svcLand, ...GUDANG,
        n('km', 'KM'), t('type_mobil', 'TYPE MOBIL', 'TYPE TRUCK'),
        n('uj_sopir', 'UJ SOPIR'), n('tip_muat', 'TIP MUAT'), n('tip_bongkar', 'TIP BONGKAR'), n('tkbm', 'TKBM'),
        n('maint_fee', 'MAINT. FEE'), n('risk_claim_it', 'RISK CLAIM + IT'), n('marketing', 'MARKETING'),
        n('cost_pph', 'COST + PPH'), n('total', 'TOTAL')],
    sea: [...LOC, svcSea, ...GUDANG,
        t('truck_type', 'TRUCK TYPE'), n('km_truck_origin', 'KM TRUCK ORIGIN'),
        n('trucking_origin', 'TRUCKING ORIGIN'), n('thc_origin_lolo', 'THC ORIGIN + LOLO ORIGIN'), n('thc_dest', 'THC DEST'),
        n('agent', 'AGENT'), n('tkbm', 'TKBM'), n('do_clean', 'DO+CLEAN'), n('risk_claim', 'RISK CLAIM'),
        n('marketing', 'MARKETING'), n('jasa', 'JASA'),
        n('temas_freight', 'TEMAS FREIGHT'), n('temas_lss', 'TEMAS LSS'), n('temas_total_cost_pph', 'TEMAS TOTAL COST + PPH'),
        n('meratus_freight', 'MERATUS FREIGHT'), n('meratus_lss', 'MERATUS LSS'), n('meratus_total_cost_pph', 'MERATUS TOTAL COST + PPH'),
        n('submit_value', 'SUBMIT')]
};

function toText(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
}

function toNum(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v === null || v === undefined) return 0;
    let s = String(v).replace(/[^\d.,-]/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // format Indonesia 1.500.000,50
    else s = s.replace(',', '.');
    const x = Number(s);
    return Number.isFinite(x) ? x : 0;
}

function handleUpload(type) {
    return (req, res) => {
        const filePath = req.file && req.file.path;
        try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

            const spec = SPEC[type];
            const cols = [...spec.map(s => s.col), 'uploaded_by'];
            const sql = `INSERT INTO master_biaya_${type} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;

            const workbook = xlsx.readFile(filePath);
            const toInsert = [], sheets = [], skippedSheets = [];

            // Baca SEMUA sheet. Baris 1 = judul, baris 2 = header, data mulai baris 3.
            for (const name of workbook.SheetNames) {
                const sheet = workbook.Sheets[name];
                const headerRow = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 1, defval: null })[0] || [];
                const known = new Set(headerRow.filter(h => h !== null).map(norm));
                if (!known.has('ORIGIN KECAMATAN') && !known.has('DESTINATION KECAMATAN')) {
                    skippedSheets.push(name);
                    continue;
                }

                let c = 0;
                for (const raw of xlsx.utils.sheet_to_json(sheet, { range: 1, defval: null })) {
                    const row = {};
                    for (const k of Object.keys(raw)) row[norm(k)] = raw[k];

                    let badService = null;
                    const vals = spec.map(s => {
                        if (s.kind === 'const') return s.value;
                        let v = null;
                        for (const h of s.headers) {
                            if (row[h] !== undefined && row[h] !== null && row[h] !== '') { v = row[h]; break; }
                        }
                        if (s.kind === 'svc') {
                            const key = toText(v) === null ? null : norm(String(v).replace(/[_-]/g, ' '));
                            if (key === null) return 'port_to_port'; // kolom kosong -> diasumsikan Port to Port; koreksi lewat Edit
                            if (!SVC_SEA[key]) { badService = String(v); return null; }
                            return SVC_SEA[key];
                        }
                        return s.kind === 'num' ? toNum(v) : toText(v);
                    });

                    // Baris dilewati hanya jika ke-6 kolom lokasi kosong semua.
                    // Baris yang baru berisi ORIGIN (tujuan & biaya kosong) tetap diimpor untuk dilengkapi lewat web.
                    if (!vals.slice(0, 6).some(v => v !== null)) continue;
                    if (badService !== null) throw new Error(`Service type tidak dikenal: "${badService}" (sheet ${name}). Gunakan Door to Port, Port to Port, atau Port to Door.`);

                    toInsert.push([...vals, req.session.userId]);
                    c++;
                }
                sheets.push({ name, rows: c });
            }

            if (toInsert.length === 0) {
                return res.status(400).json({
                    error: 'Tidak ada baris yang bisa diimpor. Pastikan baris ke-2 berisi header (ORIGIN/DESTINATION ...) dan ada minimal satu baris data.'
                        + (skippedSheets.length ? ` Sheet dilewati karena header tidak dikenali: ${skippedSheets.join(', ')}.` : '')
                });
            }

            // Satu transaksi: kalau ada yang gagal, tidak ada baris setengah masuk.
            const db = getDb();
            db.run('BEGIN');
            try {
                for (const p of toInsert) queryRun(sql, p, false);
                db.run('COMMIT');
            } catch (e) {
                db.run('ROLLBACK');
                throw e;
            }
            saveDb();

            res.json({ message: 'Success', rowsInserted: toInsert.length, sheets, skippedSheets });
        } catch (err) {
            res.status(500).json({ error: (err && err.message) ? err.message : String(err) });
        } finally {
            if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    };
}

router.post('/land', upload.single('file'), handleUpload('land'));
router.post('/sea', upload.single('file'), handleUpload('sea'));

module.exports = router;
