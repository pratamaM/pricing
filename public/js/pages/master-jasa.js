let mjCategory = 'land';
let mjList = [];
let mjEditId = null;

const mjCanAdd = () => ['superadmin', 'admin'].includes(App.user && App.user.role);
const mjCanEdit = () => ['superadmin', 'admin'].includes(App.user && App.user.role);

function renderMasterJasa() {
    const edit = mjCanEdit();
    return `
    <div class="space-y-4 max-w-3xl mx-auto">
        <div class="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex flex-col sm:flex-row justify-center sm:justify-between items-center gap-4">
            <div class="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                <button id="mj-tab-land" class="flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors bg-white shadow text-gray-800">Jasa Darat</button>
                <button id="mj-tab-sea" class="flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 hover:text-gray-700">Jasa Laut</button>
            </div>
            ${mjCanAdd() ? `<button id="mj-add" class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"><i data-lucide="plus" class="w-4 h-4"></i> Tambah Jasa</button>` : ''}
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table class="w-full text-left text-sm">
                <thead class="bg-gray-50 text-gray-600 border-b">
                    <tr>
                        <th class="px-4 py-3 font-medium">Nama Jasa</th>
                        <th class="px-4 py-3 font-medium text-center">Jenis</th>
                        <th class="px-4 py-3 font-medium text-right">Nominal</th>
                        ${edit ? '<th class="px-4 py-3 font-medium text-center">Aksi</th>' : ''}
                    </tr>
                </thead>
                <tbody id="mj-tbody" class="divide-y divide-gray-100"></tbody>
            </table>
        </div>
        <p class="text-xs text-gray-500 text-center">Jasa bawaan (Multi Pickup, Multi Drop, Kawalan, TKBM) dipakai pada pertanyaan biaya tambahan di Hitung Fix Cost. Jasa tambahan akan muncul sebagai pilihan opsional.</p>
    </div>

    <div id="mj-modal" class="fixed inset-0 z-50 hidden flex items-center justify-center">
        <div class="modal-backdrop absolute inset-0"></div>
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md relative z-10">
            <h3 id="mj-modal-title" class="text-xl font-bold text-gray-800 mb-4 pb-3 border-b">Tambah Jasa</h3>
            <form id="mj-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Nama Jasa</label>
                    <input type="text" id="mj-name" required maxlength="100" class="w-full border-gray-300 rounded-lg px-3 py-2 border focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp)</label>
                    <input type="number" id="mj-amount" min="0" step="any" required class="w-full border-gray-300 rounded-lg px-3 py-2 border focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div class="pt-4 flex justify-end gap-2 border-t">
                    <button type="button" id="mj-cancel" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">Batal</button>
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition">Simpan</button>
                </div>
            </form>
        </div>
    </div>
    `;
}

async function renderMasterJasaInit() {
    mjCategory = 'land';
    const modal = document.getElementById('mj-modal');
    const close = () => modal.classList.add('hidden');

    document.getElementById('mj-tab-land').addEventListener('click', () => mjSetTab('land'));
    document.getElementById('mj-tab-sea').addEventListener('click', () => mjSetTab('sea'));
    document.getElementById('mj-cancel').addEventListener('click', close);

    const addBtn = document.getElementById('mj-add');
    if (addBtn) addBtn.addEventListener('click', () => {
        mjEditId = null;
        document.getElementById('mj-modal-title').textContent = 'Tambah Jasa ' + (mjCategory === 'land' ? 'Darat' : 'Laut');
        document.getElementById('mj-form').reset();
        modal.classList.remove('hidden');
    });

    document.getElementById('mj-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { name: document.getElementById('mj-name').value, amount: document.getElementById('mj-amount').value };
        try {
            if (mjEditId) await App.api(`/master-jasa/${mjEditId}`, { method: 'PUT', body: JSON.stringify(body) });
            else await App.api('/master-jasa', { method: 'POST', body: JSON.stringify({ ...body, category: mjCategory }) });
            App.showToast('Jasa disimpan', 'success');
            close();
            mjLoad();
        } catch (err) {
            App.showToast(err.message, 'error');
        }
    });

    mjLoad();
}

function mjSetTab(cat) {
    mjCategory = cat;
    const on = 'flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors bg-white shadow text-gray-800';
    const off = 'flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 hover:text-gray-700';
    document.getElementById('mj-tab-land').className = cat === 'land' ? on : off;
    document.getElementById('mj-tab-sea').className = cat === 'sea' ? on : off;
    mjLoad();
}

async function mjLoad() {
    const tbody = document.getElementById('mj-tbody');
    const edit = mjCanEdit();
    try {
        mjList = await App.api(`/master-jasa?category=${mjCategory}`);
        if (!mjList.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">Belum ada jasa</td></tr>`;
            return;
        }
        tbody.innerHTML = mjList.map(j => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-900">${App.esc(j.name)}</td>
                <td class="px-4 py-3 text-gray-500 text-center">${j.code ? 'Bawaan' : 'Tambahan'}</td>
                <td class="px-4 py-3 text-right">${App.formatRp(j.amount)}</td>
                ${edit ? `<td class="px-4 py-3 text-center">
                    <button onclick="mjEdit(${Number(j.id)})" class="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    ${j.code ? '' : `<button onclick="mjDelete(${Number(j.id)})" class="text-red-600 hover:bg-red-50 p-1.5 rounded transition ml-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}
                </td>` : ''}
            </tr>`).join('');
        lucide.createIcons();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-500">Gagal memuat data</td></tr>`;
    }
}

window.mjEdit = function (id) {
    const j = mjList.find(x => Number(x.id) === Number(id));
    if (!j) return;
    mjEditId = j.id;
    document.getElementById('mj-modal-title').textContent = 'Edit Jasa';
    document.getElementById('mj-name').value = j.name;
    document.getElementById('mj-amount').value = j.amount;
    document.getElementById('mj-modal').classList.remove('hidden');
};

window.mjDelete = async function (id) {
    if (!confirm('Hapus jasa ini?')) return;
    try {
        await App.api(`/master-jasa/${id}`, { method: 'DELETE' });
        App.showToast('Jasa dihapus', 'success');
        mjLoad();
    } catch (e) {
        App.showToast(e.message, 'error');
    }
};
