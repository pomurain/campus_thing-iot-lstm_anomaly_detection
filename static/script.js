document.addEventListener('DOMContentLoaded', () => {
    fetchStats();
    setupWebSocket();
});

// A map to store latest readings per device. We can update this when a WS message arrives.
let latestReadings = {};

// We also need a way to sum up total records and total anomalies for the Global Overview section
// since the /api/stats now returns it grouped by device.
function updateGlobalStats(devices) {
    let totalRecords = 0;
    let totalAnomalies = 0;
    
    devices.forEach(d => {
        totalRecords += d.total_records;
        totalAnomalies += d.total_anomalies;
    });

    document.getElementById('stat-total').textContent = totalRecords.toLocaleString();
    document.getElementById('stat-anomalies').textContent = totalAnomalies.toLocaleString();
}

async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        
        const container = document.getElementById('device-stats-container');
        if (!data.devices || data.devices.length === 0) {
            container.innerHTML = '<div class="text-slate-500 italic p-4">No devices connected yet.</div>';
            return;
        }
        
        container.innerHTML = '';
        updateGlobalStats(data.devices);

        data.devices.forEach(device => {
            // Check if we have a recent live reading for this device, else fallback to unknown.
            const live = latestReadings[device.device_id] || { value: 0, sensor_type: 'unknown', anomaly_score: 0 };
            container.appendChild(createDeviceCard(device, live));
        });
    } catch (error) {
        console.error("Error fetching stats:", error);
    }
}

function createDeviceCard(stats, live) {
    const isAnomaly = live.anomaly_score > 0.5 || stats.anomaly_rate > 5.0; // Mark alert if highly anomalous
    
    // Setup colors and status labels based on the alert state
    const bgContainerClass = isAnomaly ? 'bg-error-container/20' : 'bg-primary-container/20';
    const borderClass = isAnomaly ? 'border-t-2 border-t-error' : '';
    
    const statusBgClass = isAnomaly ? 'bg-red-100' : 'bg-emerald-100';
    const statusTextClass = isAnomaly ? 'text-error' : 'text-emerald-700';
    const statusText = isAnomaly ? 'ALERT' : 'NORMAL';
    
    const subStatusBg = isAnomaly ? 'bg-red-50' : 'bg-emerald-50';
    const subStatusText = isAnomaly ? 'text-error' : 'text-emerald-600';
    
    let unit = '';
    if (live.sensor_type === 'temperature') unit = '°C';
    else if (live.sensor_type === 'humidity') unit = '%';
    else if (live.sensor_type === 'pressure') unit = 'kPa';

    const card = document.createElement('div');
    card.className = `glass p-md rounded-xl relative overflow-hidden group ${borderClass}`;
    card.innerHTML = `
        <div class="absolute top-0 right-0 w-64 h-64 ${bgContainerClass} rounded-full -mr-32 -mt-32 blur-3xl transition-all duration-700"></div>
        <div class="relative z-10">
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h3 class="text-h3 font-h3 text-slate-900 leading-tight">${stats.device_id}</h3>
                    <p class="text-slate-500 text-sm flex items-center gap-1 uppercase tracking-wider text-[10px] mt-1">
                        <span class="material-symbols-outlined text-xs" data-icon="sensors">sensors</span>
                        ${live.sensor_type}
                    </p>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <div class="${statusBgClass} ${statusTextClass} px-3 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase">${statusText}</div>
                    <span class="text-[10px] font-bold ${subStatusText} ${subStatusBg} px-2 rounded-full">${stats.anomaly_rate.toFixed(1)}% Anomaly Rate</span>
                </div>
            </div>
            
            <div class="flex flex-col items-center justify-center py-6">
                <div class="relative">
                    <div class="text-6xl font-extrabold text-slate-900 leading-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.05)]">
                        ${live.value.toFixed(1)}<span class="text-2xl align-top font-medium text-slate-400">${unit}</span>
                    </div>
                </div>
                
                <div class="mt-6 flex gap-6 w-full justify-center">
                    <div class="text-center">
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Records</p>
                        <p class="text-lg font-bold text-slate-700">${stats.total_records.toLocaleString()}</p>
                    </div>
                    <div class="w-[1px] h-8 bg-slate-200"></div>
                    <div class="text-center">
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Anomalies</p>
                        <p class="text-lg font-bold text-slate-700">${stats.total_anomalies.toLocaleString()}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    return card;
}

// WebSocket Setup
function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    let ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log("WebSocket connected");
        document.getElementById('connection-status').textContent = 'Live';
        document.getElementById('connection-status').className = 'text-sm font-bold text-emerald-700';
        document.getElementById('connection-container').className = 'flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200';
        document.getElementById('connection-dot').className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // Save the latest reading for this device
        latestReadings[data.device_id] = {
            value: data.value,
            sensor_type: data.sensor_type,
            anomaly_score: data.anomaly_score
        };
        // Refresh the UI grid with the new reading and updated stats
        fetchStats(); 
    };
    
    ws.onclose = () => {
        console.log("WebSocket disconnected");
        document.getElementById('connection-status').textContent = 'Disconnected';
        document.getElementById('connection-status').className = 'text-sm font-bold text-red-700';
        document.getElementById('connection-container').className = 'flex items-center gap-2 bg-red-50 px-3 py-1 rounded-full border border-red-200';
        document.getElementById('connection-dot').className = 'w-2 h-2 rounded-full bg-red-500';
        
        // Try to reconnect in 5 seconds
        setTimeout(setupWebSocket, 5000);
    };
    
    ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.close();
    };
}
