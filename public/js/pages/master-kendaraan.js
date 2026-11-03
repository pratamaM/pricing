let mkCategory = 'land';
let mkList = [];
let mkKit = null;

const mkCanAdd = () => ['superadmin', 'admin'].includes(App.user && App.user.role);
const mkCanEdit = () => ['superadmin', 'admin'].includes(App.user && App.user.role);

function renderMasterKendaraan() {
    const edit = mkCanEdit();
    return `
    <div class="space-y-4 w-full">
        <div class="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex flex-col sm:flex-row justify-center sm:justify-between items-center gap-4">
            <div class="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                <button id="mk-tab-land" class="flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors bg-white shadow text-gray-800">Kendaraan Darat</button>
                <button id="mk-tab-sea" class="flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 hover:text-gray-700">Kendaraan Laut</button>
            </div>
            ${mkCanAdd() ? `
            <div class="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <button type="button" id="mk-upload" class="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"><i data-lucide="upload" class="w-4 h-4"></i> Upload Excel</button>
            <input type="file" id="mk-file" accept=".xlsx, .xls" class="hidden">
            <form id="mk-form" class="flex items-center gap-2 w-full sm:w-auto">
                <input type="text" id="mk-name" maxlength="50" required placeholder="mis. Trailer 20FT" class="w-full sm:w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <button type="submit" class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"><i data-lucide="plus" class="w-4 h-4"></i> Tambah</button>
            </form></div>` : ''}
        </div>
        <div class="tk-card bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div id="mk-filters"></div>
            <div class="overflow-x-auto tk-scroll">
            <table class="tk-table w-full text-left text-sm">
                <thead class="bg-gray-50 text-gray-600 border-b">
                    <tr>
                        <th class="px-6 py-3 font-medium text-left">Nama Kendaraan</th>
                        ${edit ? '<th class="px-6 py-3 font-medium text-right w-40">Aksi</th>' : ''}
                    </tr>
                </thead>
                <tbody id="mk-tbody" class="divide-y divide-gray-100"></tbody>
            </table>
            </div>
            <div id="mk-pager"></div>
        </div>
        <p class="text-xs text-gray-500">Daftar ini dipakai sebagai pilihan Type Truck / Type Container di Master Biaya dan Hitung Fix Cost.</p>
    </div>`;
}

async function renderMasterKendaraanInit() {
    mkCategory = 'land';
    mkKit = TableKit.mount({
        filterEl: 'mk-filters', pagerEl: 'mk-pager', tbodyId: 'mk-tbody', colspan: mkCanEdit() ? 2 : 1, pageSize: 10,
        emptyText: 'Belum ada kendaraan',
        filters: [{ id: 'q', type: 'search', placeholder: 'Cari nama kendaraan...', match: (k, v) => TableKit.norm(k.name).includes(TableKit.norm(v)) }],
        renderRow: mkRowHtml
    });
    document.getElementById('mk-tab-land').addEventListener('click', () => mkSetTab('land'));
    document.getElementById('mk-tab-sea').addEventListener('click', () => mkSetTab('sea'));

    const form = document.getElementById('mk-form');
    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('mk-name');
        try {
            await App.api('/master-kendaraan', { method: 'POST', body: JSON.stringify({ category: mkCategory, name: input.value }) });
            input.value = '';
            App.showToast('Kendaraan ditambahkan', 'success');
            mkLoad();
        } catch (err) {
            App.showToast(err.message, 'error');
        }
    });
    const fileInput = document.getElementById('mk-file');
    if (fileInput) {
        document.getElementById('mk-upload').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            if (!fileInput.files.length) return;
            const fd = new FormData();
            fd.append('file', fileInput.files[0]);
            try {
                const r = await App.apiUpload('/master-kendaraan/upload', fd);
                App.showToast(`Upload selesai: ${r.added} kendaraan ditambahkan, ${r.skipped} sudah ada`, 'success');
                mkLoad();
            } catch (err) {
                App.showToast(err.message, 'error');
            } finally {
                fileInput.value = '';
            }
        });
    }
    mkLoad();
}

function mkSetTab(cat) {
    mkCategory = cat;
    const on = 'flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors bg-white shadow text-gray-800';
    const off = 'flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 hover:text-gray-700';
    document.getElementById('mk-tab-land').className = cat === 'land' ? on : off;
    document.getElementById('mk-tab-sea').className = cat === 'sea' ? on : off;
    mkLoad();
}

function mkRowHtml(k) {
    return `
    <tr class="hover:bg-gray-50">
        <td class="px-6 py-3 font-medium text-gray-900 text-left">${App.esc(k.name)}</td>
        ${mkCanEdit() ? `<td class="px-6 py-3 text-right whitespace-nowrap">
            <button onclick="mkRename(${Number(k.id)})" class="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
            <button onclick="mkDelete(${Number(k.id)})" class="text-red-600 hover:bg-red-50 p-1.5 rounded transition ml-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </td>` : ''}
    </tr>`;
}

async function mkLoad() {
    mkKit.loading();
    try {
        mkList = await App.api(`/master-kendaraan?category=${mkCategory}`);
        mkKit.setRows(mkList);
    } catch (e) {
        document.getElementById('mk-tbody').innerHTML = `<tr><td colspan="2" class="p-8 text-center text-red-500">Gagal memuat data</td></tr>`;
    }
}

window.mkRename = async function (id) {
    const k = mkList.find(x => Number(x.id) === Number(id));
    if (!k) return;
    const name = prompt('Nama kendaraan:', k.name);
    if (name === null || !name.trim()) return;
    try {
        await App.api(`/master-kendaraan/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
        App.showToast('Kendaraan diubah', 'success');
        mkLoad();
    } catch (e) {
        App.showToast(e.message, 'error');
    }
};

window.mkDelete = async function (id) {
    if (!confirm('Hapus kendaraan ini dari daftar? (Data Master Biaya yang sudah memakai nama ini tidak berubah.)')) return;
    try {
        await App.api(`/master-kendaraan/${id}`, { method: 'DELETE' });
        App.showToast('Kendaraan dihapus', 'success');
        mkLoad();
    } catch (e) {
        App.showToast(e.message, 'error');
    }
};
