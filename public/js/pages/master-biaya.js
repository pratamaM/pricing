let currentMasterBiayaType = 'land';
let currentMasterBiayaPage = 1;
let currentMasterBiayaSearch = '';

function renderMasterBiaya() {
    return `
    <div class="space-y-4">
        <div class="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div class="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                <button id="tab-land" class="flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors bg-white shadow text-gray-800">Land Pricing</button>
                <button id="tab-sea" class="flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 hover:text-gray-700">Sea Pricing</button>
            </div>
            
            <div class="flex items-center gap-3 w-full sm:w-auto">
                
                ${['superadmin', 'admin'].includes(App.user?.role) ? `
                <a id="btn-template-sea" href="api/upload/template/sea" download class="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap" title="Contoh file upload (sheet-sheet master)">
                    <i data-lucide="download" class="w-4 h-4"></i>
                    <span id="btn-template-label" class="hidden sm:inline">Template</span>
                </a>
                <button id="btn-history" class="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap" title="Versi upload sebelumnya">
                    <i data-lucide="history" class="w-4 h-4"></i>
                    <span class="hidden sm:inline">Riwayat Upload</span>
                </button>
                <button id="btn-upload" class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
                    <i data-lucide="upload" class="w-4 h-4"></i>
                    <span class="hidden sm:inline">Upload Excel</span>
                </button>
                <input type="file" id="file-upload" accept=".xlsx, .xls" class="hidden">
                ` : ''}
            </div>
        </div>
        
        <div class="tk-card bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div id="mb-filters"></div>
            <div class="overflow-x-auto tk-scroll">
                <table class="tk-table w-full text-left text-sm whitespace-nowrap">
                    <thead class="bg-gray-50 text-gray-600 border-b">
                        <tr id="mb-thead">
                            <!-- Injected by JS -->
                        </tr>
                    </thead>
                    <tbody id="mb-tbody" class="divide-y divide-gray-100">
                        <!-- Injected by JS -->
                    </tbody>
                </table>
            </div>
            <div id="mb-pager"></div>
        </div>
    </div>
    `;
}

async function renderMasterBiayaInit() {
    currentMasterBiayaType = 'land';
    currentMasterBiayaPage = 1;
    currentMasterBiayaSearch = '';
    
    document.getElementById('tab-land').addEventListener('click', (e) => setMbTab('land', e.currentTarget));
    document.getElementById('tab-sea').addEventListener('click', (e) => setMbTab('sea', e.currentTarget));
    
    const fileUpload = document.getElementById('file-upload');
    const btnUpload = document.getElementById('btn-upload');
    if (btnUpload && fileUpload) {
        btnUpload.addEventListener('click', () => fileUpload.click());
        fileUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const formData = new FormData();
            formData.append('file', file);

            // Upload menjadikan isi file sebagai versi aktif; data lama di-expired (tidak dihapus)
            let oldCount = 0;
            try { oldCount = (await App.api('/master-biaya/count'))[currentMasterBiayaType] || 0; } catch (e) { /* hanya untuk teks konfirmasi */ }
            const label = currentMasterBiayaType === 'sea' ? 'Sea' : 'Darat';
            if (!confirm(`Data Master Biaya ${label} yang aktif (${oldCount} baris) akan di-EXPIRED dan diganti dengan isi file ini.\n\nData lama tidak dihapus: bisa diunduh atau diaktifkan lagi lewat tombol Riwayat Upload.\n\nLanjutkan?`)) {
                fileUpload.value = '';
                return;
            }
            
            try {
                btnUpload.disabled = true;
                btnUpload.innerHTML = '<div class="spinner w-4 h-4 border-2"></div>';
                
                const up = await App.apiUpload(`/upload/${currentMasterBiayaType}?replace=1`, formData);
                App.showToast(`Upload berhasil: ${up.rowsInserted} baris diimpor${up.expired ? `, ${up.expired} baris lama di-expired` : ''}`, 'success');
                if (up.warnings && up.warnings.length) App.showToast(`${up.warnings.length} baris master dilewati: ${up.warnings.slice(0, 3).join(' | ')}${up.warnings.length > 3 ? ' ...' : ''}`, 'warning');
                loadMasterBiayaData(true);
            } catch (err) {
                App.showToast(err.message, 'error');
            } finally {
                btnUpload.disabled = false;
                btnUpload.innerHTML = '<i data-lucide="upload" class="w-4 h-4"></i> <span class="hidden sm:inline">Upload Excel</span>';
                lucide.createIcons({ root: btnUpload });
                fileUpload.value = '';
            }
        });
    }

    const btnHistory = document.getElementById('btn-history');
    if (btnHistory) btnHistory.addEventListener('click', mbOpenHistory);

    mbToggleTemplateLink();
    mbInitKit();
}

// ---- Riwayat versi upload: unduh / aktifkan kembali ----
function mbFmtDate(v) {
    if (!v) return '-';
    const d = new Date(String(v).replace(' ', 'T') + 'Z');
    return isNaN(d) ? v : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
}

async function mbOpenHistory() {
    const type = currentMasterBiayaType;
    const label = type === 'sea' ? 'Sea' : 'Darat';
    let box = document.getElementById('mb-history-modal');
    if (box) box.remove();
    box = document.createElement('div');
    box.id = 'mb-history-modal';
    box.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4';
    box.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div><h3 class="font-semibold text-gray-800">Riwayat Upload Master Biaya ${label}</h3>
                <p class="text-xs text-gray-500 mt-0.5">Hanya satu versi yang aktif. Versi lama tidak dihapus: unduh atau aktifkan kembali.</p></div>
                <button type="button" data-close class="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">&times;</button>
            </div>
            <div class="overflow-auto" id="mb-history-body"><div class="p-10 text-center"><div class="spinner mx-auto"></div></div></div>
        </div>`;
    document.body.appendChild(box);
    const close = () => box.remove();
    box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-close]')) close(); });

    const body = box.querySelector('#mb-history-body');
    async function render() {
        try {
            const list = await App.api(`/upload/batches?type=${type}`);
            if (!list.length) { body.innerHTML = '<div class="p-10 text-center text-gray-500">Belum ada riwayat upload.</div>'; return; }
            body.innerHTML = `<table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-500 uppercase"><tr>
                <th class="px-4 py-2 text-left">Versi</th><th class="px-4 py-2 text-left">File</th><th class="px-4 py-2 text-left">Diupload</th>
                <th class="px-4 py-2 text-right">Baris</th><th class="px-4 py-2 text-left">Status</th><th class="px-4 py-2 text-right">Aksi</th></tr></thead><tbody>
                ${list.map(b => `<tr class="border-t border-gray-100">
                    <td class="px-4 py-3 font-medium text-gray-700">#${b.id}</td>
                    <td class="px-4 py-3 text-gray-700">${App.esc(b.filename || '-')}</td>
                    <td class="px-4 py-3 text-gray-500">${App.esc(mbFmtDate(b.uploaded_at))}<div class="text-xs text-gray-400">${App.esc(b.uploaded_by_name || '')}</div></td>
                    <td class="px-4 py-3 text-right">${b.row_count}</td>
                    <td class="px-4 py-3">${b.status === 'active'
                        ? '<span class="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">Aktif</span>'
                        : `<span class="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 font-medium">Expired</span><div class="text-xs text-gray-400 mt-0.5">${App.esc(mbFmtDate(b.expired_at))}</div>`}</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                        <a href="api/upload/batches/${b.id}/download" download class="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Download</a>
                        ${b.status === 'active' ? '' : `<button type="button" data-activate="${b.id}" class="ml-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Aktifkan</button>`}
                    </td></tr>`).join('')}
                </tbody></table>`;
        } catch (e) { body.innerHTML = `<div class="p-10 text-center text-red-500">${App.esc(e.message)}</div>`; }
    }
    body.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-activate]');
        if (!btn) return;
        if (!confirm(`Aktifkan versi #${btn.dataset.activate}?\n\nData Master Biaya ${label} yang aktif sekarang akan di-expired dan diganti dengan versi ini. Harga pengajuan baru memakai versi ini; pengajuan lama tidak berubah.`)) return;
        btn.disabled = true; btn.textContent = 'Memproses...';
        try {
            const r = await App.api(`/upload/batches/${btn.dataset.activate}/activate`, { method: 'POST' });
            App.showToast(`Versi #${btn.dataset.activate} aktif (${r.restored} baris)`, 'success');
            loadMasterBiayaData(true);
        } catch (err) { App.showToast(err.message, 'error'); }
        render();
    });
    render();
}

// Tombol template mengikuti tab aktif (Darat / Sea)
function mbToggleTemplateLink() {
    const a = document.getElementById('btn-template-sea');
    if (!a) return;
    a.setAttribute('href', `api/upload/template/${currentMasterBiayaType}`);
    const lbl = document.getElementById('btn-template-label');
    if (lbl) lbl.textContent = currentMasterBiayaType === 'sea' ? 'Template Sea' : 'Template Darat';
}

function setMbTab(type, btn) {
    currentMasterBiayaType = type;
    currentMasterBiayaPage = 1;
    
    document.getElementById('tab-land').className = 'flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 hover:text-gray-700';
    document.getElementById('tab-sea').className = 'flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 hover:text-gray-700';
    
    btn.className = 'flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors bg-white shadow text-gray-800';
    mbToggleTemplateLink();
    
    loadMasterBiayaData(true);
}

let mbKit = null;

function mbCanDetail() { return !!App.user && App.user.role !== 'user'; }

function mbRenderHead() {
    // Tabel depan: Origin, Destination, Total Biaya. Rinciannya ada di tombol Detail (kolom Action).
    // Role "user" tidak punya kolom Action.
    document.getElementById('mb-thead').innerHTML = `
        <th class="px-4 py-3 font-medium">Origin</th>
        <th class="px-4 py-3 font-medium">Destination</th>
        <th class="px-4 py-3 font-medium">Type Truck</th>
        <th class="px-4 py-3 font-medium text-right">Total Biaya</th>
        ${mbCanDetail() ? '<th class="px-4 py-3 font-medium text-center">Action</th>' : ''}`;
}

function mbRenderRow(item) {
    const type = currentMasterBiayaType;
    const origin = [item.origin_provinsi, item.origin_kota, item.origin_kecamatan].filter(Boolean).join(', ');
    const dest = [item.destination_provinsi, item.destination_kota, item.destination_kecamatan].filter(Boolean).join(', ');
    // Darat: kolom Total. Laut: nilai SUBMIT (dasar perhitungan di Calculate Cost).
    const total = type === 'land' ? item.total : item.submit_value;
    const truck = type === 'land' ? item.type_mobil : item.truck_type;
    return `
    <tr class="hover:bg-gray-50">
        <td class="px-4 py-3">${App.esc(origin || '-')}</td>
        <td class="px-4 py-3">${App.esc(dest || '-')}</td>
        <td class="px-4 py-3">${truck ? `<span class="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">${App.esc(truck)}</span>` : '<span class="text-gray-400">-</span>'}</td>
        <td class="px-4 py-3 font-medium text-right">${App.formatRp(total)}</td>
        ${mbCanDetail() ? `<td class="px-4 py-3 text-center">
            <button onclick="App.loadPage('master-detail-biaya', {id: '${Number(item.id)}', type: '${type}'})" class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded border border-blue-200 text-xs font-medium transition">Detail</button>
        </td>` : ''}
    </tr>`;
}

function mbInitKit() {
    mbRenderHead();
    mbKit = TableKit.mount({
        filterEl: 'mb-filters', pagerEl: 'mb-pager', tbodyId: 'mb-tbody',
        colspan: mbCanDetail() ? 5 : 4, pageSize: 25, sizes: [10, 25, 50, 100],
        emptyText: 'Tidak ada data Master Biaya',
        filters: [
            { id: 'search', type: 'search', placeholder: 'Cari origin / destination...' },
            { id: 'origin_provinsi', type: 'select', label: 'Provinsi Origin' },
            { id: 'destination_provinsi', type: 'select', label: 'Provinsi Destination' },
            { id: 'truck', type: 'select', label: 'Type Truck' }
        ],
        server: async ({ page, size, values }) => {
            const q = new URLSearchParams({ type: currentMasterBiayaType, page, limit: size, search: values.search || '' });
            for (const k of ['origin_provinsi', 'destination_provinsi', 'truck']) if (values[k]) q.set(k, values[k]);
            const res = await App.api(`/master-biaya/list?${q}`);
            return { rows: res.data, total: res.total };
        },
        renderRow: mbRenderRow
    });
    loadMasterBiayaData(true);
}

// reset=true: kosongkan filter (ganti tab / upload baru); false: pertahankan filter & halaman
async function loadMasterBiayaData(reset) {
    if (!mbKit) return;
    mbRenderHead();
    mbKit.loading();
    try {
        const o = await App.api(`/master-biaya/filter-options?type=${currentMasterBiayaType}`);
        mbKit.setOptions('origin_provinsi', o.origin_provinsi);
        mbKit.setOptions('destination_provinsi', o.destination_provinsi);
        mbKit.setOptions('truck', o.truck);
    } catch (e) { /* dropdown boleh kosong; tabel tetap jalan */ }
    return reset ? mbKit.reset() : mbKit.reload();
}
