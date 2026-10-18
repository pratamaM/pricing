// Nama kendaraan baku (sesuai file ANGKUTAN): darat = Tronton Wing Box, Trailer 20FT, Trailer 40FT; laut = Trailer 20FT, Trailer 40FT.
// Kode singkat di Excel (TWB, 20ft, 40 Feet, ...) disamakan ke nama baku; nama lain dibiarkan apa adanya.
function normalizeVehicle(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s === '') return null;
    const k = s.toUpperCase().replace(/[\s._-]+/g, '');
    if (/^(TWB|TRONTONWINGBOX|WINGBOX|WINGBOK|TRONTONWINGBOK)$/.test(k)) return 'Tronton Wing Box';
    if (/^(TRAILER)?20(FT|FEET)?$/.test(k)) return 'Trailer 20FT';
    if (/^(TRAILER)?40(FT|FEET)?$/.test(k)) return 'Trailer 40FT';
    return s.replace(/\s+/g, ' ');
}

const DEFAULT_VEHICLES = [
    ['land', 'Tronton Wing Box'], ['land', 'Trailer 20FT'], ['land', 'Trailer 40FT'],
    ['sea', 'Trailer 20FT'], ['sea', 'Trailer 40FT']
];

module.exports = { normalizeVehicle, DEFAULT_VEHICLES };
