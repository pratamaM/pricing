const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { queryRun, saveDb, getDb } = require('../database/init');
const { requireRole } = require('../middleware/auth');
const { normalizeVehicle } = require('../utils/vehicle');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

// Upload master biaya: superadmin, admin (setting), supervisor, atasan
router.use(requireRole('superadmin', 'admin')); // upload Excel hanya admin & superadmin

// ---- Definisi kolom ----
// Nama header dibandingkan setelah dikanonkan: huruf besar, semua spasi/garis bawah dibuang. Jadi "UJ SUPIR ", "uj  sopir"
// dan "UJ_SOPIR" dianggap sama. Satu kolom boleh punya beberapa nama alias (termasuk salah ketik di file asli, mis. "DESTINATON KOTA").
// Header yang muncul dua kali dalam satu sheet dibaca berurutan: kemunculan ke-2 diberi akhiran "#2" (dipakai template Jawa_Barat).
const canon = (s) => String(s === null || s === undefined ? '' : s).toUpperCase().replace(/[\s_]+/g, '');
const t = (col, ...headers) => ({ col, kind: 'text', headers: headers.map(canon) });
const n = (col, ...headers) => ({ col, kind: 'num', headers: headers.map(canon) });
const nn = (col, noteCol, ...headers) => ({ col, kind: 'num', noteCol, headers: headers.map(canon) }); // angka; bila sel berisi teks (mis. "Include Agent", "FOT") teksnya disimpan sebagai catatan
const veh = (col, ...headers) => ({ col, kind: 'vehicle', headers: headers.map(canon) });

const LOC = [
    t('origin_provinsi', 'ORIGIN PROVINSI', 'GUDANG MUAT PROVINSI'),
    t('origin_kota', 'ORIGIN KOTA/KABUPATEN', 'ORIGIN KOTA', 'ORIGIN KABUPATEN', 'GUDANG MUAT KOTA'),
    t('origin_kecamatan', 'ORIGIN KECAMATAN', 'GUDANG MUAT KECAMATAN'),
    t('destination_provinsi', 'DESTINATION PROVINSI', 'DESTINATON PROVINSI', 'GUDANG BONGKAR PROVINSI'),
    t('destination_kota', 'DESTINATION KOTA/KABUPATEN', 'DESTINATION KOTA', 'DESTINATON KOTA', 'DESTINATION KABUPATEN', 'GUDANG BONGKAR KOTA', 'GUDANG MUAT BONGKAR KOTA'),
    t('destination_kecamatan', 'DESTINATION KECAMATAN', 'DESTINATON KECAMATAN', 'GUDANG BONGKAR KECAMATAN', 'GUDANG MUAT KECAMATAN#2')
];

// Jenis layanan: land selalu door_to_door; sea dibaca dari kolom "SERVICE TYPE" (Door to Port / Port to Port / Port to Door).
// Bila kolom itu tidak ada/kosong: ada biaya trucking origin -> Door to Port, selain itu Port to Port (bisa dikoreksi lewat Master Biaya > Edit).
const SVC_SEA = { 'DOORTOPORT': 'door_to_port', 'PORTTOPORT': 'port_to_port', 'PORTTODOOR': 'port_to_door' };
const svcLand = { col: 'service_type', kind: 'const', value: 'door_to_door', headers: [] };
const svcSea = { col: 'service_type', kind: 'svc', headers: ['SERVICE TYPE', 'SERVICE', 'JENIS LAYANAN', 'LAYANAN'].map(canon) };
const GUDANG = [t('gudang_muat', 'GUDANG MUAT', 'ASAL'), t('gudang_bongkar', 'GUDANG BONGKAR')];

const SPEC = {
    land: [...LOC, svcLand, ...GUDANG,
        n('km', 'KM'), veh('type_mobil', 'UNIT', 'TYPE MOBIL', 'TYPE TRUCK', 'TRUCK TYPE'),
        n('uj_sopir', 'UJ SOPIR', 'UJ SUPIR'), n('tip_muat', 'TIP MUAT'), n('tip_bongkar', 'TIP BONGKAR'), n('tkbm', 'TKBM'),
        n('maint_fee', 'MAINT. FEE', 'MANT. FEE', 'MAINT FEE', 'MANT FEE'), n('risk_claim_it', 'RISK CLAIM + IT', 'RISK CLAIM/IT', 'RISK CLAIM IT'),
        n('total_cost', 'TOTAL COST'),
        n('marketing', 'MARKETING'),
        n('cost_pph', 'COST + PPH', 'TOTAL COST + PROFIT + PPH'),
        n('total', 'SUBMIT', 'TOTAL'),
        n('jasa', 'JASA')],
    sea: [...LOC, svcSea, ...GUDANG,
        t('port_origin', 'PORT ORIGIN'), t('port_destination', 'PORT DESTINATION'),
        veh('truck_type', 'TRUCK TYPE', 'TYPE TRUCK', 'UNIT'), n('km_truck_origin', 'KM TRUCK ORIGIN', 'KM'),
        n('trucking_origin', 'TRUCKING ORIGIN'),
        n('maint_fee', 'MAINT FEE (2500x KM)', 'MAINT FEE', 'MAINT. FEE', 'MANT. FEE'),
        n('investasi_truck', 'INVESTASI TRUCK', 'IKNVESTASI TRUCK'),
        n('thc_origin_lolo', 'THC ORIGIN + LOLO ORIGIN'), nn('thc_dest', 'thc_dest_note', 'THC DEST'),
        n('agent', 'AGENT'), nn('tkbm', 'tkbm_note', 'TKBM'), n('do_clean', 'DO+CLEAN', 'DO + CLEAN'), n('risk_claim', 'RISK CLAIM'),
        n('marketing', 'MARKETING'), n('profit', 'PROFIT'), n('jasa', 'JASA'),
        n('temas_freight', 'TEMAS FREIGHT'), n('temas_lss', 'TEMAS LSS', 'TEMAS FS(LSS)'), n('temas_total_cost_pph', 'TEMAS TOTAL COST + PPH'),
        n('meratus_freight', 'MERATUS FREIGHT'), n('meratus_lss', 'MERATUS LSS', 'MERATUS FS(LSS)'), n('meratus_total_cost_pph', 'MERATUS TOTAL COST + PPH'),
        n('submit_value', 'SUBMIT')]
};
// Kolom catatan (teks) di luar spec utama
const NOTE_COLS = { land: [], sea: ['thc_dest_note', 'tkbm_note'] };

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

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const looksNumeric = (v) => typeof v === 'number' || /^[\s\d.,-]+$/.test(String(v));

// Cari baris header (baris 1-8, tempat judul bisa ada di atasnya), gabungkan header dua tingkat
// (mis. "TEMAS" di atas "FREIGHT" / "FS(LSS)" / "TOTAL COST + PPH"), dan petakan tiap kolom spec ke nomor kolom sheet.
function locateColumns(aoa, spec) {
    const locAliases = new Set(LOC.flatMap(l => l.headers));
    let h = -1;
    for (let i = 0; i < Math.min(aoa.length, 8); i++) {
        const hits = (aoa[i] || []).filter(c => !isBlank(c) && locAliases.has(canon(c))).length;
        if (hits >= 2) { h = i; break; }
    }
    if (h < 0) return null;

    const top = aoa[h] || [], nxt = aoa[h + 1] || [];
    const width = Math.max(top.length, nxt.length);
    // Baris berikutnya adalah sub-header bila kolom lokasinya kosong semua tetapi ada label teks (mis. FREIGHT, FS(LSS)).
    const locCols = [];
    top.forEach((c, i) => { if (!isBlank(c) && locAliases.has(canon(c))) locCols.push(i); });
    const nextIsSub = locCols.every(i => isBlank(nxt[i])) && nxt.some(c => !isBlank(c) && !looksNumeric(c));

    const names = [];
    let group = '';
    for (let i = 0; i < width; i++) {
        const a = isBlank(top[i]) ? '' : String(top[i]).trim();
        const b = nextIsSub && !isBlank(nxt[i]) ? String(nxt[i]).trim() : '';
        if (a) group = a;
        names.push(b ? ((a || group) + ' ' + b) : a);
    }

    const seen = {};
    const index = {}; // nama kanon -> nomor kolom
    names.forEach((nm, i) => {
        if (!nm) return;
        const k = canon(nm);
        seen[k] = (seen[k] || 0) + 1;
        index[seen[k] === 1 ? k : k + '#' + seen[k]] = i;
    });

    const colOf = {};
    const used = new Set();
    for (const sp of spec) {
        for (const alias of sp.headers) {
            if (index[alias] !== undefined && !used.has(index[alias])) { colOf[sp.col] = index[alias]; used.add(index[alias]); break; }
        }
    }
    return { colOf, dataStart: h + (nextIsSub ? 2 : 1) };
}

function handleUpload(type) {
    return (req, res) => {
        const filePath = req.file && req.file.path;
        try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

            const spec = SPEC[type];
            const cols = [...spec.map(s => s.col), ...NOTE_COLS[type], 'uploaded_by'];
            const sql = `INSERT INTO master_biaya_${type} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;

            const workbook = xlsx.readFile(filePath);
            const toInsert = [], sheets = [], skippedSheets = [];

            // Baca SEMUA sheet. Baris header dicari otomatis (di antara 8 baris pertama), data mulai setelahnya.
            for (const name of workbook.SheetNames) {
                const aoa = xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null, blankrows: true });
                const loc = locateColumns(aoa, spec);
                if (!loc || (loc.colOf.origin_kecamatan === undefined && loc.colOf.destination_kecamatan === undefined)) {
                    skippedSheets.push(name);
                    continue;
                }

                let c = 0, prevOrigin = null;
                const sheetProv = name.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim() || null;
                for (let r = loc.dataStart; r < aoa.length; r++) {
                    const line = aoa[r] || [];
                    const get = (col) => (loc.colOf[col] === undefined ? null : line[loc.colOf[col]]);

                    const o = { prov: toText(get('origin_provinsi')), kota: toText(get('origin_kota')), kec: toText(get('origin_kecamatan')) };
                    const d = { prov: toText(get('destination_provinsi')), kota: toText(get('destination_kota')), kec: toText(get('destination_kecamatan')) };
                    const originEmpty = !o.prov && !o.kota && !o.kec;
                    const destEmpty = !d.prov && !d.kota && !d.kec;
                    if (originEmpty && destEmpty) continue; // baris kosong / baris nomor saja (template)

                    // Kolom provinsi kosong -> pakai provinsi dari nama sheet (mis. sheet "Jakarta", "Jawa_Barat" -> "Jawa Barat").
                    if (!o.prov) o.prov = sheetProv;
                    if (!d.prov) d.prov = sheetProv;

                    // Sel origin yang digabung (merge) di Excel hanya terisi di baris pertama -> baris berikutnya memakai origin di atasnya.
                    if (originEmpty && prevOrigin) Object.assign(o, prevOrigin);
                    // Kecamatan kosong -> pakai nama kota, supaya bisa dipilih di Hitung Fix Cost.
                    if (!o.kec && o.kota) o.kec = o.kota;
                    if (!d.kec && d.kota) d.kec = d.kota;
                    prevOrigin = { prov: o.prov, kota: o.kota, kec: o.kec };

                    const notes = {};
                    let badService = null;
                    const vals = spec.map(s => {
                        switch (s.col) {
                            case 'origin_provinsi': return o.prov;
                            case 'origin_kota': return o.kota;
                            case 'origin_kecamatan': return o.kec;
                            case 'destination_provinsi': return d.prov;
                            case 'destination_kota': return d.kota;
                            case 'destination_kecamatan': return d.kec;
                        }
                        if (s.kind === 'const') return s.value;
                        const v = get(s.col);
                        if (s.kind === 'svc') {
                            const key = toText(v) === null ? null : canon(String(v).replace(/-/g, ''));
                            if (key === null) return null; // ditentukan di bawah dari biaya trucking origin
                            if (!SVC_SEA[key]) { badService = String(v); return null; }
                            return SVC_SEA[key];
                        }
                        if (s.kind === 'vehicle') return normalizeVehicle(v);
                        if (s.kind === 'num') {
                            if (s.noteCol && !isBlank(v) && !looksNumeric(v)) { notes[s.noteCol] = toText(v); return 0; }
                            return toNum(v);
                        }
                        return toText(v);
                    });
                    if (badService !== null) throw new Error(`Service type tidak dikenal: "${badService}" (sheet ${name}). Gunakan Door to Port, Port to Port, atau Port to Door.`);

                    if (type === 'sea') {
                        const si = spec.findIndex(s => s.col === 'service_type');
                        if (vals[si] === null) vals[si] = vals[spec.findIndex(s => s.col === 'trucking_origin')] > 0 ? 'door_to_port' : 'port_to_port';
                    }

                    toInsert.push([...vals, ...NOTE_COLS[type].map(k => notes[k] || null), req.session.userId]);
                    c++;
                }
                sheets.push({ name, rows: c });
            }

            if (toInsert.length === 0) {
                return res.status(400).json({
                    error: 'Tidak ada baris yang bisa diimpor. Pastikan ada baris header (ORIGIN/DESTINATION ... ) dan minimal satu baris data.'
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
