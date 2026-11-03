// TableKit: bilah filter + pagination yang dipakai semua tabel.
//   Mode client : TableKit.mount({ rows, ... }) -> filter & halaman dihitung di browser
//   Mode server : TableKit.mount({ server: async (state) => ({ rows, total }), ... })
// Halaman menyediakan: elemen #filterEl, #pagerEl, <tbody id=tbodyId>, dan renderRow(row) -> '<tr>…</tr>'.
(function () {
    const esc = (v) => (window.App && App.esc) ? App.esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = (v) => String(v == null ? '' : v).toLowerCase();
    const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';

    // Daftar nomor halaman dengan "…" (mis. 1 … 4 5 6 … 20)
    function pageList(page, pages) {
        if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
        const out = [1];
        const from = Math.max(2, page - 1), to = Math.min(pages - 1, page + 1);
        if (from > 2) out.push('…');
        for (let i = from; i <= to; i++) out.push(i);
        if (to < pages - 1) out.push('…');
        out.push(pages);
        return out;
    }

    function pagerHtml(st, total, sizes) {
        const pages = Math.max(1, Math.ceil(total / st.size));
        const from = total === 0 ? 0 : (st.page - 1) * st.size + 1;
        const to = Math.min(total, st.page * st.size);
        const btn = (label, page, { disabled = false, active = false, title = '' } = {}) => `
            <button type="button" data-tk-page="${page}" ${disabled ? 'disabled' : ''} title="${esc(title)}"
                class="min-w-[2rem] h-8 px-2 rounded-md text-sm border transition ${active ? 'bg-blue-600 border-blue-600 text-white font-semibold' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'} ${disabled ? 'opacity-40 cursor-not-allowed hover:bg-white' : ''}">${label}</button>`;
        const nums = pageList(st.page, pages).map(p => p === '…'
            ? '<span class="px-1 text-gray-400 select-none">…</span>'
            : btn(p, p, { active: p === st.page })).join('');
        return `
        <div class="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                <span>Menampilkan <b class="text-gray-800">${from}–${to}</b> dari <b class="text-gray-800">${total}</b> data</span>
                <label class="flex items-center gap-2">Per halaman
                    <select data-tk-size class="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                        ${sizes.map(n => `<option value="${n}" ${n === st.size ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                </label>
            </div>
            <div class="flex items-center gap-1 flex-wrap">
                ${btn('«', 1, { disabled: st.page <= 1, title: 'Halaman pertama' })}
                ${btn('‹', st.page - 1, { disabled: st.page <= 1, title: 'Sebelumnya' })}
                ${nums}
                ${btn('›', st.page + 1, { disabled: st.page >= pages, title: 'Berikutnya' })}
                ${btn('»', pages, { disabled: st.page >= pages, title: 'Halaman terakhir' })}
            </div>
        </div>`;
    }

    function filterHtml(filters) {
        const items = filters.map(f => {
            if (f.type === 'search') return `
                <div class="relative flex-1 min-w-[14rem]">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><i data-lucide="search" class="w-4 h-4"></i></div>
                    <input type="text" data-tk-f="${f.id}" placeholder="${esc(f.placeholder || 'Cari...')}" class="${inputCls} w-full pl-9">
                </div>`;
            if (f.type === 'date') return `
                <label class="flex flex-col text-xs text-gray-500 gap-1">${esc(f.label)}
                    <input type="date" data-tk-f="${f.id}" class="${inputCls}">
                </label>`;
            return `
                <label class="flex flex-col text-xs text-gray-500 gap-1 min-w-[9rem]">${esc(f.label)}
                    <select data-tk-f="${f.id}" class="${inputCls}"><option value="">Semua</option></select>
                </label>`;
        }).join('');
        return `
        <div class="px-4 py-3 border-b border-gray-100 flex flex-wrap items-end gap-3">
            ${items}
            <button type="button" data-tk-reset class="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"><i data-lucide="rotate-ccw" class="w-4 h-4"></i> Reset</button>
        </div>`;
    }

    function mount(opts) {
        const sizes = opts.sizes || [10, 25, 50, 100];
        const st = { page: 1, size: opts.pageSize || sizes[0], values: {} };
        const filters = opts.filters || [];
        const filterEl = document.getElementById(opts.filterEl);
        const pagerEl = document.getElementById(opts.pagerEl);
        const tbody = document.getElementById(opts.tbodyId);
        let rows = opts.rows || [];
        let seq = 0;

        if (filterEl) {
            filterEl.innerHTML = filters.length ? filterHtml(filters) : '';
            if (window.lucide) lucide.createIcons({ root: filterEl });
        }

        const spinnerRow = () => `<tr><td colspan="${opts.colspan}" class="p-10 text-center"><div class="spinner mx-auto"></div><p class="text-xs text-gray-400 mt-3">Memuat data...</p></td></tr>`;
        const emptyRow = () => `<tr><td colspan="${opts.colspan}" class="p-10 text-center text-gray-500">
            <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
            <div>${opts.emptyText || 'Tidak ada data'}</div>
            ${Object.values(st.values).some(Boolean) ? '<div class="text-xs text-gray-400 mt-1">Coba ubah atau reset filter.</div>' : ''}</td></tr>`;

        function readValues() {
            st.values = {};
            if (!filterEl) return;
            filterEl.querySelectorAll('[data-tk-f]').forEach(el => { st.values[el.dataset.tkF] = el.value.trim(); });
        }

        function paint(list, total) {
            const pages = Math.max(1, Math.ceil(total / st.size));
            if (st.page > pages) { st.page = pages; return refresh(); }
            tbody.innerHTML = list.length ? list.map(opts.renderRow).join('') : emptyRow();
            if (pagerEl) pagerEl.innerHTML = total > 0 ? pagerHtml(st, total, sizes) : '';
            if (window.lucide) lucide.createIcons({ root: tbody.closest('.tk-card') || document });
            if (opts.afterRender) opts.afterRender(list, total);
        }

        function localFilter() {
            return rows.filter(r => filters.every(f => {
                const v = st.values[f.id];
                if (!v) return true;
                return f.match ? f.match(r, v) : true;
            }));
        }

        async function refresh() {
            const my = ++seq;
            if (opts.server) {
                tbody.innerHTML = spinnerRow();
                try {
                    const res = await opts.server({ page: st.page, size: st.size, values: { ...st.values } });
                    if (my !== seq) return;
                    paint(res.rows, res.total);
                } catch (e) {
                    if (my !== seq) return;
                    tbody.innerHTML = `<tr><td colspan="${opts.colspan}" class="p-10 text-center text-red-500">Gagal memuat data</td></tr>`;
                    if (pagerEl) pagerEl.innerHTML = '';
                }
                return;
            }
            const f = localFilter();
            paint(f.slice((st.page - 1) * st.size, st.page * st.size), f.length);
        }

        // Event: filter
        let timer;
        if (filterEl) {
            const onChange = (el, delay) => {
                clearTimeout(timer);
                timer = setTimeout(() => { readValues(); st.page = 1; refresh(); }, delay);
            };
            filterEl.addEventListener('input', (e) => {
                if (e.target.matches('input[type=text]')) onChange(e.target, opts.server ? 450 : 200);
            });
            filterEl.addEventListener('change', (e) => {
                if (e.target.matches('select, input[type=date]')) onChange(e.target, 0);
            });
            filterEl.addEventListener('click', (e) => {
                if (!e.target.closest('[data-tk-reset]')) return;
                filterEl.querySelectorAll('[data-tk-f]').forEach(el => { el.value = ''; });
                readValues(); st.page = 1; refresh();
            });
        }
        // Event: pagination
        if (pagerEl) {
            pagerEl.addEventListener('click', (e) => {
                const b = e.target.closest('[data-tk-page]');
                if (!b || b.disabled) return;
                st.page = Number(b.dataset.tkPage);
                refresh();
                const card = pagerEl.closest('.tk-card'); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            pagerEl.addEventListener('change', (e) => {
                if (!e.target.matches('[data-tk-size]')) return;
                st.size = Number(e.target.value); st.page = 1; refresh();
            });
        }

        const ctrl = {
            // Mode client: ganti seluruh data (filter & halaman dipertahankan)
            setRows(list) { rows = list || []; this.fillSelects(); refresh(); },
            // Isi pilihan dropdown: options = [{value,label}] atau [string]
            setOptions(id, options) {
                const el = filterEl && filterEl.querySelector(`select[data-tk-f="${id}"]`);
                if (!el) return;
                const cur = el.value;
                el.innerHTML = '<option value="">Semua</option>' + options.map(o => {
                    const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o;
                    return `<option value="${esc(v)}">${esc(l)}</option>`;
                }).join('');
                if (cur && options.some(o => (typeof o === 'object' ? o.value : o) === cur)) el.value = cur;
            },
            // Dropdown tanpa options eksplisit diisi otomatis dari nilai unik data (f.value(row))
            fillSelects() {
                filters.filter(f => f.type === 'select' && f.value && !f.options).forEach(f => {
                    const set = [...new Set(rows.map(f.value).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id'));
                    this.setOptions(f.id, f.labelOf ? set.map(v => ({ value: v, label: f.labelOf(v) })) : set);
                });
            },
            loading() { tbody.innerHTML = spinnerRow(); if (pagerEl) pagerEl.innerHTML = ''; },
            reload() { return refresh(); },
            reset() { if (filterEl) filterEl.querySelectorAll('[data-tk-f]').forEach(el => { el.value = ''; }); readValues(); st.page = 1; return refresh(); },
            state: st
        };
        filters.filter(f => f.options).forEach(f => ctrl.setOptions(f.id, f.options));
        return ctrl;
    }

    window.TableKit = { mount, norm };
})();
