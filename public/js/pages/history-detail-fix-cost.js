function renderHistoryDetailFixCost(params) {
    return `
    <div class="space-y-6 max-w-5xl mx-auto">
        <div>
            <button id="btn-back" class="flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors">
                <i data-lucide="arrow-left" class="w-4 h-4"></i>
                <span>Back to History</span>
            </button>
        </div>
        
        <div id="detail-content" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="col-span-1 lg:col-span-3 flex justify-center p-12">
                <div class="spinner"></div>
            </div>
        </div>
    </div>
    `;
}

// Jawaban pertanyaan biaya tambahan (multipickup, multidrop, kawalan, TKBM) + rincian nominal
function fcExtraBlock(d) {
    const payer = (v) => v === 'customer' ? 'Customer' : v === 'perusahaan' ? 'Perusahaan' : null;
    const rows = [
        ['Multi Pickup', Number(d.multipickup_points) > 0 ? `Ya (${Number(d.multipickup_points)} titik tambahan)` : 'Tidak'],
        ['Multi Drop', Number(d.multidrop_points) > 0 ? `Ya (${Number(d.multidrop_points)} titik tambahan)` : 'Tidak'],
        ['Perlu Kawalan', Number(d.kawalan) ? 'Ya' : 'Tidak']
    ];
    if (payer(d.tkbm_dtp)) rows.push(['TKBM Door to Port ditanggung', payer(d.tkbm_dtp)]);
    if (payer(d.tkbm_ptd)) rows.push(['TKBM Port to Door ditanggung', payer(d.tkbm_ptd)]);
    let lines = [];
    try { lines = JSON.parse(d.additional_detail || '[]'); } catch (e) { lines = []; }
    return `
    <div class="bg-gray-50 rounded-lg p-4 border border-gray-100 mb-6">
        <h4 class="font-semibold text-gray-800 mb-3">Biaya Tambahan</h4>
        <div class="space-y-1 text-sm">
            ${rows.map(([l, v]) => `<div class="flex justify-between"><span class="text-gray-600">${App.esc(l)}</span><span class="font-medium">${App.esc(v)}</span></div>`).join('')}
            ${lines.map(l => `<div class="flex justify-between text-xs text-gray-500"><span>${App.esc(l.name)}${l.qty > 1 ? ' x' + Number(l.qty) : ''}</span><span>${App.formatRp(l.subtotal)}</span></div>`).join('')}
        </div>
    </div>`;
}

// Satu langkah di Approval Trail. a = baris approval (atau undefined), waiting = sedang menunggu tingkat ini
function fcTrailStep(label, a, waiting) {
    const approved = a && a.action === 'approve';
    const circle = a ? (approved ? 'bg-green-500' : 'bg-red-500') : (waiting ? 'bg-yellow-500' : 'bg-slate-300');
    const icon = a ? (approved ? 'check' : 'x') : (waiting ? 'clock' : 'circle');
    const title = a ? 'text-slate-900' : (waiting ? 'text-yellow-700' : 'text-slate-400');
    return `
        <div class="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
            <div class="flex items-center justify-center w-6 h-6 rounded-full border border-white ${circle} text-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow absolute -left-3 z-10">
                <i data-lucide="${icon}" class="w-3 h-3"></i>
            </div>
            <div class="w-full">
                <div class="flex flex-col">
                    <span class="text-sm font-bold ${title}">${label}</span>
                    ${a ? `
                        <span class="text-xs text-slate-500">${App.esc(a.approver_name || '')} - ${App.esc(fcDate(a.created_at, true))}${approved ? '' : ' (ditolak)'}</span>
                        ${a.notes ? `<span class="text-xs text-slate-600 mt-1 italic">"${App.esc(a.notes)}"</span>` : ''}
                    ` : (waiting ? '<span class="text-xs text-yellow-600">Waiting...</span>' : '')}
                </div>
            </div>
        </div>`;
}

async function renderHistoryDetailFixCostInit(params) {
    document.getElementById('btn-back').addEventListener('click', () => App.loadPage('history-fix-cost'));
    
    try {
        const data = await App.api(`/fix-cost/detail/${params.id}`);
        const content = document.getElementById('detail-content');
        
        const statusBadge = fcBadge(data.status, 'px-3 py-1 text-sm');
        const dateStr = fcDate(data.created_at, true);
        
        let actionPanel = '';
        const role = App.user?.role;
        
        if (fcCanAct(role, data.status)) {
            actionPanel = `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-6">
                <h3 class="text-lg font-semibold text-gray-800 mb-4">Take Action</h3>
                <textarea id="action-notes" rows="3" class="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-2 focus:ring-blue-500 outline-none mb-4" placeholder="Optional notes..."></textarea>
                <div class="flex gap-3">
                    <button id="btn-approve" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition">
                        <i data-lucide="check-circle" class="w-5 h-5"></i> Approve
                    </button>
                    <button id="btn-reject" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition">
                        <i data-lucide="x-circle" class="w-5 h-5"></i> Reject
                    </button>
                </div>
            </div>
            `;
        }

        const byLevel = {};
        (data.approvals || []).forEach(a => { byLevel[a.level] = a; });

        content.innerHTML = `
            <div class="lg:col-span-2 space-y-6">
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div class="flex justify-between items-start mb-6 pb-6 border-b border-gray-100">
                        <div>
                            <p class="text-sm text-gray-500 mb-1">No Pengajuan</p>
                            <h2 class="text-2xl font-bold text-gray-800">${App.esc(data.request_number)}</h2>
                            <p class="text-sm text-gray-500 mt-2">${App.esc(dateStr)}</p>
                        </div>
                        <div class="text-right">
                            ${statusBadge}
                            <p class="text-sm font-medium text-gray-500 mt-3 uppercase tracking-wide">TIPE: ${App.esc(data.transport_type)}</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-6 mb-6">
                        <div class="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2"><i data-lucide="map-pin" class="w-4 h-4 text-green-500"></i> Origin</p>
                            <p class="font-semibold text-gray-800">${fcPlace(data, 'origin')}</p>
                        </div>
                        <div class="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2"><i data-lucide="map-pin" class="w-4 h-4 text-red-500"></i> Destination</p>
                            <p class="font-semibold text-gray-800">${fcPlace(data, 'destination')}</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-${data.transport_type === 'sea' ? '3' : '2'} gap-6 mb-6">
                        <div class="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">${data.transport_type === 'sea' ? 'Truck Type' : 'Type Truck'}</p>
                            <p class="font-semibold text-gray-800">${App.esc(data.truck_type || '-')}</p>
                        </div>
                        ${data.transport_type === 'sea' ? `
                        <div class="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Type Container</p>
                            <p class="font-semibold text-gray-800">${App.esc(data.container_type || '-')}</p>
                        </div>` : ''}
                        <div class="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Tonase</p>
                            <p class="font-semibold text-gray-800">${data.tonnage ? App.esc(fcTon(data.tonnage)) : '-'}</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                        ${[
                            ['Layanan', serviceLabel(data.service_type || (data.transport_type === 'land' ? 'door_to_door' : null))],
                            ['Gudang Muat', data.gudang_muat || '-'],
                            ['Gudang Bongkar', data.gudang_bongkar || '-'],
                            ['Jumlah Truk', data.truck_count || 1]
                        ].map(([l, v]) => `
                        <div class="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">${l}</p>
                            <p class="font-semibold text-gray-800">${App.esc(v)}</p>
                        </div>`).join('')}
                    </div>

                    ${fcExtraBlock(data)}

                    <div class="bg-blue-50 rounded-lg p-5 border border-blue-100">
                        <h4 class="font-semibold text-gray-800 mb-4">Cost Detail</h4>
                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <span class="text-gray-600">Original Cost</span>
                                <span class="font-medium">${App.formatRp(data.original_cost)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Discount %</span>
                                <span class="font-medium text-red-600">${Number(data.discount_percentage) || 0}%</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Discount Amount</span>
                                <span class="font-medium text-red-600">${App.formatRp(data.discount_amount)}</span>
                            </div>
                            <div class="flex justify-between pt-3 border-t border-blue-200">
                                <span class="font-bold text-gray-800">Fix Cost</span>
                                <span class="font-bold text-xl text-blue-700">${App.formatRp(data.fix_cost)}</span>
                            </div>
                            ${data.total_cost !== null && data.total_cost !== undefined ? `
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-600">Biaya tambahan per truk</span>
                                <span class="font-medium">${App.formatRp(data.additional_cost)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-bold text-gray-800">Total (${Number(data.truck_count) || 1} truk)</span>
                                <span class="font-bold text-lg text-blue-700">${App.formatRp(data.total_cost)}</span>
                            </div>` : ''}
                        </div>
                    </div>
                    
                    ${data.notes ? `
                    <div class="mt-6">
                        <p class="text-sm font-medium text-gray-700 mb-2">Notes / Alasan</p>
                        <div class="bg-gray-50 p-4 rounded-lg text-sm text-gray-600 border border-gray-100">
                            ${App.esc(data.notes)}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="lg:col-span-1">
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sticky top-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-6 border-b pb-4">Approval Trail</h3>
                    
                    <div class="relative pl-6 space-y-6 before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                        <div class="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div class="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-green-500 text-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow absolute -left-3 z-10">
                                <i data-lucide="check" class="w-3 h-3"></i>
                            </div>
                            <div class="w-full">
                                <div class="flex flex-col">
                                    <span class="text-sm font-bold text-slate-900">Created by ${App.esc(data.requester_name || 'User')}</span>
                                    <span class="text-xs text-slate-500">${App.esc(dateStr)}</span>
                                </div>
                            </div>
                        </div>
                        ${fcTrailStep('Supervisor Approval', byLevel.supervisor, data.status === 'pending')}
                        ${fcTrailStep('Atasan Approval (Final)', byLevel.atasan, data.status === 'approved_supervisor')}
                        ${byLevel.admin ? fcTrailStep('Approval Final (data lama)', byLevel.admin, false) : ''}
                    </div>
                </div>
                
                ${actionPanel}
            </div>
        `;
        
        lucide.createIcons();
        
        if (actionPanel) {
            document.getElementById('btn-approve').addEventListener('click', async () => {
                const notes = document.getElementById('action-notes').value;
                try {
                    await App.api(`/fix-cost/approve/${params.id}`, {
                        method: 'POST',
                        body: JSON.stringify({ notes })
                    });
                    App.showToast('Approved', 'success');
                    App.loadPage('history-detail-fix-cost', params);
                } catch(e) {
                    App.showToast(e.message, 'error');
                }
            });
            
            document.getElementById('btn-reject').addEventListener('click', async () => {
                const notes = document.getElementById('action-notes').value;
                if (!notes) {
                    App.showToast('Notes is required for rejection', 'warning');
                    return;
                }
                try {
                    await App.api(`/fix-cost/reject/${params.id}`, {
                        method: 'POST',
                        body: JSON.stringify({ notes })
                    });
                    App.showToast('Rejected', 'success');
                    App.loadPage('history-detail-fix-cost', params);
                } catch(e) {
                    App.showToast(e.message, 'error');
                }
            });
        }
        
    } catch (e) {
        document.getElementById('detail-content').innerHTML = `
            <div class="col-span-3 bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3">
                <i data-lucide="alert-circle"></i> Failed to load details: ${App.esc(e.message)}
            </div>
        `;
        lucide.createIcons();
    }
}
