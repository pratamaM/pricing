function renderDashboard() {
    return `
    <div class="space-y-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="dashboard-summary">
            <div class="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500 flex items-center justify-between">
                <div>
                    <p class="text-sm text-gray-500 mb-1">Total Routes</p>
                    <h3 class="text-2xl font-bold text-gray-800" id="summary-total">-</h3>
                </div>
                <div class="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center">
                    <i data-lucide="map" class="w-6 h-6"></i>
                </div>
            </div>
            
            <div class="bg-white rounded-xl shadow-sm p-5 border-l-4 border-green-500 flex items-center justify-between">
                <div>
                    <p class="text-sm text-gray-500 mb-1">Land Routes</p>
                    <h3 class="text-2xl font-bold text-gray-800" id="summary-land">-</h3>
                </div>
                <div class="w-12 h-12 bg-green-50 text-green-500 rounded-full flex items-center justify-center">
                    <i data-lucide="truck" class="w-6 h-6"></i>
                </div>
            </div>
            
            <div class="bg-white rounded-xl shadow-sm p-5 border-l-4 border-cyan-500 flex items-center justify-between">
                <div>
                    <p class="text-sm text-gray-500 mb-1">Sea Routes</p>
                    <h3 class="text-2xl font-bold text-gray-800" id="summary-sea">-</h3>
                </div>
                <div class="w-12 h-12 bg-cyan-50 text-cyan-500 rounded-full flex items-center justify-center">
                    <i data-lucide="ship" class="w-6 h-6"></i>
                </div>
            </div>
            
            <div class="bg-white rounded-xl shadow-sm p-5 border-l-4 border-yellow-500 flex items-center justify-between">
                <div>
                    <p class="text-sm text-gray-500 mb-1">Pending Approvals</p>
                    <h3 class="text-2xl font-bold text-gray-800" id="summary-pending">-</h3>
                </div>
                <div class="w-12 h-12 bg-yellow-50 text-yellow-500 rounded-full flex items-center justify-center">
                    <i data-lucide="clock" class="w-6 h-6"></i>
                </div>
            </div>
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                <h3 class="text-lg font-semibold text-gray-800 mb-4">Top Cost Destinations (Land)</h3>
                <div class="relative h-64 w-full">
                    <canvas id="chart-land"></canvas>
                </div>
            </div>
            <div class="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                <h3 class="text-lg font-semibold text-gray-800 mb-4">Top Cost Destinations (Sea)</h3>
                <div class="relative h-64 w-full">
                    <canvas id="chart-sea"></canvas>
                </div>
            </div>
        </div>
    </div>
    `;
}

async function renderDashboardInit() {
    try {
        const [summary, topDest] = await Promise.all([
            App.api('/dashboard/summary'),
            App.api('/dashboard/top-destinations')
        ]);
        
        const totalLand = summary.totalLandRoutes || 0;
        const totalSea = summary.totalSeaRoutes || 0;
        document.getElementById('summary-total').textContent = (totalLand + totalSea).toLocaleString('id-ID');
        document.getElementById('summary-land').textContent = totalLand.toLocaleString('id-ID');
        document.getElementById('summary-sea').textContent = totalSea.toLocaleString('id-ID');
        document.getElementById('summary-pending').textContent = summary.totalPendingApprovals || 0;
        
        const landData = (topDest.land || []).filter(d => d.destination_kota);
        const seaData = (topDest.sea || []).filter(d => d.destination_kota);
        
        // Chart Land
        const ctxLand = document.getElementById('chart-land').getContext('2d');
        new Chart(ctxLand, {
            type: 'bar',
            data: {
                labels: landData.map(d => d.destination_kota || 'N/A'),
                datasets: [{
                    label: 'Total Cost (Rp)',
                    data: landData.map(d => d.total_cost || 0),
                    backgroundColor: 'rgba(34, 197, 94, 0.5)',
                    borderColor: 'rgb(34, 197, 94)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
        
        // Chart Sea
        const ctxSea = document.getElementById('chart-sea').getContext('2d');
        new Chart(ctxSea, {
            type: 'bar',
            data: {
                labels: seaData.map(d => d.destination_kota || 'N/A'),
                datasets: [{
                    label: 'Total Cost (Rp)',
                    data: seaData.map(d => d.total_cost || 0),
                    backgroundColor: 'rgba(6, 182, 212, 0.5)',
                    borderColor: 'rgb(6, 182, 212)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });

    } catch (e) {
        App.showToast('Gagal memuat data dashboard: ' + e.message, 'error');
    }
}
