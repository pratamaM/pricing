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
            
            <!-- Detail pengiriman (diisi manual) -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 pb-6 border-b border-gray-100">
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
                    <label class="block text-sm font-medium text-gray-700 mb-1">Tonase (ton) <span class="text-red-500">*</span></label>
                    <input type="number" id="tonnage" min="0" step="any" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none" placeholder="mis. 8.5">
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
            loadLocations(el.value);
            document.getElementById('cost-panel').classList.add('hidden');
        });
    });
    
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
    loadLocations('land');
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
        hfcLocations = await App.api(`/master-biaya/locations?type=${type}`);
        
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
        const rows = await App.api(`/master-biaya/get-costs?type=${type}&origin_kecamatan=${encodeURIComponent(okec)}&dest_kecamatan=${encodeURIComponent(dkec)}`);
        
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
        sel.innerHTML = hfcTariffs.map((r, i) => `<option value="${i}">${App.esc(hfcTariffName(r) || 'Tanpa tipe')} - ${App.esc(App.formatRp(hfcTariffCost(r)))}</option>`).join('');
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
    const ton = parseFloat(document.getElementById('tonnage').value);
    if (isNaN(ton) || ton <= 0) { App.showToast('Tonase wajib diisi (lebih dari 0)', 'warning'); return; }
    const container = type === 'sea' ? document.getElementById('container-type').value.trim() : '';
    if (type === 'sea' && !container) { App.showToast('Type Container wajib diisi', 'warning'); return; }
    
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
        tonnage: ton
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
