let usersList = [];
let editUserId = null;

function renderKonfigurasiUser() {
    return `
    <div class="space-y-4">
        <div class="flex justify-end">
            <button id="btn-add-user" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                <i data-lucide="plus" class="w-4 h-4"></i> Add User
            </button>
        </div>
        
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm whitespace-nowrap">
                    <thead class="bg-gray-50 text-gray-600 border-b">
                        <tr>
                            <th class="px-4 py-3 font-medium">Nama</th>
                            <th class="px-4 py-3 font-medium">Username</th>
                            <th class="px-4 py-3 font-medium">Email</th>
                            <th class="px-4 py-3 font-medium">Role</th>
                            <th class="px-4 py-3 font-medium text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody id="user-tbody" class="divide-y divide-gray-100">
                        <tr><td colspan="5" class="p-8 text-center"><div class="spinner mx-auto"></div></td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- User Modal -->
    <div id="user-modal" class="fixed inset-0 z-50 hidden flex items-center justify-center">
        <div class="modal-backdrop absolute inset-0"></div>
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md relative z-10">
            <div class="flex justify-between items-center mb-4 pb-3 border-b">
                <h3 id="modal-title" class="text-xl font-bold text-gray-800">Add User</h3>
                <button id="btn-close-modal" class="text-gray-400 hover:text-gray-600">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            
            <form id="user-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Nama</label>
                    <input type="text" id="u-name" required class="w-full border-gray-300 rounded-lg px-3 py-2 border focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input type="text" id="u-username" required class="w-full border-gray-300 rounded-lg px-3 py-2 border focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" id="u-email" class="w-full border-gray-300 rounded-lg px-3 py-2 border focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select id="u-role" required class="w-full border-gray-300 rounded-lg px-3 py-2 border focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Superadmin</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="atasan">Atasan</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Password <span id="pwd-hint" class="text-xs text-gray-400 font-normal">(Leave blank to keep current)</span></label>
                    <input type="password" id="u-password" class="w-full border-gray-300 rounded-lg px-3 py-2 border focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                
                <div class="pt-4 flex justify-end gap-2 border-t mt-6">
                    <button type="button" id="btn-cancel-modal" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">Cancel</button>
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition">Save</button>
                </div>
            </form>
        </div>
    </div>
    `;
}

async function renderKonfigurasiUserInit() {
    // Hanya superadmin yang boleh membuat/menetapkan role superadmin
    if (App.user.role !== 'superadmin') {
        const opt = document.querySelector('#u-role option[value="superadmin"]');
        if (opt) opt.remove();
    }
    loadUsers();
    
    const modal = document.getElementById('user-modal');
    
    document.getElementById('btn-add-user').addEventListener('click', () => {
        editUserId = null;
        document.getElementById('modal-title').textContent = 'Add User';
        document.getElementById('user-form').reset();
        document.getElementById('u-password').required = true;
        document.getElementById('pwd-hint').classList.add('hidden');
        modal.classList.remove('hidden');
    });
    
    const closeModal = () => modal.classList.add('hidden');
    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    
    document.getElementById('user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            name: document.getElementById('u-name').value,
            username: document.getElementById('u-username').value,
            email: document.getElementById('u-email').value,
            role: document.getElementById('u-role').value
        };
        
        const pwd = document.getElementById('u-password').value;
        if (pwd) payload.password = pwd;
        
        try {
            if (editUserId) {
                await App.api(`/users/${editUserId}`, { method: 'PUT', body: JSON.stringify(payload) });
                App.showToast('User updated', 'success');
            } else {
                await App.api('/users', { method: 'POST', body: JSON.stringify(payload) });
                App.showToast('User created', 'success');
            }
            closeModal();
            loadUsers();
        } catch (e) {
            App.showToast(e.message, 'error');
        }
    });
}

async function loadUsers() {
    try {
        usersList = await App.api('/users');
        const tbody = document.getElementById('user-tbody');
        
        tbody.innerHTML = usersList.map(u => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-900">${App.esc(u.name)}</td>
                <td class="px-4 py-3">${App.esc(u.username)}</td>
                <td class="px-4 py-3">${App.esc(u.email || '-')}</td>
                <td class="px-4 py-3 capitalize">
                    <span class="px-2 py-1 rounded text-xs font-medium ${u.role==='superadmin'?'bg-red-100 text-red-800' : u.role==='admin'?'bg-purple-100 text-purple-800' : u.role==='supervisor'?'bg-blue-100 text-blue-800' : u.role==='atasan'?'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">${u.role}</span>
                </td>
                <td class="px-4 py-3 text-center">
                    ${(u.role === 'superadmin' && App.user.role !== 'superadmin')
                        ? '<span class="text-xs text-gray-400">terkunci</span>'
                        : `<button onclick="editUser(${Number(u.id)})" class="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="deleteUser(${Number(u.id)})" class="text-red-600 hover:bg-red-50 p-1.5 rounded transition ml-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}
                </td>
            </tr>
        `).join('');
        lucide.createIcons();
        
    } catch (e) {
        document.getElementById('user-tbody').innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">Failed to load users</td></tr>`;
    }
}

window.editUser = function(id) {
    const u = usersList.find(x => Number(x.id) === Number(id));
    if (!u) return;
    
    editUserId = id;
    document.getElementById('modal-title').textContent = 'Edit User';
    document.getElementById('u-name').value = u.name;
    document.getElementById('u-username').value = u.username;
    document.getElementById('u-email').value = u.email || '';
    document.getElementById('u-role').value = u.role;
    document.getElementById('u-password').value = '';
    document.getElementById('u-password').required = false;
    document.getElementById('pwd-hint').classList.remove('hidden');
    
    document.getElementById('user-modal').classList.remove('hidden');
};

window.deleteUser = async function(id) {
    if (!confirm('Hapus user ini?')) return;
    try {
        await App.api(`/users/${id}`, { method: 'DELETE' });
        App.showToast('User deleted', 'success');
        loadUsers();
    } catch (e) {
        App.showToast(e.message, 'error');
    }
};
