// ---- Helper bersama (dipakai juga oleh halaman detail) ----
// Alur approval mengikuti backend: supervisor -> atasan -> superadmin (penyetuju akhir).
// Superadmin boleh bertindak di tahap mana pun. (Kunci internal tahap final tetap 'admin' agar data lama valid.)
const FC_STATUS = {
    pending:             ['Menunggu Supervisor', 'bg-yellow-100 text-yellow-800'],
    approved_supervisor: ['Menunggu Atasan',     'bg-blue-100 text-blue-800'],
    approved_atasan:     ['Menunggu Superadmin', 'bg-indigo-100 text-indigo-800'],
    approved_admin:      ['Approved',            'bg-green-100 text-green-800'],
    rejected_supervisor: ['Ditolak Supervisor',  'bg-red-100 text-red-800'],
    rejected_atasan:     ['Ditolak Atasan',      'bg-red-100 text-red-800'],
    rejected_admin:      ['Ditolak Final',       'bg-red-100 text-red-800']
};

function fcBadge(status, sizeClass) {
    const [label, color] = FC_STATUS[status] || [status, 'bg-gray-100 text-gray-800'];
    return `<span class="${sizeClass || 'px-2.5 py-1 text-xs'} rounded-full font-medium ${color}">${App.esc(label)}</span>`;
}

// Role yang gilirannya menyetujui/menolak pada status tertentu
function fcCanAct(role, status) {
    const stageRole = { pending: 'supervisor', approved_supervisor: 'atasan', approved_atasan: 'superadmin' }[status];
    return !!stageRole && (role === stageRole || role === 'superadmin');
}

// Ringkasan detail pengiriman: type truck, type container, tonase (kosong untuk pengajuan lama)
function fcShipInfo(d) {
    return App.esc([d.truck_type, d.container_type, d.tonnage ? fcTon(d.tonnage) : ''].filter(Boolean).join(' \u2022 '));
}

function fcTon(v) {
    return Number(v).toLocaleString('id-ID', { maximumFractionDigits: 3 }) + ' ton';
}

function fcPlace(d, side) {
    return App.esc([d[side + '_provinsi'], d[side + '_kota'], d[side + '_kecamatan']].filter(Boolean).join(' - ') || '-');
}

// SQLite menyimpan waktu dalam UTC tanpa penanda zona; tampilkan sebagai waktu setempat
function fcDate(s, withTime) {
    if (!s) return '-';
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    return withTime ? d.toLocaleString('id-ID') : d.toLocaleDateString('id-ID');
}

function renderHistoryFixCost() {
    return `
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm whitespace-nowrap">
                <thead class="bg-gray-50 text-gray-600 border-b">
                    <tr>
                        <th class="px-4 py-3 font-medium">No Pengajuan</th>
                        <th class="px-4 py-3 font-medium">Tanggal</th>
                        <th class="px-4 py-3 font-medium">Rute</th>
                        <th class="px-4 py-3 font-medium">Tipe</th>
                        <th class="px-4 py-3 font-medium">Original Cost</th>
                        <th class="px-4 py-3 font-medium">Fix Cost</th>
                        <th class="px-4 py-3 font-medium">Status</th>
                        <th class="px-4 py-3 font-medium text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody id="history-tbody" class="divide-y divide-gray-100">
                    <tr><td colspan="8" class="p-8 text-center"><div class="spinner mx-auto"></div></td></tr>
                </tbody>
            </table>
        </div>
    </div>
    `;
}

async function renderHistoryFixCostInit() {
    try {
        const data = await App.api('/fix-cost/list');
        const tbody = document.getElementById('history-tbody');
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-gray-500"><i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i> No data found</td></tr>`;
            lucide.createIcons();
            return;
        }
        
        tbody.innerHTML = data.map(item => {
            const statusBadge = fcBadge(item.status);
            
            const dateStr = fcDate(item.created_at);
            
            const role = App.user?.role;
            let actionBtns = `<button onclick="App.loadPage('history-detail-fix-cost', {id: '${Number(item.id)}'})" class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded border border-blue-200 text-xs font-medium transition">Detail</button>`;
            
            if (fcCanAct(role, item.status)) {
                actionBtns += `
                    <button onclick="approveFixCost('${Number(item.id)}')" class="ml-1 text-green-600 hover:bg-green-50 px-2 py-1 rounded border border-green-200 text-xs font-medium transition" title="Approve"><i data-lucide="check" class="w-4 h-4"></i></button>
                    <button onclick="rejectFixCost('${Number(item.id)}')" class="ml-1 text-red-600 hover:bg-red-50 px-2 py-1 rounded border border-red-200 text-xs font-medium transition" title="Reject"><i data-lucide="x" class="w-4 h-4"></i></button>
                `;
            }

            return `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-900">${App.esc(item.request_number)}</td>
                <td class="px-4 py-3 text-gray-500">${dateStr}</td>
                <td class="px-4 py-3">${App.esc(item.origin_kota || '-')} <i data-lucide="arrow-right" class="inline w-3 h-3 text-gray-400"></i> ${App.esc(item.destination_kota || '-')}</td>
                <td class="px-4 py-3 capitalize">${App.esc(item.transport_type)}${fcShipInfo(item) ? `<div class="text-xs text-gray-400 normal-case">${fcShipInfo(item)}</div>` : ''}</td>
                <td class="px-4 py-3">${App.formatRp(item.original_cost)}</td>
                <td class="px-4 py-3 font-medium">${App.formatRp(item.fix_cost)}</td>
                <td class="px-4 py-3">${statusBadge}</td>
                <td class="px-4 py-3 text-center flex justify-center items-center">
                    ${actionBtns}
                </td>
            </tr>
            `;
        }).join('');
        lucide.createIcons();
        
    } catch (e) {
        document.getElementById('history-tbody').innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-500">Failed to load data</td></tr>`;
    }
}

window.approveFixCost = async function(id) {
    if (!confirm('Approve pengajuan ini?')) return;
    try {
        await App.api(`/fix-cost/approve/${id}`, {
            method: 'POST',
            body: JSON.stringify({ notes: 'Approved via quick action' })
        });
        App.showToast('Berhasil di-approve', 'success');
        App.loadPage('history-fix-cost');
    } catch(e) {
        App.showToast(e.message, 'error');
    }
}

window.rejectFixCost = async function(id) {
    const notes = prompt('Alasan penolakan:');
    if (notes === null) return;
    try {
        await App.api(`/fix-cost/reject/${id}`, {
            method: 'POST',
            body: JSON.stringify({ notes: notes })
        });
        App.showToast('Berhasil ditolak', 'success');
        App.loadPage('history-fix-cost');
    } catch(e) {
        App.showToast(e.message, 'error');
    }
}
