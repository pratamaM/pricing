// Jenis layanan (dipakai juga oleh halaman lain). Darat = Door to Door; Laut = 3 pilihan di bawah.
const SERVICE_LABELS = {
    door_to_door: 'Door to Door',
    door_to_port: 'Door to Port',
    port_to_port: 'Port to Port',
    port_to_door: 'Port to Door'
};
function serviceLabel(code) {
    return SERVICE_LABELS[code] || '-';
}

function renderMasterDetailBiaya(params) {
    return `
    <div class="space-y-6 max-w-4xl mx-auto">
        <div>
            <button id="btn-back" class="flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors">
                <i data-lucide="arrow-left" class="w-4 h-4"></i>
                <span>Back to List</span>
            </button>
        </div>
        
        <div id="detail-content" class="space-y-6">
            <div class="flex justify-center p-12">
                <div class="spinner"></div>
            </div>
        </div>
    </div>
    `;
}

async function renderMasterDetailBiayaInit(params) {
    document.getElementById('btn-back').addEventListener('click', () => App.loadPage('master-biaya'));
    await loadMasterDetail(params);
}

async function loadMasterDetail(params) {
    try {
        const data = await App.api(`/master-biaya/detail/${params.id}?type=${params.type}`);
        const content = document.getElementById('detail-content');
        
        let headerHtml = '';
        let rowsHtml = '';
        
        if (params.type === 'land') {
            headerHtml = `
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-500">Origin</p>
                        <p class="font-medium">${mdLoc(data, 'origin')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Destination</p>
                        <p class="font-medium">${mdLoc(data, 'destination')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Distance (KM)</p>
                        <p class="font-medium">${mdEsc(data.km || '-')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Type Mobil</p>
                        <p class="font-medium">${mdEsc(data.type_mobil || '-')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Layanan</p>
                        <p class="font-medium">${mdEsc(serviceLabel('door_to_door'))}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Gudang Muat</p>
                        <p class="font-medium">${mdEsc(data.gudang_muat || '-')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Gudang Bongkar</p>
                        <p class="font-medium">${mdEsc(data.gudang_bongkar || '-')}</p>
                    </div>
                </div>
            `;
            
            const fields = [
                ['UJ Sopir', data.uj_sopir],
                ['Tip Muat', data.tip_muat],
                ['Tip Bongkar', data.tip_bongkar],
                ['TKBM', data.tkbm],
                ['Maint Fee', data.maint_fee],
                ['Risk Claim + IT', data.risk_claim_it],
                ['Total Cost', data.total_cost],
                ['Marketing', data.marketing],
                ['Total Cost + Profit + PPH', data.cost_pph],
                ['Jasa', data.jasa]
            ];
            
            rowsHtml = fields.map(f => `
                <div class="flex justify-between py-2 border-b border-gray-50 last:border-0">
                    <span class="text-gray-600">${f[0]}</span>
                    <span class="font-medium">${App.formatRp(f[1])}</span>
                </div>
            `).join('');
            
            rowsHtml += `
                <div class="flex justify-between py-3 mt-2 border-t-2 border-gray-200">
                    <span class="font-bold text-gray-800">Total (Submit)</span>
                    <span class="font-bold text-lg text-blue-600">${App.formatRp(data.total)}</span>
                </div>
            `;
            
        } else {
            headerHtml = `
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2 sm:col-span-1">
                        <p class="text-sm text-gray-500">Origin</p>
                        <p class="font-medium">${mdLoc(data, 'origin')}</p>
                    </div>
                    <div class="col-span-2 sm:col-span-1">
                        <p class="text-sm text-gray-500">Destination</p>
                        <p class="font-medium">${mdLoc(data, 'destination')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Layanan</p>
                        <p class="font-medium">${mdEsc(serviceLabel(data.service_type))}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Gudang Muat</p>
                        <p class="font-medium">${mdEsc(data.gudang_muat || '-')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Gudang Bongkar</p>
                        <p class="font-medium">${mdEsc(data.gudang_bongkar || '-')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Port Origin</p>
                        <p class="font-medium">${mdEsc(data.port_origin || '-')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Port Destination</p>
                        <p class="font-medium">${mdEsc(data.port_destination || '-')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">Truck Type</p>
                        <p class="font-medium">${mdEsc(data.truck_type || '-')}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">KM Truck Origin</p>
                        <p class="font-medium">${mdEsc(data.km_truck_origin || '-')}</p>
                    </div>
                </div>
            `;
            
            const fields = [
                ['Trucking Origin', data.trucking_origin],
                ['Maint Fee', data.maint_fee],
                ['Investasi Truck', data.investasi_truck],
                ['THC Origin + LOLO', data.thc_origin_lolo],
                ['THC Dest', data.thc_dest, data.thc_dest_note],
                ['Agent', data.agent],
                ['TKBM', data.tkbm, data.tkbm_note],
                ['DO + Clean', data.do_clean],
                ['Risk Claim', data.risk_claim],
                ['Marketing', data.marketing],
                ['Profit', data.profit],
                ['Jasa', data.jasa],
                ['Temas Freight', data.temas_freight],
                ['Temas LSS', data.temas_lss],
                ['Meratus Freight', data.meratus_freight],
                ['Meratus LSS', data.meratus_lss]
            ];
            
            rowsHtml = fields.map(f => `
                <div class="flex justify-between py-2 border-b border-gray-50 last:border-0">
                    <span class="text-gray-600">${f[0]}</span>
                    <span class="font-medium">${f[2] && !Number(f[1]) ? mdEsc(f[2]) : App.formatRp(f[1])}</span>
                </div>
            `).join('');
            
            rowsHtml += `
                <div class="flex flex-col gap-2 py-4 mt-2 border-t-2 border-gray-200 bg-gray-50 px-4 -mx-4 rounded-b-lg">
                    <div class="flex justify-between">
                        <span class="font-semibold text-gray-700">Temas Total</span>
                        <span class="font-bold text-gray-800">${App.formatRp(data.temas_total_cost_pph)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="font-semibold text-gray-700">Meratus Total</span>
                        <span class="font-bold text-gray-800">${App.formatRp(data.meratus_total_cost_pph)}</span>
                    </div>
                    <div class="flex justify-between mt-2 pt-2 border-t border-gray-200">
                        <span class="font-bold text-gray-900 text-lg">Submit Value</span>
                        <span class="font-bold text-xl text-blue-600">${App.formatRp(data.submit_value)}</span>
                    </div>
                </div>
            `;
        }
        
        content.innerHTML = `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="bg-blue-50/50 p-5 border-b border-gray-100">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <i data-lucide="map-pin" class="w-5 h-5 text-blue-500"></i> Route Information
                    </h3>
                    ${headerHtml}
                </div>
                
                <div class="p-5">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <i data-lucide="coins" class="w-5 h-5 text-yellow-500"></i> Cost Breakdown
                    </h3>
                    <div class="space-y-1">
                        ${rowsHtml}
                    </div>
                </div>
            </div>
        `;
        
        if (mdCanEdit()) {
            const bar = document.createElement('div');
            bar.className = 'flex justify-end';
            bar.innerHTML = `<button id="btn-edit" class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"><i data-lucide="pencil" class="w-4 h-4"></i> Edit</button>`;
            content.insertBefore(bar, content.firstChild);
            document.getElementById('btn-edit').addEventListener('click', () => mdShowEditForm(params, data));
        }
        
        lucide.createIcons();
        
    } catch (e) {
        document.getElementById('detail-content').innerHTML = `
            <div class="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3">
                <i data-lucide="alert-circle"></i> Failed to load details: ${e.message}
            </div>
        `;
        lucide.createIcons();
    }
}


// ---------- Helper & edit ----------
function mdLoc(data, side) {
    return mdEsc([data[side + '_provinsi'], data[side + '_kota'], data[side + '_kecamatan']].filter(Boolean).join(' - ') || '-');
}

// Sama dengan hak upload di backend
function mdCanEdit() {
    return ['superadmin', 'admin', 'supervisor', 'atasan'].includes(App.user && App.user.role);
}

function mdEsc(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
}

const MD_LOC_FIELDS = [
    ['origin_provinsi', 'Origin Provinsi', 'text'], ['origin_kota', 'Origin Kota/Kabupaten', 'text'], ['origin_kecamatan', 'Origin Kecamatan', 'text'],
    ['destination_provinsi', 'Destination Provinsi', 'text'], ['destination_kota', 'Destination Kota/Kabupaten', 'text'], ['destination_kecamatan', 'Destination Kecamatan', 'text']
];

const MD_FIELDS = {
    land: [...MD_LOC_FIELDS,
        ['gudang_muat', 'Gudang Muat', 'text'], ['gudang_bongkar', 'Gudang Bongkar', 'text'],
        ['km', 'KM', 'num'], ['type_mobil', 'Type Mobil', 'text'],
        ['uj_sopir', 'UJ Sopir', 'num'], ['tip_muat', 'Tip Muat', 'num'], ['tip_bongkar', 'Tip Bongkar', 'num'], ['tkbm', 'TKBM', 'num'],
        ['maint_fee', 'Maint Fee', 'num'], ['risk_claim_it', 'Risk Claim + IT', 'num'], ['marketing', 'Marketing', 'num'],
        ['total_cost', 'Total Cost', 'num'], ['cost_pph', 'Total Cost + Profit + PPH', 'num'], ['total', 'Total (Submit)', 'num'], ['jasa', 'Jasa', 'num']],
    sea: [...MD_LOC_FIELDS,
        ['service_type', 'Layanan', 'svc'], ['gudang_muat', 'Gudang Muat', 'text'], ['gudang_bongkar', 'Gudang Bongkar', 'text'],
        ['port_origin', 'Port Origin', 'text'], ['port_destination', 'Port Destination', 'text'],
        ['truck_type', 'Truck Type', 'text'], ['km_truck_origin', 'KM Truck Origin', 'num'],
        ['trucking_origin', 'Trucking Origin', 'num'], ['maint_fee', 'Maint Fee', 'num'], ['investasi_truck', 'Investasi Truck', 'num'], ['thc_origin_lolo', 'THC Origin + LOLO', 'num'], ['thc_dest', 'THC Dest', 'num'],
        ['agent', 'Agent', 'num'], ['tkbm', 'TKBM', 'num'], ['do_clean', 'DO + Clean', 'num'], ['risk_claim', 'Risk Claim', 'num'],
        ['marketing', 'Marketing', 'num'], ['profit', 'Profit', 'num'], ['jasa', 'Jasa', 'num'],
        ['thc_dest_note', 'Catatan THC Dest (mis. Include Agent)', 'text'], ['tkbm_note', 'Catatan TKBM (mis. FOT)', 'text'],
        ['temas_freight', 'Temas Freight', 'num'], ['temas_lss', 'Temas LSS', 'num'], ['temas_total_cost_pph', 'Temas Total', 'num'],
        ['meratus_freight', 'Meratus Freight', 'num'], ['meratus_lss', 'Meratus LSS', 'num'], ['meratus_total_cost_pph', 'Meratus Total', 'num'],
        ['submit_value', 'Submit Value', 'num']]
};

async function mdShowEditForm(params, data) {
    const fields = MD_FIELDS[params.type];
    // Saran type kendaraan dari Master Kendaraan (tetap boleh diketik bebas)
    let vehicles = [];
    try { vehicles = await App.api(`/master-kendaraan?category=${params.type}`); } catch (e) { /* daftar saran saja */ }
    const inputs = fields.map(([name, label, kind]) => {
        const cls = 'mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';
        if (kind === 'svc') {
            const opts = ['door_to_port', 'port_to_port', 'port_to_door'].map(v => `<option value="${v}" ${data[name] === v ? 'selected' : ''}>${SERVICE_LABELS[v]}</option>`).join('');
            return `<label class="block"><span class="text-sm text-gray-600">${label}</span><select id="ef-${name}" class="${cls}">${opts}</select></label>`;
        }
        const isVehicle = name === 'type_mobil' || name === 'truck_type';
        return `
        <label class="block">
            <span class="text-sm text-gray-600">${label}</span>
            <input id="ef-${name}" type="${kind === 'num' ? 'number' : 'text'}" ${kind === 'num' ? 'min="0" step="any"' : ''} ${isVehicle ? 'list="ef-vehicle-list"' : ''}
                value="${mdEsc(data[name])}"
                class="${cls}">
        </label>`;
    }).join('') + `<datalist id="ef-vehicle-list">${vehicles.map(v => `<option value="${mdEsc(v.name)}">`).join('')}</datalist>`;

    document.getElementById('detail-content').innerHTML = `
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">Edit Master Biaya (${params.type === 'land' ? 'Land' : 'Sea'})</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${inputs}</div>
            <div class="flex justify-end gap-3 mt-6">
                <button id="btn-edit-cancel" class="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Batal</button>
                <button id="btn-edit-save" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Simpan</button>
            </div>
        </div>`;

    document.getElementById('btn-edit-cancel').addEventListener('click', () => loadMasterDetail(params));
    document.getElementById('btn-edit-save').addEventListener('click', async () => {
        const body = {};
        for (const [name, , kind] of fields) {
            const v = document.getElementById('ef-' + name).value;
            body[name] = kind === 'num' ? (v === '' ? 0 : Number(v)) : v;
        }
        const btn = document.getElementById('btn-edit-save');
        try {
            btn.disabled = true;
            await App.api(`/master-biaya/${params.id}?type=${params.type}`, { method: 'PUT', body: JSON.stringify(body) });
            App.showToast('Data berhasil disimpan', 'success');
            await loadMasterDetail(params);
        } catch (err) {
            App.showToast(err.message, 'error');
            btn.disabled = false;
        }
    });
}
