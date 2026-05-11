document.addEventListener('DOMContentLoaded', () => {
    fetchStats();
    setupWebSocket();
});

// A map to store latest readings per device. We can update this when a WS message arrives.
let latestReadings = {};
let latestGasReadings = {};

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
        } else {
            // Fetch initial temp data to populate the readings map
            const tempResponse = await fetch('/api/temp?limit=500');
            const tempData = await tempResponse.json();
            tempData.forEach(t => {
                if (!latestReadings[t.device_id]) {
                    latestReadings[t.device_id] = {
                        t_dht1: t.t_dht1,
                        t_dht2: t.t_dht2,
                        t_bmp: t.t_bmp,
                        is_anomaly: t.is_anomaly
                    };
                }
            });

            // Render temp device cards
            container.innerHTML = '';
            updateGlobalStats(data.devices);
            data.devices.forEach(device => {
                const live = latestReadings[device.device_id] || { t_dht1: 0, t_dht2: 0, t_bmp: 0, is_anomaly: false };
                container.appendChild(createTempCard(device, live));
            });
        }
        
        // Fetch initial gas data to populate the gas map
        const gasResponse = await fetch('/api/gas?limit=500');
        const gasData = await gasResponse.json();
        
        // gasData is ordered by created_at DESC, so the first occurrence of a device is the latest
        gasData.forEach(g => {
            if (!latestGasReadings[g.device_id]) {
                latestGasReadings[g.device_id] = {
                    gas_raw: g.gas_raw,
                    gas_lpg: g.gas_lpg,
                    gas_co: g.gas_co
                };
            }
        });

        // Render gas device cards
        const gasContainer = document.getElementById('gas-stats-container');
        gasContainer.innerHTML = '';
        const gasDevices = Object.keys(latestGasReadings);
        if (gasDevices.length === 0) {
            gasContainer.innerHTML = '<div class="text-slate-500 italic p-4">No gas sensors detected.</div>';
        } else {
            gasDevices.forEach(device_id => {
                const gas = latestGasReadings[device_id];
                gasContainer.appendChild(createGasCard(device_id, gas));
            });
        }
    } catch (error) {
        console.error("Error fetching stats:", error);
    }
}

function createTempCard(stats, live) {
    // 5 minutes of data = ~27 records (11 seconds interval)
    const hasEnoughData = stats.total_records >= 27; 
    const isAnomaly = hasEnoughData && (live.is_anomaly || stats.anomaly_rate > 5.0); // Mark alert if highly anomalous
    
    // Setup colors and status labels based on the alert state
    let bgContainerClass = 'bg-slate-200/50';
    let borderClass = '';
    let statusBgClass = 'bg-slate-200';
    let statusTextClass = 'text-slate-600';
    let statusText = 'NOT ENOUGH DATA';
    let subStatusBg = 'bg-slate-100';
    let subStatusText = 'text-slate-500';

    if (hasEnoughData) {
        bgContainerClass = isAnomaly ? 'bg-error-container/20' : 'bg-primary-container/20';
        borderClass = isAnomaly ? 'border-t-2 border-t-error' : '';
        statusBgClass = isAnomaly ? 'bg-red-100' : 'bg-emerald-100';
        statusTextClass = isAnomaly ? 'text-error' : 'text-emerald-700';
        statusText = isAnomaly ? 'ALERT' : 'NORMAL';
        subStatusBg = isAnomaly ? 'bg-red-50' : 'bg-emerald-50';
        subStatusText = isAnomaly ? 'text-error' : 'text-emerald-600';
    }
    
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
                        DHT & BMP
                    </p>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <div class="${statusBgClass} ${statusTextClass} px-3 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase">${statusText}</div>
                    <span class="text-[10px] font-bold ${subStatusText} ${subStatusBg} px-2 rounded-full">${hasEnoughData ? stats.anomaly_rate.toFixed(1) + '% Anomaly Rate' : 'Calculating...'}</span>
                </div>
            </div>
            
            <div class="flex items-center justify-center py-6 gap-6">
                <div class="relative text-center">
                    <div class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-2">DHT Temp</div>
                    <div class="text-4xl font-extrabold text-slate-900 leading-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.05)]">
                        ${live.t_dht1.toFixed(1)}<span class="text-xl align-top font-medium text-slate-400">°C</span>
                    </div>
                </div>
                <div class="relative text-center">
                    <div class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-2">BMP Temp</div>
                    <div class="text-4xl font-extrabold text-slate-900 leading-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.05)]">
                        ${live.t_bmp.toFixed(1)}<span class="text-xl align-top font-medium text-slate-400">°C</span>
                    </div>
                </div>
            </div>

            <div class="flex flex-col items-center justify-center border-t border-slate-200/50 pt-4 mt-2">
                <div class="mt-2 flex gap-6 w-full justify-center">
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

function createGasCard(device_id, gas) {
    const card = document.createElement('div');
    card.className = `glass p-md rounded-xl relative overflow-hidden group bg-slate-200/50 border border-slate-200`;
    
    card.innerHTML = `
        <div class="relative z-10 w-full flex flex-col h-full">
            <div class="flex justify-between items-start mb-6 w-full">
                <div class="flex items-center gap-3">
                    <div class="p-2.5 bg-white rounded-xl shadow-sm border border-slate-100">
                        <span class="material-symbols-outlined text-slate-500" data-icon="sensors">sensors</span>
                    </div>
                    <div>
                        <h3 class="font-h3 text-h3 text-slate-800 leading-tight">${device_id}</h3>
                        <p class="text-label-sm font-label-sm text-slate-500 uppercase tracking-widest">Gas Data</p>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <div class="bg-blue-100 text-blue-700 px-3 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase">LIVE</div>
                </div>
            </div>
            
            <div class="flex justify-around items-center w-full py-4">
                <div class="text-center">
                    <div class="text-3xl font-extrabold text-slate-900 leading-none">${gas.gas_raw.toFixed(1)}</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-2">Raw</div>
                </div>
                <div class="text-center">
                    <div class="text-3xl font-extrabold text-slate-900 leading-none">${gas.gas_lpg.toFixed(1)}</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-2">LPG</div>
                </div>
                <div class="text-center">
                    <div class="text-3xl font-extrabold text-slate-900 leading-none">${gas.gas_co.toFixed(1)}</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-2">CO</div>
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
        if (data.type === 'temp') {
            latestReadings[data.device_id] = {
                t_dht1: data.t_dht1,
                t_dht2: data.t_dht2,
                t_bmp: data.t_bmp,
                is_anomaly: data.is_anomaly
            };
        } else if (data.type === 'gas') {
            latestGasReadings[data.device_id] = {
                gas_raw: data.gas_raw,
                gas_lpg: data.gas_lpg,
                gas_co: data.gas_co
            };
        }
        // Refresh the UI grid
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
