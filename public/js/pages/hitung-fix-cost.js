let hfcLocations = [];
let hfcCurrentCostId = null;
let hfcOriginalCost = 0;
let hfcCurrentRow = null;
let hfcTariffs = [];      // baris tarif pada rute terpilih (bisa >1: beda type truck)
let hfcTariffKind = 'land';

function renderHitungFixCost() {
    return `
    <div class="max-w-5xl mx-auto space-y-6">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-6 border-b pb-4">Cari Route Cost</h3>
            
            <div class="mb-6 flex gap-6">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="hfc_type" value="land" checked class="w-4 h-4 text-blue-600 focus:ring-blue-500">
                    <span class="font-medium text-gray-700">Darat (Land)</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="hfc_type" value="sea" class="w-4 h-4 text-blue-600 focus:ring-blue-500">
                    <span class="font-medium text-gray-700">Laut (Sea)</span>
                </label>
            </div>

            <!-- Jenis layanan: darat = Door to Door (tetap); laut = pilih -->
            <div class="mb-6 max-w-xs">
                <label class="block text-sm text-gray-500 mb-1">Jenis Layanan</label>
                <p id="svc-land" class="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800">Door to Door</p>
                <select id="hfc-service" class="hidden w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="door_to_port">Door to Port</option>
                    <option value="port_to_port">Port to Port</option>
                    <option value="port_to_door">Port to Door</option>
                </select>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <!-- Origin -->
                <div class="space-y-4">
                    <h4 class="font-medium text-gray-700 flex items-center gap-2"><i data-lucide="map-pin" class="w-4 h-4 text-green-500"></i> Origin</h4>
                    <div>
                        <label class="block text-sm text-gray-500 mb-1">Provinsi</label>
                        <select id="orig-prov" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Pilih...</option></select>
                    </div>
                    <div>
                        <label class="block text-sm text-gray-500 mb-1">Kota</label>
                        <select id="orig-kota" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none" disabled><option value="">Pilih...</option></select>
                    </div>
                    <div>
                        <label class="block text-sm text-gray-500 mb-1">Kecamatan</label>
                        <select id="orig-kec" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none" disabled><option value="">Pilih...</option></select>
                    </div>
                </div>

                <!-- Destination -->
                <div class="space-y-4">
                    <h4 class="font-medium text-gray-700 flex items-center gap-2"><i data-lucide="map-pin" class="w-4 h-4 text-red-500"></i> Destination</h4>
                    <div>
                        <label class="block text-sm text-gray-500 mb-1">Provinsi</label>
                        <select id="dest-prov" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Pilih...</option></select>
                    </div>
                    <div>
                        <label class="block text-sm text-gray-500 mb-1">Kota</label>
                        <select id="dest-kota" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none" disabled><option value="">Pilih...</option></select>
                    </div>
                    <div>
                        <label class="block text-sm text-gray-500 mb-1">Kecamatan</label>
                        <select id="dest-kec" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none" disabled><option value="">Pilih...</option></select>
                    </div>
                </div>
            </div>
            
            <div class="mt-8 flex justify-center">
                <button id="btn-cek-biaya" class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-8 rounded-lg shadow transition flex items-center gap-2">
                    <i data-lucide="search" class="w-5 h-5"></i> Cek Biaya
                </button>
            </div>
        </div>

        <!-- Cost Calculation Panel -->
        <div id="cost-panel" class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hidden">
            <h3 class="text-lg font-semibold text-gray-800 mb-6 border-b pb-4">Kalkulasi Fix Cost</h3>
            
            <!-- Detail pengiriman (gudang dari Master Biaya; sisanya diisi manual) -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 pb-6 border-b border-gray-100">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Gudang Muat</label>
                    <p id="gudang-muat" class="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800">-</p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Gudang Bongkar</label>
                    <p id="gudang-bongkar" class="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800">-</p>
                </div>
                <div class="hidden md:block"></div>
                <div id="tariff-wrap" class="hidden">
                    <label id="tariff-label" class="block text-sm font-medium text-gray-700 mb-1">Type Truck</label>
                    <select id="tariff-select" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none"></select>
                    <p id="tariff-static" class="hidden px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800"></p>
                </div>
                <div id="container-wrap" class="hidden">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Type Container <span class="text-red-500">*</span></label>
                    <input type="text" id="container-type" list="container-list" maxlength="50" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none" placeholder="mis. 20ft / 40ft / 40HC">
                    <datalist id="container-list"><option value="20ft"><option value="40ft"><option value="40HC"></datalist>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Berat / Tonase (ton) <span id="ton-req" class="text-red-500">*</span></label>
                    <input type="number" id="tonnage" min="0" step="any" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none" placeholder="mis. 8.5">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah Truk <span class="text-red-500">*</span></label>
                    <input type="number" id="truck-count" min="1" step="1" value="1" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Durasi Takedown (hari)</label>
                    <input type="number" id="takedown" min="0" step="any" value="0" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none">
                </div>

                <!-- Pertanyaan biaya tambahan -->
                <div class="md:col-span-3 mt-2 pt-4 border-t border-gray-100">
                    <h4 class="font-medium text-gray-800 mb-3">Biaya Tambahan</h4>
                    <p class="text-xs text-gray-500 mb-3">Semua jasa bersifat opsional. Nominal terisi otomatis dari Master Jasa, tetapi bisa diubah sesuai pengiriman ini.</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        <div>
                            <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="q-multipickup" class="w-4 h-4 text-blue-600"> <span class="text-sm font-medium text-gray-700">Multi Pickup</span></label>
                            <div id="q-multipickup-n" class="hidden mt-2 flex flex-wrap items-center gap-2"><input type="number" id="q-multipickup-points" min="1" step="1" value="1" class="w-24 border-gray-300 rounded-lg p-2 border text-sm focus:ring-2 focus:ring-blue-500 outline-none"> <span class="text-xs text-gray-500">titik x</span> <input type="number" id="q-multipickup-amt" min="0" step="any" placeholder="Rp" class="w-36 border-gray-300 rounded-lg p-2 border text-sm focus:ring-2 focus:ring-blue-500 outline-none"></div>
                        </div>
                        <div>
                            <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="q-multidrop" class="w-4 h-4 text-blue-600"> <span class="text-sm font-medium text-gray-700">Multi Drop</span></label>
                            <div id="q-multidrop-n" class="hidden mt-2 flex flex-wrap items-center gap-2"><input type="number" id="q-multidrop-points" min="1" step="1" value="1" class="w-24 border-gray-300 rounded-lg p-2 border text-sm focus:ring-2 focus:ring-blue-500 outline-none"> <span class="text-xs text-gray-500">titik x</span> <input type="number" id="q-multidrop-amt" min="0" step="any" placeholder="Rp" class="w-36 border-gray-300 rounded-lg p-2 border text-sm focus:ring-2 focus:ring-blue-500 outline-none"></div>
                        </div>
                        <div>
                            <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="q-kawalan" class="w-4 h-4 text-blue-600"> <span class="text-sm font-medium text-gray-700">Kawalan</span></label>
                            <div id="q-kawalan-n" class="hidden mt-2"><input type="number" id="q-kawalan-amt" min="0" step="any" placeholder="Rp" class="w-36 border-gray-300 rounded-lg p-2 border text-sm focus:ring-2 focus:ring-blue-500 outline-none"></div>
                        </div>
                        <div id="q-tkbm-dtp" class="hidden">
                            <label class="block text-sm font-medium text-gray-700 mb-1">TKBM Door to Port ditanggung siapa? (opsional)</label>
                            <select id="q-tkbm-dtp-who" class="w-full border-gray-300 rounded-lg p-2 border text-sm focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Tidak dipilih</option><option value="customer">Customer</option><option value="perusahaan">Perusahaan</option></select>
                            <div id="q-tkbm-dtp-n" class="hidden mt-2"><input type="number" id="q-tkbm-dtp-amt" min="0" step="any" placeholder="Rp" class="w-36 border-gray-300 rounded-lg p-2 border text-sm focus:ring-2 focus:ring-blue-500 outline-none"></div>
                        </div>
                        <div id="q-tkbm-ptd" class="hidden">
                            <label class="block text-sm font-medium text-gray-700 mb-1">TKBM Port to Door ditanggung siapa? (opsional)</label>
                            <select id="q-tkbm-ptd-who" class="w-full border-gray-300 rounded-lg p-2 border text-sm focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Tidak dipilih</option><option value="customer">Customer</option><option value="perusahaan">Perusahaan</option></select>
                            <div id="q-tkbm-ptd-n" class="hidden mt-2"><input type="number" id="q-tkbm-ptd-amt" min="0" step="any" placeholder="Rp" class="w-36 border-gray-300 rounded-lg p-2 border text-sm focus:ring-2 focus:ring-blue-500 outline-none"></div>
                        </div>
                    </div>
                    <div id="q-extra" class="hidden mt-4">
                        <p class="text-sm font-medium text-gray-700 mb-2">Jasa lainnya (opsional)</p>
                        <div id="q-extra-list" class="space-y-2"></div>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="space-y-6">
                    <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <p class="text-sm text-gray-500 mb-1">Original Cost</p>
                        <p id="calc-original-cost" class="text-2xl font-bold text-gray-800">Rp 0</p>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Discount Percentage (%)</label>
                        <div class="relative">
                            <input type="number" id="disc-percent" min="0" max="100" step="0.01" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. 10">
                            <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500">%</div>
                        </div>
                    </div>
                    
                    <div class="text-center text-sm text-gray-400">OR</div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Discount Amount (Rp)</label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">Rp</div>
                            <input type="number" id="disc-rp" min="0" class="w-full pl-10 border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. 500000">
                        </div>
                    </div>
                </div>
                
                <div class="space-y-6 flex flex-col">
                    <div class="bg-blue-50 p-6 rounded-lg border border-blue-200 flex-1 flex flex-col justify-center items-center">
                        <p class="text-sm font-medium text-blue-600 mb-2">Calculated Fix Cost</p>
                        <p id="calc-fix-cost" class="text-4xl font-bold text-blue-700 text-center">Rp 0</p>
                    </div>

                    <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm space-y-1">
                        <div class="flex justify-between"><span class="text-gray-600">Fix Cost per truk</span><span id="sum-fix">Rp 0</span></div>
                        <div class="flex justify-between"><span class="text-gray-600">Biaya tambahan per truk</span><span id="sum-add">Rp 0</span></div>
                        <div class="flex justify-between"><span class="text-gray-600">Jumlah truk</span><span id="sum-trucks">1</span></div>
                        <div class="flex justify-between pt-2 border-t border-gray-200 font-semibold text-gray-800"><span>Total Biaya</span><span id="sum-total">Rp 0</span></div>
                        <div id="sum-detail" class="text-xs text-gray-500 pt-1"></div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea id="hfc-notes" rows="3" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Reason for discount..."></textarea>
                    </div>
                </div>
            </div>
            
            <div class="mt-8 flex justify-end">
                <button id="btn-submit-fix-cost" class="bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-8 rounded-lg shadow transition flex items-center gap-2">
                    <i data-lucide="check-circle" class="w-5 h-5"></i> Ajukan Fix Cost
                </button>
            </div>
        </div>
    </div>
    `;
}

async function renderHitungFixCostInit() {
    hfcLocations = [];
    hfcCurrentCostId = null;
    hfcCurrentRow = null;
    hfcTariffs = [];
    hfcOriginalCost = 0;
    
    document.querySelectorAll('input[name="hfc_type"]').forEach(el => {
        el.addEventListener('change', () => {
            hfcApplyTypeUi();
            loadLocations(el.value);
            document.getElementById('cost-panel').classList.add('hidden');
        });
    });
    document.getElementById('hfc-service').addEventListener('change', () => {
        loadLocations('sea');
        document.getElementById('cost-panel').classList.add('hidden');
    });

    // Pertanyaan biaya tambahan (semua opsional) -> tampilkan kolom nominal & hitung ulang ringkasan
    for (const [chk, box] of [['q-multipickup', 'q-multipickup-n'], ['q-multidrop', 'q-multidrop-n'], ['q-kawalan', 'q-kawalan-n']]) {
        document.getElementById(chk).addEventListener('change', (e) => {
            document.getElementById(box).classList.toggle('hidden', !e.target.checked);
            hfcUpdateSummary();
        });
    }
    for (const [sel, box] of [['q-tkbm-dtp-who', 'q-tkbm-dtp-n'], ['q-tkbm-ptd-who', 'q-tkbm-ptd-n']]) {
        document.getElementById(sel).addEventListener('change', (e) => {
            document.getElementById(box).classList.toggle('hidden', e.target.value !== 'perusahaan');
            hfcUpdateSummary();
        });
    }
    ['q-multipickup-points', 'q-multipickup-amt', 'q-multidrop-points', 'q-multidrop-amt', 'q-kawalan-amt', 'q-tkbm-dtp-amt', 'q-tkbm-ptd-amt', 'truck-count'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('input', hfcUpdateSummary);
        el.addEventListener('change', hfcUpdateSummary);
    });
    
    // Master Jasa & Master Kendaraan (untuk biaya tambahan dan saran type container)
    try {
        hfcJasa = await App.api('/master-jasa');
        const veh = await App.api('/master-kendaraan?category=sea');
        document.getElementById('container-list').innerHTML = veh.map(v => `<option value="${App.esc(v.name)}">`).join('');
    } catch (e) {
        App.showToast('Gagal memuat Master Jasa / Kendaraan', 'warning');
    }

    // Setup cascading
    setupCascading('orig');
    setupCascading('dest');
    
    document.getElementById('btn-cek-biaya').addEventListener('click', cekBiaya);
    
    // Calculate logic
    const inputP = document.getElementById('disc-percent');
    const inputR = document.getElementById('disc-rp');
    
    inputP.addEventListener('input', () => {
        if(inputP.value) inputR.value = '';
        calculateFixCost();
    });
    
    inputR.addEventListener('input', () => {
        if(inputR.value) inputP.value = '';
        calculateFixCost();
    });
    
    document.getElementById('tariff-select').addEventListener('change', (e) => hfcSelectTariff(Number(e.target.value)));
    document.getElementById('btn-submit-fix-cost').addEventListener('click', submitFixCost);
    
    // Initial load
    hfcApplyTypeUi();
    loadLocations('land');
}

let hfcJasa = [];

function hfcType() {
    return document.querySelector('input[name="hfc_type"]:checked').value;
}

// Darat = Door to Door (tetap); laut = pilihan Door to Port / Port to Port / Port to Door
function hfcService() {
    return hfcType() === 'land' ? 'door_to_door' : document.getElementById('hfc-service').value;
}

function hfcApplyTypeUi() {
    const sea = hfcType() === 'sea';
    document.getElementById('svc-land').classList.toggle('hidden', sea);
    document.getElementById('hfc-service').classList.toggle('hidden', !sea);
}

// Pertanyaan yang tampil mengikuti jenis layanan. Semua jasa opsional; nominal bawaan dari Master Jasa (bisa diubah)
function hfcDefaultAmount(type, code) {
    const j = hfcJasa.find(x => x.category === type && x.code === code);
    return j && Number(j.amount) > 0 ? Number(j.amount) : '';
}

function hfcRefreshQuestions() {
    const type = hfcType(), svc = hfcService();
    document.getElementById('q-tkbm-dtp').classList.toggle('hidden', !(type === 'sea' && svc === 'door_to_port'));
    document.getElementById('q-tkbm-ptd').classList.toggle('hidden', !(type === 'sea' && svc === 'port_to_door'));
    document.getElementById('ton-req').classList.toggle('hidden', type !== 'land'); // berat wajib untuk darat

    for (const id of ['q-multipickup', 'q-multidrop', 'q-kawalan']) document.getElementById(id).checked = false;
    for (const id of ['q-multipickup-n', 'q-multidrop-n', 'q-kawalan-n', 'q-tkbm-dtp-n', 'q-tkbm-ptd-n']) document.getElementById(id).classList.add('hidden');
    document.getElementById('q-multipickup-points').value = 1;
    document.getElementById('q-multidrop-points').value = 1;
    document.getElementById('q-multipickup-amt').value = hfcDefaultAmount(type, 'multipickup');
    document.getElementById('q-multidrop-amt').value = hfcDefaultAmount(type, 'multidrop');
    document.getElementById('q-kawalan-amt').value = hfcDefaultAmount(type, 'kawalan');
    document.getElementById('q-tkbm-dtp-amt').value = hfcDefaultAmount(type, 'tkbm_dtp');
    document.getElementById('q-tkbm-ptd-amt').value = hfcDefaultAmount(type, 'tkbm_ptd');
    document.getElementById('q-tkbm-dtp-who').value = '';
    document.getElementById('q-tkbm-ptd-who').value = '';
    document.getElementById('truck-count').value = 1;
    document.getElementById('takedown').value = 0;

    const extras = hfcJasa.filter(j => j.category === type && !j.code);
    document.getElementById('q-extra').classList.toggle('hidden', extras.length === 0);
    document.getElementById('q-extra-list').innerHTML = extras.map(j => `
        <div class="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <label class="flex items-center gap-2 cursor-pointer min-w-[12rem]">
                <input type="checkbox" class="q-extra-chk w-4 h-4 text-blue-600" value="${Number(j.id)}">
                <span>${App.esc(j.name)}</span>
            </label>
            <input type="number" min="0" step="any" placeholder="Rp" value="${Number(j.amount) > 0 ? Number(j.amount) : ''}" data-id="${Number(j.id)}" class="q-extra-amt hidden w-36 border-gray-300 rounded-lg p-2 border text-sm focus:ring-2 focus:ring-blue-500 outline-none">
        </div>`).join('');
    document.querySelectorAll('.q-extra-chk').forEach(el => el.addEventListener('change', () => {
        const amtEl = document.querySelector(`.q-extra-amt[data-id="${el.value}"]`);
        if (amtEl) amtEl.classList.toggle('hidden', !el.checked);
        hfcUpdateSummary();
    }));
    document.querySelectorAll('.q-extra-amt').forEach(el => el.addEventListener('input', hfcUpdateSummary));
}

// Nominal per satuan: isian pengguna bila ada, kalau kosong pakai nominal Master Jasa
function hfcUnit(id, master) {
    const v = document.getElementById(id).value;
    if (v === '') return Number(master && master.amount) || 0;
    return Number(v);
}

// Hitung biaya tambahan per truk dari jawaban (server menghitung ulang saat disimpan)
function hfcAdditional() {
    const type = hfcType();
    const byCode = Object.fromEntries(hfcJasa.filter(j => j.category === type && j.code).map(j => [j.code, j]));
    const lines = [];
    const add = (j, qty, unit) => { if (j && qty > 0 && Number.isFinite(unit) && unit >= 0) lines.push({ name: j.name, subtotal: unit * qty }); };
    const pts = (id) => Math.max(0, parseInt(document.getElementById(id).value, 10) || 0);
    if (document.getElementById('q-multipickup').checked) add(byCode.multipickup, pts('q-multipickup-points'), hfcUnit('q-multipickup-amt', byCode.multipickup));
    if (document.getElementById('q-multidrop').checked) add(byCode.multidrop, pts('q-multidrop-points'), hfcUnit('q-multidrop-amt', byCode.multidrop));
    if (document.getElementById('q-kawalan').checked) add(byCode.kawalan, 1, hfcUnit('q-kawalan-amt', byCode.kawalan));
    if (type === 'sea') {
        if (document.getElementById('q-tkbm-dtp-who').value === 'perusahaan') add(byCode.tkbm_dtp, 1, hfcUnit('q-tkbm-dtp-amt', byCode.tkbm_dtp));
        if (document.getElementById('q-tkbm-ptd-who').value === 'perusahaan') add(byCode.tkbm_ptd, 1, hfcUnit('q-tkbm-ptd-amt', byCode.tkbm_ptd));
    }
    for (const chk of document.querySelectorAll('.q-extra-chk:checked')) {
        const j = hfcJasa.find(x => Number(x.id) === Number(chk.value));
        const amtEl = document.querySelector(`.q-extra-amt[data-id="${chk.value}"]`);
        const unit = !amtEl || amtEl.value === '' ? Number(j && j.amount) || 0 : Number(amtEl.value);
        add(j, 1, unit);
    }
    return { lines, total: lines.reduce((s, l) => s + l.subtotal, 0) };
}

function hfcCurrentFix() {
    let fix = hfcOriginalCost;
    const p = parseFloat(document.getElementById('disc-percent').value);
    const r = parseFloat(document.getElementById('disc-rp').value);
    if (!isNaN(p) && p > 0) fix = hfcOriginalCost - (hfcOriginalCost * (p / 100));
    else if (!isNaN(r) && r > 0) fix = hfcOriginalCost - r;
    return Math.max(0, fix);
}

function hfcUpdateSummary() {
    const trucks = Math.max(1, parseInt(document.getElementById('truck-count').value, 10) || 1);
    const fix = hfcCurrentFix();
    const add = hfcAdditional();
    document.getElementById('sum-fix').textContent = App.formatRp(fix);
    document.getElementById('sum-add').textContent = App.formatRp(add.total);
    document.getElementById('sum-trucks').textContent = trucks;
    document.getElementById('sum-total').textContent = App.formatRp((fix + add.total) * trucks);
    document.getElementById('sum-detail').textContent = add.lines.map(l => `${l.name}: ${App.formatRp(l.subtotal)}`).join(' | ');
}

// Backend mengirim pasangan origin_* / destination_*. prefix 'orig' -> origin_*, 'dest' -> destination_*
function hfcPlace(prefix, l) {
    const k = prefix === 'orig' ? 'origin' : 'destination';
    return { provinsi: l[k + '_provinsi'], kota: l[k + '_kota'], kecamatan: l[k + '_kecamatan'] };
}

function hfcUnique(values) {
    return [...new Set(values.filter(Boolean))].sort();
}

function hfcOptions(list, placeholder) {
    return `<option value="">${placeholder}</option>` + list.map(v => `<option value="${App.esc(v)}">${App.esc(v)}</option>`).join('');
}

async function loadLocations(type) {
    try {
        const svcQ = type === 'sea' ? `&service_type=${encodeURIComponent(hfcService())}` : '';
        hfcLocations = await App.api(`/master-biaya/locations?type=${type}${svcQ}`);
        
        for (const prefix of ['orig', 'dest']) {
            const provs = hfcUnique(hfcLocations.map(l => hfcPlace(prefix, l).provinsi));
            const sel = document.getElementById(`${prefix}-prov`);
            sel.innerHTML = hfcOptions(provs, 'Pilih Provinsi...');
            sel.disabled = false;
            for (const part of ['kota', 'kec']) {
                const el = document.getElementById(`${prefix}-${part}`);
                el.innerHTML = '<option value="">Pilih...</option>';
                el.disabled = true;
            }
        }
        
        if (hfcLocations.length === 0) {
            App.showToast('Master Biaya belum punya data dengan tujuan terisi. Lengkapi dulu lewat Master Biaya > Edit.', 'warning');
        }
    } catch (e) {
        App.showToast('Failed to load locations', 'error');
    }
}

function setupCascading(prefix) {
    const provSel = document.getElementById(`${prefix}-prov`);
    const kotaSel = document.getElementById(`${prefix}-kota`);
    const kecSel = document.getElementById(`${prefix}-kec`);
    
    provSel.addEventListener('change', () => {
        const prov = provSel.value;
        if (!prov) {
            kotaSel.innerHTML = '<option value="">Pilih...</option>'; kotaSel.disabled = true;
            kecSel.innerHTML = '<option value="">Pilih...</option>'; kecSel.disabled = true;
            return;
        }
        
        const kotas = hfcUnique(hfcLocations.map(l => hfcPlace(prefix, l)).filter(p => p.provinsi === prov).map(p => p.kota));
        kotaSel.innerHTML = hfcOptions(kotas, 'Pilih Kota...');
        kotaSel.disabled = false;
        
        kecSel.innerHTML = '<option value="">Pilih...</option>';
        kecSel.disabled = true;
    });
    
    kotaSel.addEventListener('change', () => {
        const prov = provSel.value;
        const kota = kotaSel.value;
        if (!kota) {
            kecSel.innerHTML = '<option value="">Pilih...</option>'; kecSel.disabled = true;
            return;
        }
        
        const kecs = hfcUnique(hfcLocations.map(l => hfcPlace(prefix, l)).filter(p => p.provinsi === prov && p.kota === kota).map(p => p.kecamatan));
        kecSel.innerHTML = hfcOptions(kecs, 'Pilih Kecamatan...');
        kecSel.disabled = false;
    });
}

async function cekBiaya() {
    const type = document.querySelector('input[name="hfc_type"]:checked').value;
    const okec = document.getElementById('orig-kec').value;
    const dkec = document.getElementById('dest-kec').value;
    
    if (!okec || !dkec) {
        App.showToast('Lengkapi Origin dan Destination', 'warning');
        return;
    }
    
    const btn = document.getElementById('btn-cek-biaya');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<div class="spinner w-5 h-5 border-2"></div> Mencari...';
    btn.disabled = true;
    
    try {
        const svcQ = type === 'sea' ? `&service_type=${encodeURIComponent(hfcService())}` : '';
        const rows = await App.api(`/master-biaya/get-costs?type=${type}&origin_kecamatan=${encodeURIComponent(okec)}&dest_kecamatan=${encodeURIComponent(dkec)}${svcQ}`);
        
        if (!rows || rows.length === 0) {
            App.showToast('Route tidak ditemukan di Master Biaya', 'error');
            document.getElementById('cost-panel').classList.add('hidden');
            return;
        }
        
        // Kolom biaya: land = total, sea = submit_value. Baris yang biayanya belum diisi tidak bisa dipilih.
        const priced = rows.filter(r => (Number(type === 'land' ? r.total : r.submit_value) || 0) > 0);
        if (priced.length === 0) {
            App.showToast('Biaya route ini belum diisi di Master Biaya. Lengkapi dulu lewat Master Biaya > Edit.', 'warning');
            document.getElementById('cost-panel').classList.add('hidden');
            return;
        }
        
        hfcTariffs = priced;
        hfcTariffKind = type;
        
        document.getElementById('disc-percent').value = '';
        document.getElementById('disc-rp').value = '';
        document.getElementById('hfc-notes').value = '';
        document.getElementById('tonnage').value = '';
        document.getElementById('container-type').value = '';
        document.getElementById('container-wrap').classList.toggle('hidden', type !== 'sea');
        hfcRefreshQuestions();
        hfcRenderTariffs();
        
        document.getElementById('cost-panel').classList.remove('hidden');
        
    } catch (e) {
        App.showToast('Route tidak ditemukan di Master Biaya', 'error');
        document.getElementById('cost-panel').classList.add('hidden');
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
}

function hfcTariffName(row) {
    return (hfcTariffKind === 'land' ? row.type_mobil : row.truck_type) || '';
}

function hfcTariffCost(row) {
    return Number(hfcTariffKind === 'land' ? row.total : row.submit_value) || 0;
}

// Satu rute bisa punya beberapa tarif (type truck berbeda): >1 -> dropdown, 1 -> teks saja
function hfcRenderTariffs() {
    const wrap = document.getElementById('tariff-wrap');
    const sel = document.getElementById('tariff-select');
    const stat = document.getElementById('tariff-static');
    document.getElementById('tariff-label').textContent = hfcTariffKind === 'land' ? 'Type Truck' : 'Truck Type';
    
    if (hfcTariffs.length > 1) {
        sel.innerHTML = hfcTariffs.map((r, i) => `<option value="${i}">${App.esc(hfcTariffName(r) || 'Tanpa tipe')}${r.gudang_muat || r.gudang_bongkar ? ` (${App.esc(r.gudang_muat || '-')} → ${App.esc(r.gudang_bongkar || '-')})` : ''} - ${App.esc(App.formatRp(hfcTariffCost(r)))}</option>`).join('');
        sel.classList.remove('hidden');
        stat.classList.add('hidden');
        wrap.classList.remove('hidden');
    } else {
        const name = hfcTariffName(hfcTariffs[0]);
        sel.classList.add('hidden');
        sel.innerHTML = '';
        stat.textContent = name;
        stat.classList.toggle('hidden', !name);
        wrap.classList.toggle('hidden', !name);
    }
    hfcSelectTariff(0);
}

function hfcSelectTariff(i) {
    const row = hfcTariffs[i];
    if (!row) return;
    hfcCurrentRow = row;
    hfcCurrentCostId = row.id;
    hfcOriginalCost = hfcTariffCost(row);
    document.getElementById('calc-original-cost').textContent = App.formatRp(hfcOriginalCost);
    document.getElementById('gudang-muat').textContent = row.gudang_muat || '-';
    document.getElementById('gudang-bongkar').textContent = row.gudang_bongkar || '-';
    calculateFixCost();
}

function calculateFixCost() {
    let fix = hfcOriginalCost;
    const p = parseFloat(document.getElementById('disc-percent').value);
    const r = parseFloat(document.getElementById('disc-rp').value);
    
    if (!isNaN(p) && p > 0) {
        fix = hfcOriginalCost - (hfcOriginalCost * (p / 100));
    } else if (!isNaN(r) && r > 0) {
        fix = hfcOriginalCost - r;
    }
    
    if (fix < 0) fix = 0;
    
    document.getElementById('calc-fix-cost').textContent = App.formatRp(fix);
    hfcUpdateSummary();
}

async function submitFixCost() {
    if (!hfcCurrentCostId || !hfcCurrentRow) return;
    
    let fix = hfcOriginalCost;
    const p = parseFloat(document.getElementById('disc-percent').value);
    const r = parseFloat(document.getElementById('disc-rp').value);
    
    let disc_percent = 0;
    let disc_amount = 0;
    
    if (!isNaN(p) && p > 0) {
        if (p > 100) { App.showToast('Discount tidak boleh lebih dari 100%', 'warning'); return; }
        disc_percent = p;
        fix = hfcOriginalCost - (hfcOriginalCost * (p / 100));
    } else if (!isNaN(r) && r > 0) {
        if (r > hfcOriginalCost) { App.showToast('Discount tidak boleh lebih besar dari Original Cost', 'warning'); return; }
        disc_amount = r;
        fix = hfcOriginalCost - r;
    }
    
    const notes = document.getElementById('hfc-notes').value;
    const type = document.querySelector('input[name="hfc_type"]:checked').value;
    const row = hfcCurrentRow;
    
    // Detail pengiriman (diisi manual)
    const tonRaw = document.getElementById('tonnage').value;
    const ton = parseFloat(tonRaw);
    if (type === 'land' && (isNaN(ton) || ton <= 0)) { App.showToast('Berat (tonase) wajib diisi untuk pengiriman darat (lebih dari 0)', 'warning'); return; }
    if (tonRaw !== '' && (isNaN(ton) || ton <= 0)) { App.showToast('Tonase harus lebih dari 0', 'warning'); return; }
    const container = type === 'sea' ? document.getElementById('container-type').value.trim() : '';
    if (type === 'sea' && !container) { App.showToast('Type Container wajib diisi', 'warning'); return; }

    const trucks = Number(document.getElementById('truck-count').value);
    if (!Number.isInteger(trucks) || trucks < 1) { App.showToast('Jumlah truk minimal 1 (bilangan bulat)', 'warning'); return; }
    const takedown = parseFloat(document.getElementById('takedown').value) || 0;
    if (takedown < 0) { App.showToast('Durasi takedown tidak boleh negatif', 'warning'); return; }

    const svc = hfcService();
    const tkbmDtp = document.getElementById('q-tkbm-dtp-who').value;
    const tkbmPtd = document.getElementById('q-tkbm-ptd-who').value;
    const pts = (chk, id) => document.getElementById(chk).checked ? Math.max(1, parseInt(document.getElementById(id).value, 10) || 1) : 0;
    
    // Semua jasa opsional. Nominal per satuan dikirim hanya untuk jasa yang dipilih (kosong = pakai Master Jasa)
    const amountOf = (id) => { const v = document.getElementById(id).value; return v === '' ? undefined : Number(v); };
    const jasaAmounts = {};
    if (document.getElementById('q-multipickup').checked) jasaAmounts.multipickup = amountOf('q-multipickup-amt');
    if (document.getElementById('q-multidrop').checked) jasaAmounts.multidrop = amountOf('q-multidrop-amt');
    if (document.getElementById('q-kawalan').checked) jasaAmounts.kawalan = amountOf('q-kawalan-amt');
    if (type === 'sea' && svc === 'door_to_port' && tkbmDtp === 'perusahaan') jasaAmounts.tkbm_dtp = amountOf('q-tkbm-dtp-amt');
    if (type === 'sea' && svc === 'port_to_door' && tkbmPtd === 'perusahaan') jasaAmounts.tkbm_ptd = amountOf('q-tkbm-ptd-amt');
    const extraJasa = [...document.querySelectorAll('.q-extra-chk:checked')].map(c => {
        const a = document.querySelector(`.q-extra-amt[data-id="${c.value}"]`);
        return { id: Number(c.value), amount: a && a.value !== '' ? Number(a.value) : undefined };
    });
    const badAmount = [...Object.values(jasaAmounts), ...extraJasa.map(e => e.amount)].some(v => v !== undefined && (!Number.isFinite(v) || v < 0));
    if (badAmount) { App.showToast('Nominal jasa harus berupa angka 0 atau lebih', 'warning'); return; }
    
    // Bentuk kiriman mengikuti POST /fix-cost/create
    const payload = {
        transport_type: type,
        origin_provinsi: row.origin_provinsi,
        origin_kota: row.origin_kota,
        origin_kecamatan: row.origin_kecamatan,
        destination_provinsi: row.destination_provinsi,
        destination_kota: row.destination_kota,
        destination_kecamatan: row.destination_kecamatan,
        original_cost: hfcOriginalCost,
        discount_percentage: disc_percent,
        discount_amount: disc_amount,
        fix_cost: fix,
        notes: notes,
        truck_type: hfcTariffName(row) || null,
        container_type: container || null,
        tonnage: isNaN(ton) ? null : ton,
        service_type: svc,
        gudang_muat: row.gudang_muat || null,
        gudang_bongkar: row.gudang_bongkar || null,
        truck_count: trucks,
        takedown_duration: takedown,
        multipickup_points: pts('q-multipickup', 'q-multipickup-points'),
        multidrop_points: pts('q-multidrop', 'q-multidrop-points'),
        kawalan: document.getElementById('q-kawalan').checked ? 1 : 0,
        tkbm_dtp: type === 'sea' && svc === 'door_to_port' ? tkbmDtp : null,
        tkbm_ptd: type === 'sea' && svc === 'port_to_door' ? tkbmPtd : null,
        jasa_amounts: jasaAmounts,
        extra_jasa: extraJasa
    };
    
    const btn = document.getElementById('btn-submit-fix-cost');
    btn.disabled = true;
    
    try {
        await App.api('/fix-cost/create', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        App.showToast('Pengajuan Fix Cost berhasil dibuat', 'success');
        App.loadPage('history-fix-cost');
        
    } catch (e) {
        App.showToast(e.message, 'error');
        btn.disabled = false;
    }
}
