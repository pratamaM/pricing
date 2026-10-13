let mkCategory = 'land';
let mkList = [];

const mkCanAdd = () => ['superadmin', 'admin'].includes(App.user && App.user.role);
const mkCanEdit = () => ['superadmin', 'admin', 'supervisor', 'atasan'].includes(App.user && App.user.role);

function renderMasterKendaraan() {
    const edit = mkCanEdit();
    return `
    <div class="space-y-4 max-w-xl mx-auto">
        <div class="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex flex-col sm:flex-row justify-center sm:justify-between items-center gap-4">
            <div class="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                <button id="mk-tab-land" class="flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors bg-white shadow text-gray-800">Kendaraan Darat</button>
                <button id="mk-tab-sea" class="flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 hover:text-gray-700">Kendaraan Laut</button>
            </div>
            ${mkCanAdd() ? `
            <form id="mk-form" class="flex items-center gap-2 w-full sm:w-auto">
                <input type="text" id="mk-name" maxlength="50" required placeholder="mis. 20 Feet" class="w-full sm:w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <button type="submit" class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"><i data-lucide="plus" class="w-4 h-4"></i> Tambah</button>
            </form>` : ''}
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table class="w-full text-left text-sm">
                <thead class="bg-gray-50 text-gray-600 border-b">
                    <tr>
                        <th class="px-4 py-3 font-medium text-center">Nama Kendaraan</th>
                        ${edit ? '<th class="px-4 py-3 font-medium text-center">Aksi</th>' : ''}
                    </tr>
                </thead>
                <tbody id="mk-tbody" class="divide-y divide-gray-100"></tbody>
            </table>
        </div>
        <p class="text-xs text-gray-500 text-center">Daftar ini dipakai sebagai pilihan Type Truck / Type Container di Master Biaya dan Hitung Fix Cost.</p>
    </div>`;
}

async function renderMasterKendaraanInit() {
    mkCategory = 'land';
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

async function mkLoad() {
    const tbody = document.getElementById('mk-tbody');
    const edit = mkCanEdit();
    try {
        mkList = await App.api(`/master-kendaraan?category=${mkCategory}`);
        if (!mkList.length) {
            tbody.innerHTML = `<tr><td colspan="2" class="p-8 text-center text-gray-500">Belum ada kendaraan</td></tr>`;
            return;
        }
        tbody.innerHTML = mkList.map(k => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-900 text-center">${App.esc(k.name)}</td>
                ${edit ? `<td class="px-4 py-3 text-center">
                    <button onclick="mkRename(${Number(k.id)})" class="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="mkDelete(${Number(k.id)})" class="text-red-600 hover:bg-red-50 p-1.5 rounded transition ml-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>` : ''}
            </tr>`).join('');
        lucide.createIcons();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="2" class="p-8 text-center text-red-500">Gagal memuat data</td></tr>`;
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
