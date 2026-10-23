const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { queryRun, queryGet, saveDb, getDb } = require('../database/init');
const { requireRole } = require('../middleware/auth');
const { normalizeVehicle } = require('../utils/vehicle');
const { provinceFor } = require('../utils/wilayah');

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
function locateColumns(aoa, spec, anchors) {
    const locAliases = new Set(anchors || LOC.flatMap(l => l.headers));
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

// ---- Upload SEA dari master terpisah (file "master sea untuk upload") ----
// Satu file berisi 6 sheet master. Aplikasi menggabungkannya jadi baris Master Biaya Sea lengkap:
//   MASTER TRUCKING ORIGIN      : origin, port, type truck, KM, trucking, maint fee, investasi truck
//   MASTER TRUCKING DESTINATION : destination, type truck, agent
//   MASTER PORT OF LOAD         : THC origin + LOLO per port & type truck
//   MASTER PORT OF DISC         : THC dest per port tujuan & type truck
//   MASTER PTP                  : freight & FS(LSS) Temas / Meratus per port asal, port tujuan, type truck
//   MASTER OTHERS               : DO+CLEAN, risk claim, marketing per type truck (opsional: PROFIT, MARGIN SUBMIT)
// Rumus (cocok dengan file hasil): Total = (semua biaya + profit + freight + LSS) / 0.98 (PPH 2%);
// Submit = (Total Temas + margin) dibulatkan ke atas per 10.000. Profit bawaan 1.500.000, margin Submit bawaan 500.000.
const PPH_DIVISOR = 0.98, DEFAULT_PROFIT = 1500000, DEFAULT_SUBMIT_MARGIN = 500000;
const SEA_MASTER_SHEETS = {
    origin: { sheet: 'MASTER TRUCKING ORIGIN', spec: [t('kota', 'ORIGIN KOTA'), t('kec', 'ORIGIN KECAMATAN'), t('port', 'PORT', 'PORT ORIGIN'), t('truck', 'TRUCK TYPE'),
        n('km', 'KM TRUCK ORIGIN', 'KM'), n('trucking', 'TRUCKING ORIGIN'), n('maint', 'MAINT FEE (2500x KM)', 'MAINT FEE'), n('invest', 'INVESTASI TRUCK', 'IKNVESTASI TRUCK')] },
    dest: { sheet: 'MASTER TRUCKING DESTINATION', spec: [t('kota', 'DESTINATION KOTA'), t('kec', 'DESTINATION KECAMATAN'), t('truck', 'TRUCK TYPE'), n('agent', 'AGENT')] },
    load: { sheet: 'MASTER PORT OF LOAD', spec: [t('port', 'PORT ORIGIN', 'PORT OF LOAD', 'PORT'), t('truck', 'TRUCK TYPE'), n('thc', 'THC ORIGIN + LOLO ORIGIN')] },
    disc: { sheet: 'MASTER PORT OF DISC', spec: [t('port', 'PORT DESTINATION', 'PORT OF DISC', 'PORT'), t('truck', 'TRUCK TYPE'), n('thc', 'THC DEST')] },
    ptp: { sheet: 'MASTER PTP', spec: [t('from', 'PORT ORIGIN'), t('to', 'PORT DESTINATION'), t('truck', 'TRUCK TYPE'),
        n('tF', 'TEMAS FREIGHT'), n('tL', 'TEMAS FS(LSS)', 'TEMAS LSS'), n('mF', 'MERATUS FREIGHT'), n('mL', 'MERATUS FS(LSS)', 'MERATUS LSS')] },
    others: { sheet: 'MASTER OTHERS', spec: [t('truck', 'TRUCK TYPE'), n('doClean', 'DO+CLEAN', 'DO + CLEAN'), n('risk', 'RISK CLAIM'), n('marketing', 'MARKETING'),
        n('profit', 'PROFIT'), n('margin', 'MARGIN SUBMIT', 'SUBMIT MARGIN')] }
};

const isSeaMasterWorkbook = (wb) => {
    const names = new Set(wb.SheetNames.map(canon));
    return names.has(canon(SEA_MASTER_SHEETS.origin.sheet)) && names.has(canon(SEA_MASTER_SHEETS.ptp.sheet));
};

// Baca satu sheet master jadi daftar objek {field: nilai}. Kolom yang tidak ada di sheet -> undefined.
function readMasterSheet(wb, def) {
    const real = wb.SheetNames.find(s => canon(s) === canon(def.sheet));
    if (!real) return null;
    const aoa = xlsx.utils.sheet_to_json(wb.Sheets[real], { header: 1, defval: null, blankrows: true });
    const loc = locateColumns(aoa, def.spec, def.spec.flatMap(s => s.headers));
    if (!loc) throw new Error(`Header sheet "${real}" tidak dikenali. Kolom yang dibutuhkan: ${def.spec.filter(s => !(def.optional || ['profit', 'margin']).includes(s.col)).map(s => s.headers[0]).join(', ')}.`);
    const out = [];
    for (let r = loc.dataStart; r < aoa.length; r++) {
        const line = aoa[r] || [];
        if (line.every(isBlank)) continue;
        const o = {};
        for (const s of def.spec) {
            const v = loc.colOf[s.col] === undefined ? undefined : line[loc.colOf[s.col]];
            o[s.col] = v === undefined ? undefined : (s.kind === 'num' ? (isBlank(v) ? 0 : toNum(v)) : toText(v));
        }
        // type truck: samakan nama (20ft -> Trailer 20FT)
        if ('truck' in o) o.truck = normalizeVehicle(o.truck);
        out.push(o);
    }
    return out;
}

// Gabungkan master-master tadi. Mengembalikan { rows: [{kolom: nilai}], warnings: [teks] }.
function composeSeaRows(wb) {
    const missing = Object.values(SEA_MASTER_SHEETS).filter(d => !wb.SheetNames.some(s => canon(s) === canon(d.sheet))).map(d => d.sheet);
    if (missing.length) throw new Error(`Sheet berikut tidak ditemukan di file: ${missing.join(', ')}.`);
    const M = {};
    for (const [k, def] of Object.entries(SEA_MASTER_SHEETS)) M[k] = readMasterSheet(wb, def);

    const key = (...p) => p.map(x => canon(x)).join('|');
    const loadBy = new Map(M.load.map(r => [key(r.port, r.truck), r]));
    const discBy = new Map(M.disc.map(r => [key(r.port, r.truck), r]));
    const othersBy = new Map(M.others.map(r => [key(r.truck), r]));
    const ptpBy = new Map();
    for (const r of M.ptp) { const k = key(r.from, r.truck); if (!ptpBy.has(k)) ptpBy.set(k, []); ptpBy.get(k).push(r); }

    const rows = [], warnings = [];
    const warn = (msg) => { if (warnings.length < 30) warnings.push(msg); };
    const round10k = (x) => Math.ceil(x / 10000 - 1e-9) * 10000;

    M.origin.forEach((o, i) => {
        const label = `${o.kota || '?'} (${o.truck || '?'}) - baris ${i + 1} sheet ${SEA_MASTER_SHEETS.origin.sheet}`;
        if (!o.kota || !o.port || !o.truck) return warn(`${label}: origin, port, atau type truck kosong, dilewati.`);
        const thcLoad = loadBy.get(key(o.port, o.truck));
        if (!thcLoad) return warn(`${label}: THC origin untuk port ${o.port} / ${o.truck} tidak ada di ${SEA_MASTER_SHEETS.load.sheet}, dilewati.`);
        const oth = othersBy.get(key(o.truck));
        if (!oth) return warn(`${label}: type truck ${o.truck} tidak ada di ${SEA_MASTER_SHEETS.others.sheet}, dilewati.`);
        const routes = ptpBy.get(key(o.port, o.truck));
        if (!routes) return warn(`${label}: tidak ada tarif pelayaran dari port ${o.port} / ${o.truck} di ${SEA_MASTER_SHEETS.ptp.sheet}, dilewati.`);

        for (const p of routes) {
            const thcDisc = discBy.get(key(p.to, o.truck));
            const dests = M.dest.filter(d => canon(d.truck) === canon(o.truck) && canon(d.kota) === canon(p.to));
            if (!dests.length) { warn(`${label}: tujuan ${p.to} / ${o.truck} tidak ada di ${SEA_MASTER_SHEETS.dest.sheet}, dilewati.`); continue; }
            for (const d of dests) {
                const thcDest = thcDisc ? thcDisc.thc : 0;
                const profit = oth.profit !== undefined && oth.profit !== 0 ? oth.profit : DEFAULT_PROFIT;
                const margin = oth.margin !== undefined && oth.margin !== 0 ? oth.margin : DEFAULT_SUBMIT_MARGIN;
                const base = o.trucking + o.maint + o.invest + thcLoad.thc + thcDest + d.agent + oth.doClean + oth.risk + oth.marketing + profit;
                const temas = (base + p.tF + p.tL) / PPH_DIVISOR;
                const meratus = (base + p.mF + p.mL) / PPH_DIVISOR;
                rows.push({
                    origin_provinsi: provinceFor(o.kota, o.kec), origin_kota: o.kota, origin_kecamatan: o.kec || o.kota,
                    destination_provinsi: provinceFor(d.kota, d.kec), destination_kota: d.kota, destination_kecamatan: d.kec || d.kota,
                    service_type: 'door_to_port', port_origin: o.port, port_destination: p.to, truck_type: o.truck,
                    km_truck_origin: o.km, trucking_origin: o.trucking, maint_fee: o.maint, investasi_truck: o.invest,
                    thc_origin_lolo: thcLoad.thc, thc_dest: thcDest, thc_dest_note: thcDest === 0 ? 'Include Agent' : null,
                    agent: d.agent, tkbm: 0, tkbm_note: 'FOT', do_clean: oth.doClean, risk_claim: oth.risk, marketing: oth.marketing, profit,
                    temas_freight: p.tF, temas_lss: p.tL, meratus_freight: p.mF, meratus_lss: p.mL,
                    temas_total_cost_pph: temas, meratus_total_cost_pph: meratus, submit_value: round10k(temas + margin)
                });
            }
        }
    });
    return { rows, warnings };
}

// ---- Upload DARAT dari master terpisah (Door to Door) ----
//   MASTER RUTE   : origin, destination, unit, KM, UJ SUPIR per rute
//   MASTER OTHERS : tip muat, tip bongkar, risk claim/IT, marketing, maint fee per KM (opsional: rasio UJ supir) per unit
// Rumus (cocok dengan file hasil): Maint Fee = KM x tarif per KM; Total Cost = UJ Supir + Tip Muat + Tip Bongkar + Maint Fee + Risk Claim/IT;
// Total Cost + Profit + PPH = (Total Cost + Marketing) / 0,98; Submit = UJ Supir / rasio (bawaan 0,3) dibulatkan ke atas per 1.000; Jasa = Submit - (Total Cost + Profit + PPH).
const DEFAULT_MAINT_PER_KM = 3000, DEFAULT_UJ_RATIO = 0.3;
const LAND_MASTER_SHEETS = {
    rute: { sheet: 'MASTER RUTE', optional: [], spec: [t('kota', 'ORIGIN KOTA'), t('kec', 'ORIGIN KECAMATAN'), t('dKota', 'DESTINATION KOTA', 'DESTINATON KOTA'), t('dKec', 'DESTINATION KECAMATAN', 'DESTINATON KECAMATAN'),
        t('truck', 'UNIT', 'TYPE MOBIL', 'TRUCK TYPE'), n('km', 'KM'), n('uj', 'UJ SUPIR', 'UJ SOPIR')] },
    others: { sheet: 'MASTER OTHERS', optional: ['ratio'], spec: [t('truck', 'UNIT', 'TYPE MOBIL', 'TRUCK TYPE'), n('tipMuat', 'TIP MUAT'), n('tipBongkar', 'TIP BONGKAR'),
        n('risk', 'RISK CLAIM/IT', 'RISK CLAIM + IT', 'RISK CLAIM'), n('marketing', 'MARKETING'), n('maintKm', 'MAINT FEE PER KM', 'MANT. FEE PER KM', 'MAINT. FEE/KM', 'MAINT FEE/KM'),
        n('ratio', 'RASIO UJ SUPIR', 'RASIO UJ SOPIR')] }
};

const isLandMasterWorkbook = (wb) => wb.SheetNames.some(s => canon(s) === canon(LAND_MASTER_SHEETS.rute.sheet));

function composeLandRows(wb) {
    const missing = Object.values(LAND_MASTER_SHEETS).filter(d => !wb.SheetNames.some(s => canon(s) === canon(d.sheet))).map(d => d.sheet);
    if (missing.length) throw new Error(`Sheet berikut tidak ditemukan di file: ${missing.join(', ')}.`);
    const rute = readMasterSheet(wb, LAND_MASTER_SHEETS.rute);
    const others = new Map(readMasterSheet(wb, LAND_MASTER_SHEETS.others).map(r => [canon(r.truck), r]));
    const rows = [], warnings = [];
    const warn = (msg) => { if (warnings.length < 30) warnings.push(msg); };
    let prev = null;

    rute.forEach((r, i) => {
        // Origin yang kosong (sel digabung) memakai baris di atasnya
        if (!r.kota && !r.kec && prev) { r.kota = prev.kota; r.kec = prev.kec; }
        if (r.kota) prev = { kota: r.kota, kec: r.kec };
        const label = `${r.kota || '?'} - ${r.dKota || '?'} (${r.truck || '?'}) - baris ${i + 1} sheet ${LAND_MASTER_SHEETS.rute.sheet}`;
        if (!r.kota || !r.dKota || !r.truck) return warn(`${label}: origin, tujuan, atau unit kosong, dilewati.`);
        const o = others.get(canon(r.truck));
        if (!o) return warn(`${label}: unit ${r.truck} tidak ada di ${LAND_MASTER_SHEETS.others.sheet}, dilewati.`);
        const kmRate = o.maintKm ? o.maintKm : DEFAULT_MAINT_PER_KM;
        const ratio = o.ratio ? o.ratio : DEFAULT_UJ_RATIO;
        const maint = r.km * kmRate;
        const totalCost = r.uj + o.tipMuat + o.tipBongkar + maint + o.risk;
        const costPph = (totalCost + o.marketing) / PPH_DIVISOR;
        const submit = Math.ceil(r.uj / ratio / 1000 - 1e-9) * 1000;
        rows.push({
            origin_provinsi: provinceFor(r.kota, r.kec), origin_kota: r.kota, origin_kecamatan: r.kec || r.kota,
            destination_provinsi: provinceFor(r.dKota, r.dKec), destination_kota: r.dKota, destination_kecamatan: r.dKec || r.dKota,
            service_type: 'door_to_door', type_mobil: r.truck, km: r.km, uj_sopir: r.uj, tip_muat: o.tipMuat, tip_bongkar: o.tipBongkar, tkbm: 0,
            maint_fee: maint, risk_claim_it: o.risk, total_cost: totalCost, marketing: o.marketing, cost_pph: costPph, total: submit, jasa: submit - costPph
        });
    });
    return { rows, warnings };
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
            let warnings = [], format = 'tabel';

            // File master terpisah (SEA: 6 sheet, DARAT: Master Rute + Master Others): digabung otomatis jadi baris lengkap
            const isMaster = (type === 'sea' && isSeaMasterWorkbook(workbook)) || (type === 'land' && isLandMasterWorkbook(workbook));
            if (isMaster) {
                format = type === 'sea' ? 'master-sea' : 'master-darat';
                const composed = type === 'sea' ? composeSeaRows(workbook) : composeLandRows(workbook);
                warnings = composed.warnings;
                for (const o of composed.rows) {
                    toInsert.push([...spec.map(s => (o[s.col] !== undefined && o[s.col] !== null) ? o[s.col] : (s.kind === 'num' ? 0 : null)),
                        ...NOTE_COLS[type].map(k => o[k] || null), req.session.userId]);
                }
                sheets.push({ name: 'Gabungan master', rows: composed.rows.length });
            }

            // Baca SEMUA sheet. Baris header dicari otomatis (di antara 8 baris pertama), data mulai setelahnya.
            for (const name of (isMaster ? [] : workbook.SheetNames)) {
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

                    // Sel origin yang digabung (merge) di Excel hanya terisi di baris pertama -> baris berikutnya memakai origin di atasnya.
                    if (originEmpty && prevOrigin) Object.assign(o, prevOrigin);
                    // Kecamatan kosong -> pakai nama kota, supaya bisa dipilih di Hitung Fix Cost.
                    if (!o.kec && o.kota) o.kec = o.kota;
                    if (!d.kec && d.kota) d.kec = d.kota;
                    // Kolom provinsi kosong -> provinsi sesuai kota/kecamatannya (daftar wilayah);
                    // bila wilayahnya tidak dikenal -> provinsi dari nama sheet (mis. "Jawa_Barat" -> "Jawa Barat").
                    if (!o.prov) o.prov = provinceFor(o.kota, o.kec) || sheetProv;
                    if (!d.prov) d.prov = provinceFor(d.kota, d.kec) || sheetProv;

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
                if (isMaster) return res.status(400).json({ error: 'Tidak ada baris gabungan yang terbentuk.' + (warnings.length ? ' ' + warnings.slice(0, 5).join(' ') : '') });
                return res.status(400).json({
                    error: 'Tidak ada baris yang bisa diimpor. Pastikan ada baris header (ORIGIN/DESTINATION ... ) dan minimal satu baris data.'
                        + (skippedSheets.length ? ` Sheet dilewati karena header tidak dikenali: ${skippedSheets.join(', ')}.` : '')
                });
            }

            // Satu transaksi: kalau ada yang gagal, tidak ada baris setengah masuk.
            // ?replace=1 -> hapus semua data lama (tipe ini) dulu, dalam transaksi yang sama dengan impor
            const replace = req.query.replace === '1';
            let deleted = 0;
            const db = getDb();
            db.run('BEGIN');
            try {
                if (replace) {
                    deleted = queryGet(`SELECT COUNT(*) AS c FROM master_biaya_${type}`).c;
                    queryRun(`DELETE FROM master_biaya_${type}`, [], false);
                }
                for (const p of toInsert) queryRun(sql, p, false);
                db.run('COMMIT');
            } catch (e) {
                db.run('ROLLBACK');
                throw e;
            }
            saveDb();

            res.json({ message: 'Success', format, deleted, rowsInserted: toInsert.length, sheets, skippedSheets, warnings });
        } catch (err) {
            res.status(500).json({ error: (err && err.message) ? err.message : String(err) });
        } finally {
            if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    };
}

// Contoh file upload Sea (6 sheet master) - hanya admin & superadmin (router sudah dibatasi)
router.get('/template/sea', (req, res) => {
    res.download(path.join(__dirname, '..', 'templates', 'master_sea_untuk_upload.xlsx'), 'master_sea_untuk_upload.xlsx');
});

router.get('/template/land', (req, res) => {
    res.download(path.join(__dirname, '..', 'templates', 'master_darat_untuk_upload.xlsx'), 'master_darat_untuk_upload.xlsx');
});

router.post('/land', upload.single('file'), handleUpload('land'));
router.post('/sea', upload.single('file'), handleUpload('sea'));

module.exports = router;
