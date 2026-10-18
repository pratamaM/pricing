// Daftar kota/kecamatan -> provinsi, dipakai saat upload Excel (yang tidak punya kolom provinsi) dan untuk memperbaiki
// provinsi yang salah. Hanya wilayah yang dikenal; wilayah lain tidak diubah.
const GROUPS = {
    'DKI Jakarta': ['JAKARTA', 'JAKARTA PUSAT', 'JAKARTA UTARA', 'JAKARTA SELATAN', 'JAKARTA BARAT', 'JAKARTA TIMUR', 'ANCOL', 'MARUNDA', 'PLUIT', 'SUNTER', 'KELAPA GADING',
        'PANCORAN', 'LENTENG AGUNG', 'KUNINGAN', 'PASAR REBO', 'PULOGADUNG', 'CILANDAK', 'DAAN MOGOT', 'TANJUNG PRIOK', 'CAKUNG', 'CENGKARENG', 'KALIDERES'],
    'Jawa Barat': ['BEKASI', 'CIKARANG', 'GUNUNG PUTRI', 'BOGOR', 'PARUNG', 'CILEUNGSI', 'PURWAKARTA', 'KARAWANG', 'DEPOK', 'BANDUNG', 'CIREBON', 'SUKABUMI', 'CIANJUR',
        'CIBITUNG', 'TAMBUN', 'CIBUBUR', 'CITEUREUP'],
    'Banten': ['TANGERANG', 'TANGERANG SELATAN', 'BITUNG', 'BALARAJA', 'CIPUTAT', 'CIKOKOL', 'JATAKE', 'KARAWACI', 'CIBODAS', 'LEBAK', 'CIKANDE', 'SERANG', 'CILEGON', 'CIKUPA', 'PAMULANG'],
    'Jawa Tengah': ['SEMARANG', 'SURAKARTA', 'SOLO', 'TEGAL'],
    'Jawa Timur': ['SURABAYA', 'GRESIK', 'SIDOARJO', 'MOJOKERTO', 'PASURUAN', 'MALANG'],
    'Sulawesi Tenggara': ['KENDARI'],
    'Sulawesi Selatan': ['MAKASSAR'],
    'Sumatra Utara': ['MEDAN', 'BELAWAN'],
    'Kalimantan Timur': ['BALIKPAPAN', 'SAMARINDA']
};

const MAP = {};
for (const [prov, names] of Object.entries(GROUPS)) for (const nm of names) MAP[nm] = prov;

const key = (s) => String(s === null || s === undefined ? '' : s).toUpperCase().replace(/\s+/g, ' ').trim();

// Kecamatan dicek dulu (lebih spesifik), lalu kota. Nama gabungan "CIBODAS+BEKASI" memakai provinsi bagian pertama.
function provinceFor(kota, kecamatan) {
    for (const v of [kecamatan, kota]) {
        const k = key(v);
        if (!k) continue;
        if (MAP[k]) return MAP[k];
        const first = key(k.split('+')[0]);
        if (first && MAP[first]) return MAP[first];
    }
    return null;
}

module.exports = { provinceFor };
