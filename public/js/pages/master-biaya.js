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
                <div class="relative w-full sm:w-64">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <i data-lucide="search" class="w-4 h-4"></i>
                    </div>
                    <input type="text" id="mb-search" placeholder="Search origin / destination..." class="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition">
                </div>
                
                ${['superadmin', 'admin', 'supervisor', 'atasan'].includes(App.user?.role) ? `
                <button id="btn-upload" class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
                    <i data-lucide="upload" class="w-4 h-4"></i>
                    <span class="hidden sm:inline">Upload Excel</span>
                </button>
                <input type="file" id="file-upload" accept=".xlsx, .xls" class="hidden">
                ` : ''}
            </div>
        </div>
        
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm whitespace-nowrap">
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
            
            <!-- Pagination -->
            <div class="px-4 py-3 border-t flex items-center justify-between bg-gray-50">
                <div class="text-sm text-gray-500">
                    Total: <span id="mb-total" class="font-medium text-gray-800">0</span> records
                </div>
                <div class="flex items-center gap-2">
                    <button id="btn-prev" class="px-3 py-1 border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">Prev</button>
                    <span id="mb-page-info" class="text-sm text-gray-600">Page 1</span>
                    <button id="btn-next" class="px-3 py-1 border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">Next</button>
                </div>
            </div>
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
    
    let searchTimeout;
    document.getElementById('mb-search').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentMasterBiayaSearch = e.target.value;
            currentMasterBiayaPage = 1;
            loadMasterBiayaData();
        }, 500);
    });
    
    document.getElementById('btn-prev').addEventListener('click', () => {
        if (currentMasterBiayaPage > 1) {
            currentMasterBiayaPage--;
            loadMasterBiayaData();
        }
    });
    
    document.getElementById('btn-next').addEventListener('click', () => {
        currentMasterBiayaPage++;
        loadMasterBiayaData();
    });
    
    const fileUpload = document.getElementById('file-upload');
    const btnUpload = document.getElementById('btn-upload');
    if (btnUpload && fileUpload) {
        btnUpload.addEventListener('click', () => fileUpload.click());
        fileUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const formData = new FormData();
            formData.append('file', file);
            
            try {
                btnUpload.disabled = true;
                btnUpload.innerHTML = '<div class="spinner w-4 h-4 border-2"></div>';
                
                const up = await App.apiUpload(`/upload/${currentMasterBiayaType}`, formData);
                App.showToast(`Upload successful: ${up.rowsInserted} baris diimpor`, 'success');
                loadMasterBiayaData();
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

    loadMasterBiayaData();
}

function setMbTab(type, btn) {
    currentMasterBiayaType = type;
    currentMasterBiayaPage = 1;
    
    document.getElementById('tab-land').className = 'flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 hover:text-gray-700';
    document.getElementById('tab-sea').className = 'flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 hover:text-gray-700';
    
    btn.className = 'flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors bg-white shadow text-gray-800';
    
    loadMasterBiayaData();
}

async function loadMasterBiayaData() {
    const tbody = document.getElementById('mb-tbody');
    const thead = document.getElementById('mb-thead');
    
    if (currentMasterBiayaType === 'land') {
        thead.innerHTML = `
            <th class="px-4 py-3 font-medium">Origin</th>
            <th class="px-4 py-3 font-medium">Destination</th>
            <th class="px-4 py-3 font-medium">Gudang Muat</th>
            <th class="px-4 py-3 font-medium">Gudang Bongkar</th>
            <th class="px-4 py-3 font-medium">KM</th>
            <th class="px-4 py-3 font-medium">Type Mobil</th>
            <th class="px-4 py-3 font-medium">Total Cost</th>
            <th class="px-4 py-3 font-medium text-center">Action</th>
        `;
    } else {
        thead.innerHTML = `
            <th class="px-4 py-3 font-medium">Origin</th>
            <th class="px-4 py-3 font-medium">Destination</th>
            <th class="px-4 py-3 font-medium">Layanan</th>
            <th class="px-4 py-3 font-medium">Gudang Muat</th>
            <th class="px-4 py-3 font-medium">Gudang Bongkar</th>
            <th class="px-4 py-3 font-medium">Truck Type</th>
            <th class="px-4 py-3 font-medium">Temas Total</th>
            <th class="px-4 py-3 font-medium">Meratus Total</th>
            <th class="px-4 py-3 font-medium text-center">Action</th>
        `;
    }
    
    tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center"><div class="spinner mx-auto border-gray-400"></div></td></tr>`;
    
    try {
        const res = await App.api(`/master-biaya/list?type=${currentMasterBiayaType}&search=${encodeURIComponent(currentMasterBiayaSearch)}&page=${currentMasterBiayaPage}&limit=20`);
        
        document.getElementById('mb-total').textContent = res.total;
        document.getElementById('mb-page-info').textContent = `Page ${currentMasterBiayaPage} of ${Math.ceil(res.total/20) || 1}`;
        document.getElementById('btn-prev').disabled = currentMasterBiayaPage <= 1;
        document.getElementById('btn-next').disabled = currentMasterBiayaPage >= Math.ceil(res.total/20);
        
        if (res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-gray-500"><i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i> No data found</td></tr>`;
            lucide.createIcons();
            return;
        }
        
        const canDetail = App.user && App.user.role !== 'user'; // role user tidak punya tombol Detail
        tbody.innerHTML = res.data.map(item => {
            const origin = [item.origin_provinsi, item.origin_kota, item.origin_kecamatan].filter(Boolean).join(', ');
            const dest = [item.destination_provinsi, item.destination_kota, item.destination_kecamatan].filter(Boolean).join(', ');
            
            if (currentMasterBiayaType === 'land') {
                return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3">${App.esc(origin || '-')}</td>
                    <td class="px-4 py-3">${App.esc(dest || '-')}</td>
                    <td class="px-4 py-3">${App.esc(item.gudang_muat || '-')}</td>
                    <td class="px-4 py-3">${App.esc(item.gudang_bongkar || '-')}</td>
                    <td class="px-4 py-3">${App.esc(item.km || '-')}</td>
                    <td class="px-4 py-3">${App.esc(item.type_mobil || '-')}</td>
                    <td class="px-4 py-3 font-medium">${App.formatRp(item.total)}</td>
                    <td class="px-4 py-3 text-center">
                        ${canDetail ? `<button onclick="App.loadPage('master-detail-biaya', {id: '${item.id}', type: 'land'})" class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded border border-blue-200 text-xs font-medium transition">Detail</button>` : ''}
                    </td>
                </tr>
                `;
            } else {
                return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3">${App.esc(origin || '-')}</td>
                    <td class="px-4 py-3">${App.esc(dest || '-')}</td>
                    <td class="px-4 py-3">${App.esc(serviceLabel(item.service_type))}</td>
                    <td class="px-4 py-3">${App.esc(item.gudang_muat || '-')}</td>
                    <td class="px-4 py-3">${App.esc(item.gudang_bongkar || '-')}</td>
                    <td class="px-4 py-3">${App.esc(item.truck_type || '-')}</td>
                    <td class="px-4 py-3 font-medium">${App.formatRp(item.temas_total_cost_pph)}</td>
                    <td class="px-4 py-3 font-medium">${App.formatRp(item.meratus_total_cost_pph)}</td>
                    <td class="px-4 py-3 text-center">
                        ${canDetail ? `<button onclick="App.loadPage('master-detail-biaya', {id: '${item.id}', type: 'sea'})" class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded border border-blue-200 text-xs font-medium transition">Detail</button>` : ''}
                    </td>
                </tr>
                `;
            }
        }).join('');
        lucide.createIcons();
        
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-red-500">Failed to load data</td></tr>`;
    }
}
