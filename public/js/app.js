const App = {
    user: null,
    currentPage: 'dashboard',
    
    // API helper
    async api(url, options = {}) {
        try {
            const res = await fetch('api' + url, {
                headers: { 'Content-Type': 'application/json', ...options.headers },
                credentials: 'include',
                ...options
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Request failed');
            return data;
        } catch (e) {
            console.error('API Error:', e);
            throw e;
        }
    },
    
    async apiUpload(url, formData) {
        try {
            const res = await fetch('api' + url, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            return data;
        } catch (e) {
            console.error('Upload Error:', e);
            throw e;
        }
    },
    
    // Escape teks dari database/input sebelum disisipkan ke innerHTML (cegah XSS tersimpan)
    esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    
    formatRp(num) {
        return 'Rp ' + (Number(num) || 0).toLocaleString('id-ID');
    },
    
    async init() {
        lucide.createIcons();
        
        // Setup global listeners
        document.getElementById('login-form').addEventListener('submit', this.handleLogin.bind(this));
        document.getElementById('logout-btn').addEventListener('click', this.logout.bind(this));
        
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        
        const toggleMenu = () => {
            sidebar.classList.toggle('-translate-x-full');
            sidebarOverlay.classList.toggle('hidden');
        };
        
        mobileMenuBtn.addEventListener('click', toggleMenu);
        sidebarOverlay.addEventListener('click', toggleMenu);

        // Check session
        try {
            const res = await fetch('api/auth/check');
            if (res.ok) {
                const data = await res.json();
                this.user = data;
                this.showDashboard();
            } else {
                this.showLogin();
            }
        } catch (e) {
            this.showLogin();
        }
    },
    
    showLogin() {
        document.getElementById('dashboard-shell').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    },
    
    showDashboard() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-shell').classList.remove('hidden');
        
        document.getElementById('user-name').textContent = this.user.name || this.user.username;
        document.getElementById('user-role').textContent = this.user.role.charAt(0).toUpperCase() + this.user.role.slice(1);
        document.getElementById('user-avatar').textContent = (this.user.name || this.user.username).substring(0, 2).toUpperCase();
        
        this.renderMenu();
        this.loadPage('dashboard');
    },

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const btn = document.getElementById('login-btn');
        const errorEl = document.getElementById('login-error');
        
        try {
            btn.innerHTML = '<div class="spinner w-5 h-5 border-2"></div><span class="ml-2">Signing in...</span>';
            btn.disabled = true;
            errorEl.classList.add('hidden');
            
            const data = await this.api('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            
            this.user = data;
            this.showToast('Login berhasil', 'success');
            this.showDashboard();
        } catch (e) {
            errorEl.textContent = e.message;
            errorEl.classList.remove('hidden');
        } finally {
            btn.innerHTML = 'Sign In';
            btn.disabled = false;
        }
    },
    
    renderMenu() {
        const menuEl = document.getElementById('sidebar-menu');
        menuEl.innerHTML = '';
        
        const role = this.user.role;
        const menuItems = [];
        
        // Menu sesuai workflow diagram
        if (role === 'superadmin') {
            // Superadmin: semua menu (setting + fix cost + approval)
            menuItems.push({ id: 'konfigurasi-user', icon: 'users', label: 'Konfigurasi User' });
            menuItems.push({ id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' });
            menuItems.push({ id: 'master-biaya', icon: 'database', label: 'Master Biaya' });
            menuItems.push({ id: 'master-jasa', icon: 'receipt', label: 'Master Jasa' });
            menuItems.push({ id: 'master-kendaraan', icon: 'truck', label: 'Master Kendaraan' });
            menuItems.push({ id: 'hitung-fix-cost', icon: 'calculator', label: 'Hitung Fix Cost' });
            menuItems.push({ id: 'history-fix-cost', icon: 'history', label: 'History Fix Cost' });
        } else if (role === 'admin') {
            // Admin: setting + membuat pengajuan + melihat history/detail (tanpa hak approval)
            menuItems.push({ id: 'konfigurasi-user', icon: 'users', label: 'Konfigurasi User' });
            menuItems.push({ id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' });
            menuItems.push({ id: 'master-biaya', icon: 'database', label: 'Master Biaya' });
            menuItems.push({ id: 'master-jasa', icon: 'receipt', label: 'Master Jasa' });
            menuItems.push({ id: 'master-kendaraan', icon: 'truck', label: 'Master Kendaraan' });
            menuItems.push({ id: 'hitung-fix-cost', icon: 'calculator', label: 'Hitung Fix Cost' });
            menuItems.push({ id: 'history-fix-cost', icon: 'history', label: 'History Fix Cost' });
        } else if (role === 'user') {
            menuItems.push({ id: 'konfigurasi-user', icon: 'users', label: 'Konfigurasi User' });
            menuItems.push({ id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' });
            menuItems.push({ id: 'master-biaya', icon: 'database', label: 'Master Biaya' });
            menuItems.push({ id: 'master-jasa', icon: 'receipt', label: 'Master Jasa' });
            menuItems.push({ id: 'master-kendaraan', icon: 'truck', label: 'Master Kendaraan' });
            menuItems.push({ id: 'hitung-fix-cost', icon: 'calculator', label: 'Hitung Fix Cost' });
            menuItems.push({ id: 'history-fix-cost', icon: 'history', label: 'History Fix Cost' });
        } else if (role === 'supervisor') {
            menuItems.push({ id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' });
            menuItems.push({ id: 'master-biaya', icon: 'database', label: 'Master Biaya' });
            menuItems.push({ id: 'master-jasa', icon: 'receipt', label: 'Master Jasa' });
            menuItems.push({ id: 'master-kendaraan', icon: 'truck', label: 'Master Kendaraan' });
            menuItems.push({ id: 'hitung-fix-cost', icon: 'calculator', label: 'Hitung Fix Cost' });
            menuItems.push({ id: 'history-fix-cost', icon: 'history', label: 'History Fix Cost' });
        } else if (role === 'atasan') {
            menuItems.push({ id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' });
            menuItems.push({ id: 'master-biaya', icon: 'database', label: 'Master Biaya' });
            menuItems.push({ id: 'master-jasa', icon: 'receipt', label: 'Master Jasa' });
            menuItems.push({ id: 'master-kendaraan', icon: 'truck', label: 'Master Kendaraan' });
            menuItems.push({ id: 'hitung-fix-cost', icon: 'calculator', label: 'Hitung Fix Cost' });
            menuItems.push({ id: 'history-fix-cost', icon: 'history', label: 'History Fix Cost' });
        }
        
        menuItems.forEach(item => {
            const a = document.createElement('a');
            a.href = '#';
            a.className = `nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 transition-colors mb-1`;
            a.innerHTML = `<i data-lucide="${item.icon}" class="w-5 h-5"></i> <span>${item.label}</span>`;
            a.dataset.page = item.id;
            
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.loadPage(item.id);
                
                // close mobile menu
                document.getElementById('sidebar').classList.add('-translate-x-full');
                document.getElementById('sidebar-overlay').classList.add('hidden');
            });
            
            menuEl.appendChild(a);
        });
        
        lucide.createIcons();
    },
    
    async loadPage(pageId, params = {}) {
        this.currentPage = pageId;
        const mainEl = document.getElementById('main-content');
        const titleEl = document.getElementById('page-title');
        
        // Update menu active state
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.page === pageId || (pageId === 'master-detail-biaya' && el.dataset.page === 'master-biaya') || (pageId.startsWith('history-') && el.dataset.page === 'history-fix-cost'));
        });
        
        mainEl.innerHTML = '<div class="h-full flex items-center justify-center"><div class="spinner"></div></div>';
        
        try {
            let html = '';
            let initFn = null;
            let title = 'Dashboard';
            
            switch (pageId) {
                case 'dashboard':
                    title = 'Dashboard';
                    html = renderDashboard();
                    initFn = renderDashboardInit;
                    break;
                case 'master-biaya':
                    title = 'Master Biaya';
                    html = renderMasterBiaya();
                    initFn = renderMasterBiayaInit;
                    break;
                case 'master-jasa':
                    title = 'Master Jasa';
                    html = renderMasterJasa();
                    initFn = renderMasterJasaInit;
                    break;
                case 'master-kendaraan':
                    title = 'Master Kendaraan';
                    html = renderMasterKendaraan();
                    initFn = renderMasterKendaraanInit;
                    break;
                case 'master-detail-biaya':
                    if (this.user && this.user.role === 'user') { App.showToast('Anda tidak memiliki akses ke halaman ini', 'warning'); return; }
                    title = 'Detail Master Biaya';
                    html = renderMasterDetailBiaya(params);
                    initFn = renderMasterDetailBiayaInit;
                    break;
                case 'hitung-fix-cost':
                    title = 'Hitung Fix Cost';
                    html = renderHitungFixCost();
                    initFn = renderHitungFixCostInit;
                    break;
                case 'history-fix-cost':
                    title = 'History Fix Cost';
                    html = renderHistoryFixCost();
                    initFn = renderHistoryFixCostInit;
                    break;
                case 'history-detail-fix-cost':
                    title = 'Detail Pengajuan Fix Cost';
                    html = renderHistoryDetailFixCost(params);
                    initFn = renderHistoryDetailFixCostInit;
                    break;
                case 'konfigurasi-user':
                    title = 'Konfigurasi User';
                    html = renderKonfigurasiUser();
                    initFn = renderKonfigurasiUserInit;
                    break;
                default:
                    title = 'Not Found';
                    html = '<div class="text-center py-10">Page not found</div>';
            }
            
            titleEl.textContent = title;
            mainEl.innerHTML = html;
            lucide.createIcons();
            
            if (initFn) {
                await initFn(params);
            }
            
        } catch (e) {
            console.error('Error loading page', e);
            mainEl.innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3"><i data-lucide="alert-circle"></i> Failed to load page: ${e.message}</div>`;
            lucide.createIcons();
        }
    },
    
    showToast(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        
        let colorClass = 'bg-gray-800 text-white';
        let icon = 'info';
        
        if (type === 'success') { colorClass = 'bg-green-600 text-white'; icon = 'check-circle'; }
        if (type === 'error') { colorClass = 'bg-red-600 text-white'; icon = 'alert-circle'; }
        if (type === 'warning') { colorClass = 'bg-yellow-500 text-white'; icon = 'alert-triangle'; }
        
        toast.className = `toast ${colorClass} px-4 py-3 rounded-lg shadow-lg flex items-center gap-3`;
        toast.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5"></i> <span>${msg}</span>`;
        
        container.appendChild(toast);
        lucide.createIcons({ root: toast });
        
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },
    
    async logout() {
        try {
            await this.api('/auth/logout', { method: 'POST' });
        } catch (e) {} // ignore
        
        this.user = null;
        this.showLogin();
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
