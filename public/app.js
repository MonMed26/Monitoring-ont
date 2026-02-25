document.addEventListener('DOMContentLoaded', () => {
    fetchDevices();

    // Auto refresh every 30 seconds
    setInterval(fetchDevices, 30000);

    // Manual refresh
    document.getElementById('refreshBtn').addEventListener('click', function () {
        this.classList.add('refreshing');
        fetchDevices().finally(() => {
            setTimeout(() => this.classList.remove('refreshing'), 500);
        });
    });

    // Search functionality
    document.getElementById('searchInput').addEventListener('input', function (e) {
        filterTable(e.target.value.toLowerCase());
    });
});

let allDevices = [];
// Assuming Threshold as -27 from .env
const RX_THRESHOLD = -27;

async function fetchDevices() {
    try {
        const res = await fetch('/api/devices');
        const data = await res.json();

        if (data.success) {
            allDevices = data.data;
            updateDashboard(allDevices);
        }
    } catch (err) {
        console.error('Failed to fetch devices:', err);
        showError('Unable to connect to the server. Please check your network or ensure the backend is running.');
    }
}

function updateDashboard(devices) {
    // 1. Update general stats
    document.getElementById('totalCount').textContent = devices.length;

    const onlineCount = devices.filter(d => d.isOnline).length;
    document.getElementById('onlineCount').textContent = onlineCount;
    document.getElementById('offlineCount').textContent = devices.length - onlineCount;

    const criticalCount = devices.filter(d => d.rxPower !== null && d.rxPower < RX_THRESHOLD).length;
    document.getElementById('criticalRxCount').textContent = criticalCount;

    // 2. Render Table
    renderTable(devices);

    // 3. Update Timestamp
    const now = new Date();
    document.getElementById('lastUpdated').textContent = now.toLocaleTimeString();
}

function renderTable(devices) {
    const tbody = document.getElementById('deviceTableBody');
    tbody.innerHTML = '';

    if (devices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-slate-500">
                    <i class="ph ph-warning-circle text-3xl mb-2 inline-block"></i>
                    <p>No ONTs found. Connecting to GenieACS...</p>
                </td>
            </tr>
        `;
        return;
    }

    devices.forEach(device => {
        const tr = document.createElement('tr');
        tr.className = 'transition-colors';

        // Status Bagde
        const statusClass = device.isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20';
        const statusIcon = device.isOnline ? 'ph-check-circle' : 'ph-warning-circle';
        const statusText = device.isOnline ? 'Online' : 'Offline';

        // Rx Power Formatting
        let rxDisplay = 'Unknown';
        let rxClass = 'text-slate-400';
        if (device.rxPower !== null && device.rxPower !== undefined) {
            rxDisplay = `${device.rxPower} dBm`;
            if (device.rxPower < RX_THRESHOLD) {
                rxClass = 'text-rose-400 font-semibold';
            } else if (device.rxPower < -24) {
                rxClass = 'text-amber-400';
            } else {
                rxClass = 'text-emerald-400';
            }
        }

        tr.innerHTML = `
            <td class="p-4 whitespace-nowrap">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusClass}">
                    <i class="ph-fill ${statusIcon} mr-1.5"></i> ${statusText}
                </span>
            </td>
            <td class="p-4 font-mono text-xs text-slate-300">${device.id}</td>
            <td class="p-4 text-slate-200 font-medium">${device.location}</td>
            <td class="p-4 font-mono text-xs text-blue-300">
                <a href="http://${device.ip}" target="_blank" class="hover:underline flex items-center">
                    ${device.ip} <i class="ph ph-arrow-up-right ml-1"></i>
                </a>
            </td>
            <td class="p-4 ${rxClass}">${rxDisplay}</td>
            <td class="p-4 text-slate-400 text-xs">${device.uptime || 'N/A'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function filterTable(query) {
    if (!query) {
        renderTable(allDevices);
        return;
    }

    const filtered = allDevices.filter(device => {
        return device.id.toLowerCase().includes(query) ||
            device.location.toLowerCase().includes(query) ||
            device.ip.toLowerCase().includes(query);
    });

    renderTable(filtered);
}

function showError(msg) {
    const tbody = document.getElementById('deviceTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="p-8 text-center text-rose-400 bg-rose-500/5">
                <i class="ph ph-warning text-3xl mb-2 inline-block"></i>
                <p>${msg}</p>
            </td>
        </tr>
    `;
}
