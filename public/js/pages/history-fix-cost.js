// ---- Helper bersama (dipakai juga oleh halaman detail) ----
// Alur approval mengikuti backend: supervisor -> atasan (penyetuju akhir).
// Superadmin boleh bertindak di tahap mana pun. (Kunci internal tahap final tetap 'admin' agar data lama valid.)
const FC_STATUS = {
    pending:             ['Menunggu Supervisor', 'bg-yellow-100 text-yellow-800'],
    approved_supervisor: ['Menunggu Atasan',     'bg-blue-100 text-blue-800'],
    approved_atasan:     ['Approved',            'bg-green-100 text-green-800'],
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
    const stageRole = { pending: 'supervisor', approved_supervisor: 'atasan' }[status];
    return !!stageRole && (role === stageRole || role === 'superadmin');
}

// Ringkasan detail pengiriman: type truck, type container, tonase (kosong untuk pengajuan lama)
function fcShipInfo(d) {
    const svc = d.service_type ? serviceLabel(d.service_type) : '';
    const trucks = Number(d.truck_count) > 1 ? Number(d.truck_count) + ' truk' : '';
    return App.esc([svc, d.truck_type, d.container_type, d.tonnage ? fcTon(d.tonnage) : '', trucks].filter(Boolean).join(' \u2022 '));
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
    <div class="tk-card bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div id="hist-filters"></div>
        <div class="overflow-x-auto tk-scroll">
            <table class="tk-table w-full text-left text-sm whitespace-nowrap">
                <thead class="bg-gray-50 text-gray-600 border-b">
                    <tr>
                        <th class="px-4 py-3 font-medium">No Pengajuan</th>
                        <th class="px-4 py-3 font-medium">Tanggal</th>
                        <th class="px-4 py-3 font-medium">Rute</th>
                        <th class="px-4 py-3 font-medium">Tipe</th>
                        <th class="px-4 py-3 font-medium text-right">Original Cost</th>
                        <th class="px-4 py-3 font-medium text-right">Fix Cost</th>
                        <th class="px-4 py-3 font-medium">Status</th>
                        <th class="px-4 py-3 font-medium text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody id="history-tbody" class="divide-y divide-gray-100">
                    <tr><td colspan="8" class="p-8 text-center"><div class="spinner mx-auto"></div></td></tr>
                </tbody>
            </table>
        </div>
        <div id="hist-pager"></div>
    </div>
    `;
}

function fcRenderRow(item) {
    const statusBadge = fcBadge(item.status);
    const dateStr = fcDate(item.created_at);
    const role = App.user?.role;
    let actionBtns = `<button onclick="App.loadPage('history-detail-fix-cost', {id: '${Number(item.id)}'})" class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded border border-blue-200 text-xs font-medium transition">Detail</button>`;

    if (fcCanAct(role, item.status) && !Number(item.acted_by_me)) {
        actionBtns += `
            <button onclick="approveFixCost('${Number(item.id)}')" class="ml-1 text-green-600 hover:bg-green-50 px-2 py-1 rounded border border-green-200 text-xs font-medium transition" title="Approve"><i data-lucide="check" class="w-4 h-4 inline"></i></button>
            <button onclick="rejectFixCost('${Number(item.id)}')" class="ml-1 text-red-600 hover:bg-red-50 px-2 py-1 rounded border border-red-200 text-xs font-medium transition" title="Reject"><i data-lucide="x" class="w-4 h-4 inline"></i></button>`;
    }

    return `
    <tr class="hover:bg-gray-50">
        <td class="px-4 py-3 font-medium text-gray-900">${App.esc(item.request_number)}</td>
        <td class="px-4 py-3 text-gray-500">${dateStr}</td>
        <td class="px-4 py-3">${App.esc(item.origin_kota || '-')} <i data-lucide="arrow-right" class="inline w-3 h-3 text-gray-400"></i> ${App.esc(item.destination_kota || '-')}</td>
        <td class="px-4 py-3 capitalize">${App.esc(item.transport_type)}${fcShipInfo(item) ? `<div class="text-xs text-gray-400 normal-case">${fcShipInfo(item)}</div>` : ''}</td>
        <td class="px-4 py-3 text-right">${App.formatRp(item.original_cost)}</td>
        <td class="px-4 py-3 font-medium text-right">${App.formatRp(item.fix_cost)}</td>
        <td class="px-4 py-3">${fcBadge(item.status)}</td>
        <td class="px-4 py-3 text-center whitespace-nowrap">${actionBtns}</td>
    </tr>`;
}

async function renderHistoryFixCostInit() {
    const kit = TableKit.mount({
        filterEl: 'hist-filters', pagerEl: 'hist-pager', tbodyId: 'history-tbody', colspan: 8, pageSize: 10,
        emptyText: 'Belum ada pengajuan',
        filters: [
            { id: 'q', type: 'search', placeholder: 'Cari no pengajuan, rute, truck, pemohon...',
              match: (r, v) => TableKit.norm([r.request_number, r.origin_kota, r.origin_kecamatan, r.destination_kota, r.destination_kecamatan, r.truck_type, r.container_type, r.requester_name].join(' ')).includes(TableKit.norm(v)) },
            { id: 'status', type: 'select', label: 'Status', options: Object.entries(FC_STATUS).map(([value, [label]]) => ({ value, label })), match: (r, v) => r.status === v },
            { id: 'tipe', type: 'select', label: 'Tipe', options: [{ value: 'land', label: 'Darat' }, { value: 'sea', label: 'Laut' }], match: (r, v) => r.transport_type === v },
            { id: 'from', type: 'date', label: 'Dari tanggal', match: (r, v) => String(r.created_at || '').slice(0, 10) >= v },
            { id: 'to', type: 'date', label: 'Sampai tanggal', match: (r, v) => String(r.created_at || '').slice(0, 10) <= v }
        ],
        renderRow: fcRenderRow
    });
    kit.loading();
    try {
        const data = await App.api('/fix-cost/list');
        data.sort((a, b) => Number(b.id) - Number(a.id)); // terbaru di atas
        kit.setRows(data);
    } catch (e) {
        document.getElementById('history-tbody').innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-500">Failed to load data</td></tr>`;
    }
}

// Ganti tombol aksi pada baris dengan indikator "Memproses..." supaya tidak diklik dua kali
function fcBusyCell(ev) {
    const cell = ev && ev.currentTarget ? ev.currentTarget.closest('td') : null;
    if (cell) cell.innerHTML = '<span class="inline-flex items-center gap-2 text-xs text-gray-500"><span class="spinner w-4 h-4 border-2"></span> Memproses...</span>';
}

window.approveFixCost = async function(id) {
    if (!confirm('Approve pengajuan ini?')) return;
    fcBusyCell(window.event);
    try {
        await App.api(`/fix-cost/approve/${id}`, {
            method: 'POST',
            body: JSON.stringify({ notes: 'Approved via quick action' })
        });
        App.showToast('Berhasil di-approve', 'success');
    } catch(e) {
        App.showToast(e.message, 'error');
    }
    App.loadPage('history-fix-cost'); // muat ulang (dengan spinner) agar status & tombol sesuai data terbaru
}

window.rejectFixCost = async function(id) {
    const notes = prompt('Alasan penolakan:');
    if (notes === null) return;
    fcBusyCell(window.event);
    try {
        await App.api(`/fix-cost/reject/${id}`, {
            method: 'POST',
            body: JSON.stringify({ notes: notes })
        });
        App.showToast('Berhasil ditolak', 'success');
    } catch(e) {
        App.showToast(e.message, 'error');
    }
    App.loadPage('history-fix-cost');
}
