// ======================
// VARIABEL GLOBAL
// ======================
let selectedForDelete = [];
let customFolders = [];
let currentScanData = null;
let storageCharts = []; // VARIABLE BARU UNTUK CHART

// ======================
// FUNGSI NAVIGASI
// ======================
function showScanner() {
    document.getElementById("scanner").classList.remove("hidden");
    document.getElementById("tutorial").classList.add("hidden");
    document.getElementById("homePage").classList.add("hidden");
    document.getElementById("driveSelection").classList.add("hidden");
    document.getElementById("duplicateFinder").classList.add("hidden");
    document.getElementById("derivativeAnalysis").classList.add("hidden");
}

// ======================
// FUNGSI GRAFIK BARU - MODIFIED untuk integrasi dengan analyticsBox
// ======================
function drawStorageCharts(data) {
    // Hapus chart sebelumnya
    storageCharts.forEach(chart => chart.destroy());
    storageCharts = [];
    
    // AMBIL CONTAINER YANG SUDAH ADA DI HTML
    const chartContainer = document.getElementById("chartContainer");
    
    if (!chartContainer) {
        console.error("chartContainer tidak ditemukan!");
        return;
    }
    
    chartContainer.innerHTML = ''; // Kosongkan dulu
    
    if (!data.storage_history || data.storage_history.length < 2) {
        chartContainer.innerHTML = `
            <div style="text-align: center; padding: 30px; background: #f8f9fa; border-radius: 15px;">
                <i class="fas fa-chart-line" style="font-size: 2.5rem; color: #ddd; margin-bottom: 15px; display: block;"></i>
                <h3 style="color: #666; margin-bottom: 10px;">📈 Data Grafik Tidak Tersedia</h3>
                <p style="color: #999;">Lakukan scan minimal 2 kali untuk melihat analisis tren.</p>
                <button class="btn" onclick="showScanner()" style="margin-top: 15px;">
                    <i class="fas fa-sync-alt"></i> Lakukan Scan Lagi
                </button>
            </div>
        `;
        return;
    }
    
    const histories = data.storage_history;
    const allDrives = new Set();
    
    // Kumpulkan semua drive dari history
    histories.forEach(h => {
        if (h.storage_info) {
            Object.keys(h.storage_info).forEach(drive => allDrives.add(drive));
        }
    });
    
    const driveList = Array.from(allDrives);
    
    // Warna untuk setiap drive
    const driveColors = {
        'C:': { main: '#3498db', light: 'rgba(52, 152, 219, 0.2)' },
        'D:': { main: '#2ecc71', light: 'rgba(46, 204, 113, 0.2)' },
        'E:': { main: '#e74c3c', light: 'rgba(231, 76, 60, 0.2)' },
        'F:': { main: '#f39c12', light: 'rgba(243, 156, 18, 0.2)' }
    };
    
    // Header grafik
    chartContainer.innerHTML = `
        <div class="chart-header">
            <div class="chart-title">
                <i class="fas fa-chart-line"></i>
                <h3>📊 Grafik Tren Penyimpanan Per Drive</h3>
            </div>
            <div class="chart-controls">
                <button class="chart-btn active" onclick="toggleChartView('linear')">
                    <i class="fas fa-chart-line"></i> Skala Linear
                </button>
                <button class="chart-btn" onclick="toggleChartView('percentage')">
                    <i class="fas fa-percentage"></i> Skala Persentase
                </button>
                <button class="chart-btn" onclick="toggleChartView('log')">
                    <i class="fas fa-chart-bar"></i> Skala Logaritmik
                </button>
            </div>
        </div>
        <div class="chart-grid" id="chartsGrid"></div>
    `;
    
    const chartsGrid = document.getElementById('chartsGrid');
    
    // ANALISIS DATA UNTUK SETTING SKALA YANG OPTIMAL
    const driveAnalysis = {};
    
    driveList.forEach(drive => {
        const storageData = histories.map(h => {
            if (h.storage_info && h.storage_info[drive]) {
                return h.storage_info[drive].used || 0;
            }
            return null;
        }).filter(val => val !== null);
        
        if (storageData.length < 2) return;
        
        const minValue = Math.min(...storageData);
        const maxValue = Math.max(...storageData);
        const range = maxValue - minValue;
        const avgValue = storageData.reduce((a, b) => a + b, 0) / storageData.length;
        
        driveAnalysis[drive] = {
            min: minValue,
            max: maxValue,
            range: range,
            avg: avgValue,
            data: storageData
        };
    });
    
    // Buat grafik untuk setiap drive
    driveList.forEach(drive => {
        const color = driveColors[drive] || { main: '#667eea', light: 'rgba(102, 126, 234, 0.2)' };
        const analysis = driveAnalysis[drive];
        
        if (!analysis || analysis.data.length < 2) return;
        
        // Siapkan data dengan skala Y yang optimal
        const labels = histories
            .map((h, index) => {
                if (h.storage_info && h.storage_info[drive]) {
                    const date = new Date(h.time * 1000);
                    return date.toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
                return null;
            })
            .filter(label => label !== null);
        
        const storageData = analysis.data;
        
        // Hitung skala Y yang optimal
        const yMin = Math.max(0, analysis.min - (analysis.range * 0.1));
        const yMax = analysis.max + (analysis.range * 0.1);
        
        // Buat card untuk grafik
        const chartCard = document.createElement('div');
        chartCard.className = 'chart-card';
        chartCard.innerHTML = `
            <div class="chart-card-header">
                <div class="chart-card-title">
                    <h4>
                        <i class="fas fa-hdd" style="color: ${color.main};"></i>
                        Drive ${drive}
                    </h4>
                    <span class="drive-badge" style="background: ${color.light}; color: ${color.main};">
                        Range: ${formatBytes(analysis.range)}
                    </span>
                </div>
            </div>
            <div class="chart-canvas-container">
                <canvas id="chart_${drive.replace(':', '')}"></canvas>
            </div>
            <div class="chart-stats">
                ${createDriveStatsWithScale(histories, drive, color, analysis)}
            </div>
        `;
        
        chartsGrid.appendChild(chartCard);
        
        // Buat grafik garis dengan skala Y yang dioptimalkan
        const canvas = document.getElementById(`chart_${drive.replace(':', '')}`);
        const ctx = canvas.getContext('2d');
        
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Drive ${drive} - Terpakai`,
                    data: storageData,
                    borderColor: color.main,
                    backgroundColor: color.light,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: color.main,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1,
                    cubicInterpolationMode: 'monotone'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.raw;
                                const index = context.dataIndex;
                                const percentChange = index > 0 ? 
                                    ((value - storageData[index-1]) / storageData[index-1] * 100).toFixed(2) : 0;
                                
                                return [
                                    `Terpakai: ${formatBytes(value)}`,
                                    index > 0 ? `Perubahan: ${percentChange > 0 ? '+' : ''}${percentChange}%` : ''
                                ].filter(Boolean);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Waktu Scan',
                            font: {
                                size: 11
                            }
                        },
                        ticks: {
                            maxRotation: 45,
                            font: {
                                size: 9
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    y: {
                        type: 'linear',
                        min: yMin,
                        max: yMax,
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Penyimpanan Terpakai',
                            font: {
                                size: 11
                            }
                        },
                        ticks: {
                            callback: function(value) {
                                return formatBytes(value);
                            },
                            font: {
                                size: 10
                            },
                            stepSize: calculateOptimalStepSize(analysis.range)
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.03)'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart'
                }
            }
        });
        
        storageCharts.push(chart);
        
        // Tambah event untuk zoom pada Y axis
        canvas.addEventListener('wheel', function(event) {
            event.preventDefault();
            const delta = event.deltaY > 0 ? 1.1 : 0.9;
            
            chart.options.scales.y.min *= delta;
            chart.options.scales.y.max *= delta;
            chart.update();
        });
    });
    
    // Jika tidak ada grafik yang dibuat
    if (storageCharts.length === 0) {
        chartsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: #f8f9fa; border-radius: 15px;">
                <i class="fas fa-database" style="font-size: 3rem; color: #ddd; margin-bottom: 20px; display: block;"></i>
                <h3 style="color: #666;">📊 Tidak Ada Data Grafik</h3>
                <p style="color: #999;">Data history tidak cukup untuk membuat grafik.</p>
                <button class="btn" onclick="showScanner()" style="margin-top: 15px;">
                    <i class="fas fa-play"></i> Lakukan Scan Pertama
                </button>
            </div>
        `;
    }
}

// ======================
// FUNGSI TAMPILAN HASIL - MODIFIED
// ======================
function displayResult(data) {
    selectedForDelete = [];
    let html = `<h2>📊 Hasil Scan</h2>`;
    
    // Info scan
    html += `<div class="scan-info">`;
    html += `<p><strong>Waktu Scan:</strong> ${data.generated_at || 'Tidak tersedia'}</p>`;
    html += `<p><strong>Durasi:</strong> ${data.scan_time_sec || 0} detik</p>`;
    html += `<p><strong>File yang discan:</strong> ${data.files_scanned || 0}</p>`;
    
    if (data.scan_config) {
        const drives = data.scan_config.drives || [];
        if (drives.length > 0) {
            html += `<p><strong>Drive yang discan:</strong> ${drives.join(', ')}</p>`;
        }
    }
    html += `</div>`;
    
    // Info storage
    if (data.storage_info && Object.keys(data.storage_info).length > 0) {
        html += `<h3>💾 Ringkasan Penyimpanan</h3>`;
        html += `<div class="storage-summary">`;
        
        for (const [drive, info] of Object.entries(data.storage_info)) {
            const usedPercent = info.percentage || (info.used / info.total * 100);
            const driveClass = `drive-${drive.toLowerCase().replace(':', '')}`;
            
            html += `
                <div class="storage-card ${driveClass}">
                    <h4>Drive ${drive}</h4>
                    <p><strong>Terpakai:</strong> ${formatBytes(info.used)}</p>
                    <p><strong>Kosong:</strong> ${formatBytes(info.free)}</p>
                    <p><strong>Total:</strong> ${formatBytes(info.total)}</p>
                    <div class="usage-bar">
                        <div class="usage-fill" style="width: ${Math.min(usedPercent, 100)}%; 
                             background: ${usedPercent > 80 ? '#e74c3c' : (usedPercent > 60 ? '#f39c12' : '#2ecc71')};">
                        </div>
                    </div>
                    <p>${usedPercent.toFixed(1)}% terpakai</p>
                </div>
            `;
        }
        html += `</div>`;
    }
    
    // File besar
    html += `<h3>📦 File Besar (> ${data.scan_config?.scan_options?.large_files_threshold_mb || 100}MB)</h3>`;
    
    if (data.large_files && data.large_files.length > 0) {
        html += `<p><strong>Total:</strong> ${data.large_files.length} file</p>`;
        html += `<div class="file-list">`;
        
        data.large_files.forEach((f, index) => {
            const drive = f.drive || f.path.substring(0, 2);
            html += `
                <label class="file-item">
                    <input type="checkbox" value="${f.path}" onclick="toggleFile(this)">
                    <strong>[${drive}]</strong> ${f.path}<br>
                    <span class="file-size">${formatBytes(f.size)}</span>
                </label>
            `;
        });
        html += `</div>`;
    } else {
        html += `<p class="no-data">Tidak ditemukan file besar.</p>`;
    }
    
    // File duplikat
    if (data.duplicate_files && data.duplicate_files.duplicate_groups) {
        html += displayDuplicateFiles(data.duplicate_files);
    }
    
    // File sampah
    let totalJunk = 0;
    let totalJunkCount = 0;
    for (let cat in data.junk_files) {
        data.junk_files[cat].forEach(f => {
            totalJunk += f.size;
            totalJunkCount++;
        });
    }
    
    html += `<h3>🗑️ File Sampah — Total: ${formatBytes(totalJunk)} (${totalJunkCount} file)</h3>`;
    
    if (totalJunkCount > 0) {
        html += `<label class="select-all">
            <input type="checkbox" id="selectAllJunk" onclick="toggleAllJunk(this)"> 
            <strong>Pilih Semua File Sampah</strong>
        </label>`;
        
        for (let cat in data.junk_files) {
            if (data.junk_files[cat].length === 0) continue;
            
            let catTotal = 0;
            data.junk_files[cat].forEach(f => catTotal += f.size);
            
            html += `
                <button class="collapsible">${cat.toUpperCase()} — ${formatBytes(catTotal)} (${data.junk_files[cat].length} file)</button>
                <div class="content">
                    <label class="select-category">
                        <input type="checkbox" class="catCheckbox" data-cat="${cat}" onclick="toggleCategory(this,'${cat}')">
                        <strong>Pilih semua ${cat.toUpperCase()} (${data.junk_files[cat].length} file)</strong>
                    </label>
            `;
            
            data.junk_files[cat].forEach(f => {
                const drive = f.drive || f.path.substring(0, 2);
                html += `
                    <label class="file-item">
                        <input type="checkbox" value="${f.path}" class="fileCheckbox" data-cat="${cat}" onclick="toggleFile(this)">
                        [${drive}] ${f.path}<br>
                        <span class="file-size">${formatBytes(f.size)}</span>
                    </label>
                `;
            });
            
            html += `</div>`;
        }
    } else {
        html += `<p class="no-data">Tidak ditemukan file sampah.</p>`;
    }
    
    // Ringkasan
    html += `<div class="summary">`;
    html += `<h4>📈 Ringkasan:</h4>`;
    html += `<p>Total penyimpanan yang discan: ${formatBytes(data.total_size || 0)}</p>`;
    html += `<p>File besar ditemukan: ${data.large_files?.length || 0}</p>`;
    html += `<p>File sampah ditemukan: ${totalJunkCount}</p>`;
    if (data.duplicate_files?.total_groups) {
        html += `<p>Grup duplikat: ${data.duplicate_files.total_groups}</p>`;
        html += `<p>Ruang yang bisa dihemat dari duplikat: ${formatBytes(data.duplicate_files.total_wasted_space)}</p>`;
    }
    html += `<p>File yang dipilih untuk penghapusan: <span id="selectedCount">0</span></p>`;
    html += `</div>`;
    
    document.getElementById("result").innerHTML = html;
    document.getElementById("cleanBtn").style.display = "block";
    
    // Setup collapsible sections
    const coll = document.getElementsByClassName("collapsible");
    for (let i = 0; i < coll.length; i++) {
        coll[i].addEventListener("click", function() {
            this.classList.toggle("active");
            const content = this.nextElementSibling;
            content.style.display = content.style.display === "block" ? "none" : "block";
        });
    }
    
    updateSelectedCount();
    
    // TAMPILKAN BOX ANALYTICS
    const analyticsBox = document.getElementById("analyticsBox");
    if (analyticsBox) {
        analyticsBox.style.display = "block";
    }
    
    // Render grafik dan ds/dt DALAM 1 BOX dengan delay
    setTimeout(() => {
        drawStorageCharts(data); // Grafik per-drive → ke #chartContainer
        calculateDSDT(data);     // Analisis ds/dt → ke #dsdtBox
    }, 100);
}

// ======================
// FUNGSI ANALISIS DS/DT - TETAP SAMA
// ======================
function calculateDSDT(data) {
    const hist = data.storage_history;
    if (!hist || hist.length < 2) {
        document.getElementById("dsdtBox").innerHTML = `
            <div style="text-align: center; padding: 30px; background: #fff3e0; border-radius: 15px; border-left: 5px solid #ff9800;">
                <i class="fas fa-info-circle" style="font-size: 2rem; color: #ff9800; margin-bottom: 15px; display: block;"></i>
                <h4 style="color: #e65100; margin-bottom: 10px;">Analisis ds/dt Tidak Tersedia</h4>
                <p style="color: #f57c00;">Lakukan minimal 2 kali scan untuk melihat analisis pertumbuhan penyimpanan.</p>
            </div>
        `;
        return;
    }
    
    const s2 = hist[hist.length - 1].total_size || 0;
    const s1 = hist[hist.length - 2].total_size || 0;
    const t2 = hist[hist.length - 1].time;
    const t1 = hist[hist.length - 2].time;
    
    const ds = s2 - s1;
    const dt = t2 - t1;
    
    if (dt === 0) {
        document.getElementById("dsdtBox").innerHTML = `
            <div class="dsdt-box">
                <h3><i class="fas fa-calculator"></i> Perhitungan ds/dt</h3>
                <p style="color: #ff9800;">⚠️ Tidak ada perbedaan waktu antara scan.</p>
            </div>
        `;
        return;
    }
    
    const dsdt = ds / dt;
    
    let html = `<div class="dsdt-box">`;
    html += `<h3><i class="fas fa-chart-line"></i> Analisis Pertumbuhan Penyimpanan (ds/dt)</h3>`;
    html += `<p><strong>📊 Perubahan penyimpanan (ds):</strong> ${formatBytes(ds)}</p>`;
    html += `<p><strong>⏱️ Perubahan waktu (dt):</strong> ${formatTime(dt)}</p>`;
    html += `<p><strong>📈 Laju pertumbuhan (ds/dt):</strong> ${formatBytes(dsdt)}/detik</p>`;
    
    if (dsdt > 5 * 1024 * 1024) {
        html += `<p class="warning-high">⚠️ PERTUMBUHAN TINGGI! Penyimpanan meningkat cepat.</p>`;
    } else if (dsdt > 1 * 1024 * 1024) {
        html += `<p class="warning-medium">⚠️ Pertumbuhan sedang. Pantau penggunaan penyimpanan.</p>`;
    } else if (dsdt < 0) {
        html += `<p class="success">✓ Penyimpanan berkurang. Pembersihan berhasil!</p>`;
    } else {
        html += `<p class="success">✓ Laju pertumbuhan normal.</p>`;
    }
    
    // Prediksi kapan storage penuh
    if (hist.length >= 2) {
        const latest = hist[hist.length - 1];
        if (latest.storage_info) {
            let totalFree = 0;
            let totalUsed = 0;
            Object.values(latest.storage_info).forEach(info => {
                totalFree += info.free;
                totalUsed += info.used;
            });
            
            if (dsdt > 0 && totalFree > 0) {
                const timeToFull = totalFree / dsdt; // detik
                html += `<p><strong>⏳ Prediksi:</strong> Storage akan penuh dalam ${formatTime(timeToFull)}</p>`;
            }
        }
    }
    
    html += `</div>`;
    document.getElementById("dsdtBox").innerHTML = html;
}

// Helper functions remain the same
function calculateOptimalStepSize(range) {
    const rangeGB = range / (1024 * 1024 * 1024);
    
    if (rangeGB < 0.1) return range / 10;
    if (rangeGB < 1) return 100 * 1024 * 1024;
    if (rangeGB < 10) return 1024 * 1024 * 1024;
    if (rangeGB < 100) return 5 * 1024 * 1024 * 1024;
    return 10 * 1024 * 1024 * 1024;
}

function createDriveStatsWithScale(histories, drive, color, analysis) {
    const latest = histories[histories.length - 1];
    if (!latest.storage_info || !latest.storage_info[drive]) {
        return '<p style="color: #666; text-align: center;">Data tidak tersedia</p>';
    }
    
    const info = latest.storage_info[drive];
    const percent = info.percentage || 0;
    
    // Hitung perubahan dari scan sebelumnya
    let changePercentage = 0;
    if (histories.length > 1) {
        const previous = histories[histories.length - 2];
        if (previous.storage_info && previous.storage_info[drive]) {
            const prevUsed = previous.storage_info[drive].used || 0;
            const currUsed = info.used || 0;
            changePercentage = ((currUsed - prevUsed) / prevUsed) * 100;
        }
    }
    
    // Hitung variasi data
    const dataPoints = analysis.data;
    const variation = calculateVariation(dataPoints);
    
    return `
        <div class="stat-item-mini">
            <div class="stat-label">Saat Ini</div>
            <div class="stat-value" style="color: ${color.main};">
                ${formatBytes(info.used)}
            </div>
            <div class="stat-change" style="color: ${changePercentage > 0 ? '#e74c3c' : changePercentage < 0 ? '#27ae60' : '#7f8c8d'}; font-size: 0.8rem;">
                ${changePercentage > 0 ? '📈' : changePercentage < 0 ? '📉' : '➡️'} ${Math.abs(changePercentage).toFixed(2)}%
            </div>
        </div>
        <div class="stat-item-mini">
            <div class="stat-label">Range Data</div>
            <div class="stat-value" style="font-size: 1rem;">
                ${formatBytes(analysis.min)} - ${formatBytes(analysis.max)}
            </div>
            <div class="stat-change" style="font-size: 0.8rem; color: #666;">
                Variasi: ${variation.toFixed(2)}%
            </div>
        </div>
        <div class="stat-item-mini">
            <div class="stat-label">% Terpakai</div>
            <div class="stat-value" style="color: ${percent > 80 ? '#e74c3c' : percent > 60 ? '#f39c12' : '#27ae60'}">
                ${percent.toFixed(1)}%
            </div>
            <div class="stat-change" style="font-size: 0.8rem;">
                ${percent > 80 ? '🟥 KRITIS' : percent > 60 ? '🟨 WASPADA' : '🟩 AMAN'}
            </div>
        </div>
        <div class="stat-item-mini">
            <div class="stat-label">Skala Grafik</div>
            <div class="stat-value" style="font-size: 1rem;">
                ${formatBytes(analysis.min)} - ${formatBytes(analysis.max)}
            </div>
            <div class="stat-change" style="font-size: 0.8rem; color: #666;">
                Auto-scaled ✓
            </div>
        </div>
    `;
}

function calculateVariation(dataPoints) {
    if (dataPoints.length < 2) return 0;
    
    const mean = dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length;
    const variance = dataPoints.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dataPoints.length;
    const stdDev = Math.sqrt(variance);
    
    return (stdDev / mean) * 100;
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    if (bytes < 0) return "-" + formatBytes(-bytes);
    
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return bytes.toFixed(2) + " " + units[i];
}

function formatTime(seconds) {
    if (seconds < 60) {
        return seconds + " detik";
    } else if (seconds < 3600) {
        return (seconds / 60).toFixed(1) + " menit";
    } else if (seconds < 86400) {
        return (seconds / 3600).toFixed(1) + " jam";
    } else {
        return (seconds / 86400).toFixed(1) + " hari";
    }
}

function showTutorial() {
    document.getElementById("tutorial").classList.remove("hidden");
    document.getElementById("scanner").classList.add("hidden");
    document.getElementById("homePage").classList.add("hidden");
    document.getElementById("driveSelection").classList.add("hidden");
    document.getElementById("duplicateFinder").classList.add("hidden");
    document.getElementById("derivativeAnalysis").classList.add("hidden");
}

function showHome() {
    document.getElementById("homePage").classList.remove("hidden");
    document.getElementById("tutorial").classList.add("hidden");
    document.getElementById("scanner").classList.add("hidden");
    document.getElementById("driveSelection").classList.add("hidden");
    document.getElementById("duplicateFinder").classList.add("hidden");
    document.getElementById("derivativeAnalysis").classList.add("hidden");
}

function showDriveSelection() {
    document.getElementById("driveSelection").classList.remove("hidden");
    document.getElementById("homePage").classList.add("hidden");
    document.getElementById("tutorial").classList.add("hidden");
    document.getElementById("scanner").classList.add("hidden");
    document.getElementById("duplicateFinder").classList.add("hidden");
    document.getElementById("derivativeAnalysis").classList.add("hidden");
    setupDriveSelection();
}

function showDuplicateFinder() {
    document.getElementById("duplicateFinder").classList.remove("hidden");
    document.getElementById("homePage").classList.add("hidden");
    document.getElementById("tutorial").classList.add("hidden");
    document.getElementById("scanner").classList.add("hidden");
    document.getElementById("driveSelection").classList.add("hidden");
    document.getElementById("derivativeAnalysis").classList.add("hidden");
}

function showDerivativeAnalysis() {
    document.getElementById("derivativeAnalysis").classList.remove("hidden");
    document.getElementById("homePage").classList.add("hidden");
    document.getElementById("tutorial").classList.add("hidden");
    document.getElementById("scanner").classList.add("hidden");
    document.getElementById("driveSelection").classList.add("hidden");
    document.getElementById("duplicateFinder").classList.add("hidden");
}

// ======================
// FUNGSI PEMILIHAN DRIVE
// ======================
function setupDriveSelection() {
    const drivesContainer = document.getElementById("driveCheckboxes");
    
    const drives = [
        { letter: "C:", name: "System Drive", default: true },
        { letter: "D:", name: "Data Drive", default: false },
        { letter: "E:", name: "Extra Drive", default: false },
        { letter: "F:", name: "External Drive", default: false }
    ];
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px;">';
    
    drives.forEach(drive => {
        html += `
            <div class="drive-option ${drive.default ? 'selected' : ''}" onclick="toggleDrive('${drive.letter}')">
                <input type="checkbox" id="drive_${drive.letter}" ${drive.default ? 'checked' : ''} 
                       value="${drive.letter}" style="display: none;">
                <strong>${drive.letter}</strong><br>
                <small>${drive.name}</small>
            </div>
        `;
    });
    
    html += '</div>';
    html += '<p style="margin-top: 10px;"><small>Scanner akan mendeteksi drive yang tersedia secara otomatis</small></p>';
    
    drivesContainer.innerHTML = html;
    customFolders = [];
    updateCustomFoldersList();
}

function toggleDrive(driveLetter) {
    const checkbox = document.getElementById(`drive_${driveLetter}`);
    const driveOption = checkbox.closest('.drive-option');
    checkbox.checked = !checkbox.checked;
    if (checkbox.checked) {
        driveOption.classList.add('selected');
    } else {
        driveOption.classList.remove('selected');
    }
}

// ======================
// FUNGSI FOLDER KUSTOM
// ======================
function addCustomFolder() {
    const folderInput = document.getElementById("customFolder");
    const folder = folderInput.value.trim();
    
    if (!folder) {
        alert("Silakan masukkan path folder!");
        return;
    }
    
    if (!folder.includes(":\\") && !folder.startsWith("\\\\")) {
        alert("Format folder tidak valid! Gunakan format seperti: D:\\Folder atau \\\\Server\\Share");
        return;
    }
    
    if (!customFolders.includes(folder)) {
        customFolders.push(folder);
        updateCustomFoldersList();
        folderInput.value = "";
    } else {
        alert("Folder sudah ditambahkan!");
    }
}

function updateCustomFoldersList() {
    const listDiv = document.getElementById("customFoldersList");
    
    if (customFolders.length === 0) {
        listDiv.innerHTML = '<div style="color: #666; font-style: italic;">Belum ada folder kustom ditambahkan</div>';
        return;
    }
    
    let html = '<div style="max-height: 150px; overflow-y: auto;">';
    customFolders.forEach((folder, index) => {
        html += `
            <div class="file-item" style="display: flex; justify-content: space-between; align-items: center;">
                <span>${folder}</span>
                <button onclick="removeCustomFolder(${index})" class="btn" style="padding: 2px 8px; font-size: 12px;">Hapus</button>
            </div>
        `;
    });
    html += '</div>';
    listDiv.innerHTML = html;
}

function removeCustomFolder(index) {
    customFolders.splice(index, 1);
    updateCustomFoldersList();
}

// ======================
// FUNGSI BUILDER KONFIGURASI
// ======================
function buildConfigObject() {
    const isDuplicateFinder = !document.getElementById("duplicateFinder").classList.contains("hidden");
    const isDriveSelection = !document.getElementById("driveSelection").classList.contains("hidden");
    
    let drives = [];
    let scanOptions = {};
    
    if (isDuplicateFinder) {
        const driveCheckboxes = document.querySelectorAll('#dupDriveCheckboxes input[type="checkbox"]');
        drives = Array.from(driveCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        
        scanOptions = {
            large_files_threshold_mb: 100,
            include_temp: false,
            include_logs: false,
            scan_downloads: true,
            scan_documents: true,
            scan_root: true,
            find_duplicates: true,
            min_duplicate_size_kb: parseInt(document.getElementById("minDuplicateSize").value) || 100,
            duplicate_file_types: Array.from(document.querySelectorAll('.dup-file-type:checked')).map(cb => cb.value)
        };
    } else if (isDriveSelection) {
        const driveCheckboxes = document.querySelectorAll('#driveCheckboxes input[type="checkbox"]:checked');
        drives = Array.from(driveCheckboxes).map(cb => cb.value);
        
        scanOptions = {
            large_files_threshold_mb: parseInt(document.getElementById("thresholdMB2").value) || 100,
            include_temp: document.getElementById("scanTemp").checked,
            include_logs: document.getElementById("scanLogs").checked,
            scan_downloads: document.getElementById("scanDownloads").checked,
            scan_documents: document.getElementById("scanDocuments").checked,
            scan_root: document.getElementById("scanRoot").checked,
            find_duplicates: document.getElementById("findDuplicates").checked,
            min_duplicate_size_kb: parseInt(document.getElementById("thresholdMB").value) || 100,
            duplicate_file_types: ["all"]
        };
    } else {
        drives = ["C:"];
        scanOptions = {
            large_files_threshold_mb: 100,
            include_temp: true,
            include_logs: true,
            scan_downloads: true,
            scan_documents: true,
            scan_root: false,
            find_duplicates: false
        };
    }
    
    const allPossibleDrives = ["C:", "D:", "E:", "F:"];
    const scanAllDrives = allPossibleDrives.every(drive => 
        drives.includes(drive)
    );
    
    return {
        scan_config: {
            drives: drives,
            custom_folders: customFolders,
            scan_all_drives: scanAllDrives,
            scan_options: scanOptions
        }
    };
}

function generateConfigAndDownload() {
    const config = buildConfigObject();
    
    if (config.scan_config.drives.length === 0 && config.scan_config.custom_folders.length === 0) {
        alert("Silakan pilih minimal satu drive atau tambahkan folder kustom!");
        return;
    }
    
    const blob = new Blob([JSON.stringify(config, null, 4)], {type: "application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "scan_config.json";
    link.click();
    
    alert("scan_config.json telah dibuat!\n\nLangkah selanjutnya:\n1. Download scanner.exe (jika belum)\n2. Taruh scanner.exe dan scan_config.json di folder yang sama\n3. Jalankan scanner.exe\n4. Upload scan_result.json ke website ini");
    showScanner();
}

// ======================
// FUNGSI PENCARI DUPLIKAT
// ======================
function startDuplicateScan() {
    const driveCheckboxes = document.querySelectorAll('#dupDriveCheckboxes input[type="checkbox"]');
    const drives = Array.from(driveCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
    if (drives.length === 0) {
        alert("❌ Silakan pilih minimal satu drive untuk scan duplikat!");
        return;
    }
    
    const fileTypeCheckboxes = document.querySelectorAll('.dup-file-type:checked');
    const fileTypes = Array.from(fileTypeCheckboxes).map(cb => cb.value);
    
    const minSize = parseInt(document.getElementById("minDuplicateSize").value) || 100;
    
    const config = {
        scan_config: {
            drives: drives,
            custom_folders: [],
            scan_all_drives: false,
            scan_options: {
                large_files_threshold_mb: 100,
                include_temp: false,
                include_logs: false,
                scan_downloads: true,
                scan_documents: true,
                scan_root: true,
                find_duplicates: true,
                min_duplicate_size_kb: minSize,
                duplicate_file_types: fileTypes
            }
        }
    };
    
    const blob = new Blob([JSON.stringify(config, null, 4)], {type: "application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "scan_config.json";
    link.click();
    
    document.getElementById("duplicateResults").innerHTML = `
        <div class="success-message">
            <h3>✅ Konfigurasi Berhasil Dibuat!</h3>
            <div style="background: #c3e6cb; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><strong>Drive yang akan discan:</strong> ${drives.join(', ')}</p>
                <p><strong>Jenis file:</strong> ${fileTypes.join(', ')}</p>
                <p><strong>Ukuran file minimum:</strong> ${minSize} KB</p>
            </div>
            
            <h4>📋 Langkah Selanjutnya:</h4>
            <ol>
                <li><button class="btn" onclick="downloadScanner()">Download scanner.exe</button> (jika belum)</li>
                <li>Taruh <strong>scanner.exe</strong> dan <strong>scan_config.json</strong> di folder yang sama</li>
                <li>Jalankan <strong>scanner.exe</strong> (double-click)</li>
                <li>Hasil akan disimpan sebagai <strong>scan_result.json</strong></li>
                <li>Kembali ke halaman ini dan upload scan_result.json</li>
            </ol>
            
            <div style="margin-top: 20px;">
                <button class="btn" onclick="showScanner()">Pergi ke Halaman Scanner</button>
                <button class="btn btn-secondary" onclick="showHome()">Kembali ke Beranda</button>
            </div>
        </div>
    `;
}

// ======================
// FUNGSI SCANNER - DIPERBAIKI
// ======================
function downloadScanner() {
    window.location.href = "downloads/scanner.exe";
}

function downloadCleaner() {
    window.location.href = "downloads/cleaner.exe";
}

// ======================
// FUNGSI SCAN RESULT
// ======================
function loadScanResult() {
    const file = document.getElementById("jsonFile").files[0];
    if (!file) {
        alert("Silakan pilih file scan_result.json terlebih dahulu!");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            currentScanData = JSON.parse(e.target.result);
            displayResult(currentScanData);
            
            // Log success
            console.log("✅ scan_result.json berhasil di-load");
            showNotification("✅ Hasil scan berhasil dimuat!");
            
        } catch (error) {
            console.error("❌ Error parsing JSON:", error);
            alert("Error parsing file JSON: " + error.message);
            
            // Tampilkan bantuan
            const help = confirm("File JSON tidak valid!\n\nApakah ini file scan_result.json yang benar?\n• OK: Lihat petunjuk\n• Cancel: Coba file lain");
            if (help) {
                alert("📋 PASTIKAN ANDA:\n1. Menjalankan scanner.exe terlebih dahulu\n2. Mengupload file scan_result.json (bukan scan_config.json)\n3. File dihasilkan oleh scanner.exe yang valid");
            }
        }
    };
    reader.readAsText(file);
}

// ======================
// FUNGSI GRAFIK GARIS BARU - SKALA OPTIMAL
// ======================
function drawStorageCharts(data) {
    // Hapus chart sebelumnya
    storageCharts.forEach(chart => chart.destroy());
    storageCharts = [];
    
    const chartContainer = document.getElementById("chartContainer") || 
        (function() {
            const container = document.createElement("div");
            container.id = "chartContainer";
            container.className = "chart-section";
            const resultDiv = document.getElementById("result");
            if (resultDiv) {
                resultDiv.appendChild(container);
            }
            return container;
        })();
    
    chartContainer.innerHTML = '';
    
    if (!data.storage_history || data.storage_history.length < 2) {
        chartContainer.innerHTML = `
            <div class="feature-card" style="text-align: center; padding: 30px;">
                <i class="fas fa-chart-line" style="font-size: 2.5rem; color: #ddd; margin-bottom: 15px;"></i>
                <h3>📈 Data Grafik Tidak Tersedia</h3>
                <p>Lakukan scan minimal 2 kali untuk melihat analisis tren.</p>
                <button class="btn" onclick="showScanner()" style="margin-top: 15px;">
                    <i class="fas fa-sync-alt"></i> Lakukan Scan Lagi
                </button>
            </div>
        `;
        return;
    }
    
    const histories = data.storage_history;
    const allDrives = new Set();
    
    // Kumpulkan semua drive dari history
    histories.forEach(h => {
        if (h.storage_info) {
            Object.keys(h.storage_info).forEach(drive => allDrives.add(drive));
        }
    });
    
    const driveList = Array.from(allDrives);
    
    // Warna untuk setiap drive
    const driveColors = {
        'C:': { main: '#3498db', light: 'rgba(52, 152, 219, 0.2)' },
        'D:': { main: '#2ecc71', light: 'rgba(46, 204, 113, 0.2)' },
        'E:': { main: '#e74c3c', light: 'rgba(231, 76, 60, 0.2)' },
        'F:': { main: '#f39c12', light: 'rgba(243, 156, 18, 0.2)' }
    };
    
    // Header grafik
    chartContainer.innerHTML = `
        <div class="chart-header">
            <div class="chart-title">
                <i class="fas fa-chart-line"></i>
                <h3>📊 Grafik Tren Penyimpanan Per Drive</h3>
            </div>
            <div class="chart-controls">
                <button class="chart-btn active" onclick="toggleChartView('linear')">
                    <i class="fas fa-chart-line"></i> Skala Linear
                </button>
                <button class="chart-btn" onclick="toggleChartView('percentage')">
                    <i class="fas fa-percentage"></i> Skala Persentase
                </button>
                <button class="chart-btn" onclick="toggleChartView('log')">
                    <i class="fas fa-chart-bar"></i> Skala Logaritmik
                </button>
            </div>
        </div>
        <div class="chart-grid" id="chartsGrid"></div>
    `;
    
    const chartsGrid = document.getElementById('chartsGrid');
    
    // ANALISIS DATA UNTUK SETTING SKALA YANG OPTIMAL
    const driveAnalysis = {};
    
    driveList.forEach(drive => {
        const storageData = histories.map(h => {
            if (h.storage_info && h.storage_info[drive]) {
                return h.storage_info[drive].used || 0;
            }
            return null;
        }).filter(val => val !== null);
        
        if (storageData.length < 2) return;
        
        const minValue = Math.min(...storageData);
        const maxValue = Math.max(...storageData);
        const range = maxValue - minValue;
        const avgValue = storageData.reduce((a, b) => a + b, 0) / storageData.length;
        
        driveAnalysis[drive] = {
            min: minValue,
            max: maxValue,
            range: range,
            avg: avgValue,
            data: storageData
        };
    });
    
    // Buat grafik untuk setiap drive
    driveList.forEach(drive => {
        const color = driveColors[drive] || { main: '#667eea', light: 'rgba(102, 126, 234, 0.2)' };
        const analysis = driveAnalysis[drive];
        
        if (!analysis || analysis.data.length < 2) return;
        
        // Siapkan data dengan skala Y yang optimal
        const labels = histories
            .map((h, index) => {
                if (h.storage_info && h.storage_info[drive]) {
                    const date = new Date(h.time * 1000);
                    return date.toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
                return null;
            })
            .filter(label => label !== null);
        
        const storageData = analysis.data;
        
        // Hitung skala Y yang optimal
        const yMin = Math.max(0, analysis.min - (analysis.range * 0.1));
        const yMax = analysis.max + (analysis.range * 0.1);
        
        // Buat card untuk grafik
        const chartCard = document.createElement('div');
        chartCard.className = 'chart-card';
        chartCard.innerHTML = `
            <div class="chart-card-header">
                <div class="chart-card-title">
                    <h4>
                        <i class="fas fa-hdd" style="color: ${color.main};"></i>
                        Drive ${drive}
                    </h4>
                    <span class="drive-badge" style="background: ${color.light}; color: ${color.main};">
                        Range: ${formatBytes(analysis.range)}
                    </span>
                </div>
            </div>
            <div class="chart-canvas-container">
                <canvas id="chart_${drive.replace(':', '')}"></canvas>
            </div>
            <div class="chart-stats">
                ${createDriveStatsWithScale(histories, drive, color, analysis)}
            </div>
        `;
        
        chartsGrid.appendChild(chartCard);
        
        // Buat grafik garis dengan skala Y yang dioptimalkan
        const canvas = document.getElementById(`chart_${drive.replace(':', '')}`);
        const ctx = canvas.getContext('2d');
        
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Drive ${drive} - Terpakai`,
                    data: storageData,
                    borderColor: color.main,
                    backgroundColor: color.light,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: color.main,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1,
                    cubicInterpolationMode: 'monotone'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.raw;
                                const index = context.dataIndex;
                                const percentChange = index > 0 ? 
                                    ((value - storageData[index-1]) / storageData[index-1] * 100).toFixed(2) : 0;
                                
                                return [
                                    `Terpakai: ${formatBytes(value)}`,
                                    index > 0 ? `Perubahan: ${percentChange > 0 ? '+' : ''}${percentChange}%` : ''
                                ].filter(Boolean);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Waktu Scan',
                            font: {
                                size: 11
                            }
                        },
                        ticks: {
                            maxRotation: 45,
                            font: {
                                size: 9
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    y: {
                        type: 'linear',
                        min: yMin,
                        max: yMax,
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Penyimpanan Terpakai',
                            font: {
                                size: 11
                            }
                        },
                        ticks: {
                            callback: function(value) {
                                return formatBytes(value);
                            },
                            font: {
                                size: 10
                            },
                            stepSize: calculateOptimalStepSize(analysis.range)
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.03)'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart'
                }
            }
        });
        
        storageCharts.push(chart);
        
        // Tambah event untuk zoom pada Y axis
        canvas.addEventListener('wheel', function(event) {
            event.preventDefault();
            const delta = event.deltaY > 0 ? 1.1 : 0.9;
            
            chart.options.scales.y.min *= delta;
            chart.options.scales.y.max *= delta;
            chart.update();
        });
    });
    
    // Jika tidak ada grafik yang dibuat
    if (storageCharts.length === 0) {
        chartsGrid.innerHTML = `
            <div class="feature-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                <i class="fas fa-database" style="font-size: 3rem; color: #ddd; margin-bottom: 20px;"></i>
                <h3>📊 Tidak Ada Data Grafik</h3>
                <p>Data history tidak cukup untuk membuat grafik.</p>
                <button class="btn" onclick="showScanner()" style="margin-top: 15px;">
                    <i class="fas fa-play"></i> Lakukan Scan Pertama
                </button>
            </div>
        `;
    }
}

function calculateOptimalStepSize(range) {
    const rangeGB = range / (1024 * 1024 * 1024);
    
    if (rangeGB < 0.1) return range / 10;
    if (rangeGB < 1) return 100 * 1024 * 1024;
    if (rangeGB < 10) return 1024 * 1024 * 1024;
    if (rangeGB < 100) return 5 * 1024 * 1024 * 1024;
    return 10 * 1024 * 1024 * 1024;
}

function createDriveStatsWithScale(histories, drive, color, analysis) {
    const latest = histories[histories.length - 1];
    if (!latest.storage_info || !latest.storage_info[drive]) {
        return '<p style="color: #666; text-align: center;">Data tidak tersedia</p>';
    }
    
    const info = latest.storage_info[drive];
    const percent = info.percentage || 0;
    
    // Hitung perubahan dari scan sebelumnya
    let changePercentage = 0;
    if (histories.length > 1) {
        const previous = histories[histories.length - 2];
        if (previous.storage_info && previous.storage_info[drive]) {
            const prevUsed = previous.storage_info[drive].used || 0;
            const currUsed = info.used || 0;
            changePercentage = ((currUsed - prevUsed) / prevUsed) * 100;
        }
    }
    
    // Hitung variasi data
    const dataPoints = analysis.data;
    const variation = calculateVariation(dataPoints);
    
    return `
        <div class="stat-item-mini">
            <div class="stat-label">Saat Ini</div>
            <div class="stat-value" style="color: ${color.main};">
                ${formatBytes(info.used)}
            </div>
            <div class="stat-change" style="color: ${changePercentage > 0 ? '#e74c3c' : changePercentage < 0 ? '#27ae60' : '#7f8c8d'}; font-size: 0.8rem;">
                ${changePercentage > 0 ? '📈' : changePercentage < 0 ? '📉' : '➡️'} ${Math.abs(changePercentage).toFixed(2)}%
            </div>
        </div>
        <div class="stat-item-mini">
            <div class="stat-label">Range Data</div>
            <div class="stat-value" style="font-size: 1rem;">
                ${formatBytes(analysis.min)} - ${formatBytes(analysis.max)}
            </div>
            <div class="stat-change" style="font-size: 0.8rem; color: #666;">
                Variasi: ${variation.toFixed(2)}%
            </div>
        </div>
        <div class="stat-item-mini">
            <div class="stat-label">% Terpakai</div>
            <div class="stat-value" style="color: ${percent > 80 ? '#e74c3c' : percent > 60 ? '#f39c12' : '#27ae60'}">
                ${percent.toFixed(1)}%
            </div>
            <div class="stat-change" style="font-size: 0.8rem;">
                ${percent > 80 ? '🟥 KRITIS' : percent > 60 ? '🟨 WASPADA' : '🟩 AMAN'}
            </div>
        </div>
        <div class="stat-item-mini">
            <div class="stat-label">Skala Grafik</div>
            <div class="stat-value" style="font-size: 1rem;">
                ${formatBytes(analysis.min)} - ${formatBytes(analysis.max)}
            </div>
            <div class="stat-change" style="font-size: 0.8rem; color: #666;">
                Auto-scaled ✓
            </div>
        </div>
    `;
}

function calculateVariation(dataPoints) {
    if (dataPoints.length < 2) return 0;
    
    const mean = dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length;
    const variance = dataPoints.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dataPoints.length;
    const stdDev = Math.sqrt(variance);
    
    return (stdDev / mean) * 100;
}

function toggleChartView(viewType) {
    // Update button active state
    document.querySelectorAll('.chart-controls .chart-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update semua chart dengan skala baru
    storageCharts.forEach(chart => {
        const data = chart.data.datasets[0].data;
        const minValue = Math.min(...data);
        const maxValue = Math.max(...data);
        const range = maxValue - minValue;
        
        switch(viewType) {
            case 'percentage':
                const percentageData = data.map(val => (val / maxValue) * 100);
                chart.data.datasets[0].data = percentageData;
                chart.options.scales.y.min = 0;
                chart.options.scales.y.max = 100;
                chart.options.scales.y.ticks.callback = function(value) {
                    return value.toFixed(0) + '%';
                };
                break;
                
            case 'log':
                chart.options.scales.y.type = 'logarithmic';
                chart.options.scales.y.min = Math.max(1, minValue * 0.9);
                chart.options.scales.y.max = maxValue * 1.1;
                chart.options.scales.y.ticks.callback = function(value) {
                    return formatBytes(value);
                };
                break;
                
            case 'linear':
            default:
                chart.options.scales.y.type = 'linear';
                chart.options.scales.y.min = Math.max(0, minValue - (range * 0.1));
                chart.options.scales.y.max = maxValue + (range * 0.1);
                chart.options.scales.y.ticks.callback = function(value) {
                    return formatBytes(value);
                };
                break;
        }
        
        chart.update();
    });
}

// ======================
// FUNGSI TAMPILAN HASIL
// ======================
function displayResult(data) {
    selectedForDelete = [];
    let html = `<h2>📊 Hasil Scan</h2>`;
    
    // Info scan
    html += `<div class="scan-info">`;
    html += `<p><strong>Waktu Scan:</strong> ${data.generated_at || 'Tidak tersedia'}</p>`;
    html += `<p><strong>Durasi:</strong> ${data.scan_time_sec || 0} detik</p>`;
    html += `<p><strong>File yang discan:</strong> ${data.files_scanned || 0}</p>`;
    
    if (data.scan_config) {
        const drives = data.scan_config.drives || [];
        if (drives.length > 0) {
            html += `<p><strong>Drive yang discan:</strong> ${drives.join(', ')}</p>`;
        }
    }
    html += `</div>`;
    
    // Info storage
    if (data.storage_info && Object.keys(data.storage_info).length > 0) {
        html += `<h3>💾 Ringkasan Penyimpanan</h3>`;
        html += `<div class="storage-summary">`;
        
        for (const [drive, info] of Object.entries(data.storage_info)) {
            const usedPercent = info.percentage || (info.used / info.total * 100);
            const driveClass = `drive-${drive.toLowerCase().replace(':', '')}`;
            
            html += `
                <div class="storage-card ${driveClass}">
                    <h4>Drive ${drive}</h4>
                    <p><strong>Terpakai:</strong> ${formatBytes(info.used)}</p>
                    <p><strong>Kosong:</strong> ${formatBytes(info.free)}</p>
                    <p><strong>Total:</strong> ${formatBytes(info.total)}</p>
                    <div class="usage-bar">
                        <div class="usage-fill" style="width: ${Math.min(usedPercent, 100)}%; 
                             background: ${usedPercent > 80 ? '#e74c3c' : (usedPercent > 60 ? '#f39c12' : '#2ecc71')};">
                        </div>
                    </div>
                    <p>${usedPercent.toFixed(1)}% terpakai</p>
                </div>
            `;
        }
        html += `</div>`;
    }
    
    // File besar
    html += `<h3>📦 File Besar (> ${data.scan_config?.scan_options?.large_files_threshold_mb || 100}MB)</h3>`;
    
    if (data.large_files && data.large_files.length > 0) {
        html += `<p><strong>Total:</strong> ${data.large_files.length} file</p>`;
        html += `<div class="file-list">`;
        
        data.large_files.forEach((f, index) => {
            const drive = f.drive || f.path.substring(0, 2);
            html += `
                <label class="file-item">
                    <input type="checkbox" value="${f.path}" onclick="toggleFile(this)">
                    <strong>[${drive}]</strong> ${f.path}<br>
                    <span class="file-size">${formatBytes(f.size)}</span>
                </label>
            `;
        });
        html += `</div>`;
    } else {
        html += `<p class="no-data">Tidak ditemukan file besar.</p>`;
    }
    
    // File duplikat
    if (data.duplicate_files && data.duplicate_files.duplicate_groups) {
        html += displayDuplicateFiles(data.duplicate_files);
    }
    
    // File sampah
    let totalJunk = 0;
    let totalJunkCount = 0;
    for (let cat in data.junk_files) {
        data.junk_files[cat].forEach(f => {
            totalJunk += f.size;
            totalJunkCount++;
        });
    }
    
    html += `<h3>🗑️ File Sampah — Total: ${formatBytes(totalJunk)} (${totalJunkCount} file)</h3>`;
    
    if (totalJunkCount > 0) {
        html += `<label class="select-all">
            <input type="checkbox" id="selectAllJunk" onclick="toggleAllJunk(this)"> 
            <strong>Pilih Semua File Sampah</strong>
        </label>`;
        
        for (let cat in data.junk_files) {
            if (data.junk_files[cat].length === 0) continue;
            
            let catTotal = 0;
            data.junk_files[cat].forEach(f => catTotal += f.size);
            
            html += `
                <button class="collapsible">${cat.toUpperCase()} — ${formatBytes(catTotal)} (${data.junk_files[cat].length} file)</button>
                <div class="content">
                    <label class="select-category">
                        <input type="checkbox" class="catCheckbox" data-cat="${cat}" onclick="toggleCategory(this,'${cat}')">
                        <strong>Pilih semua ${cat.toUpperCase()} (${data.junk_files[cat].length} file)</strong>
                    </label>
            `;
            
            data.junk_files[cat].forEach(f => {
                const drive = f.drive || f.path.substring(0, 2);
                html += `
                    <label class="file-item">
                        <input type="checkbox" value="${f.path}" class="fileCheckbox" data-cat="${cat}" onclick="toggleFile(this)">
                        [${drive}] ${f.path}<br>
                        <span class="file-size">${formatBytes(f.size)}</span>
                    </label>
                `;
            });
            
            html += `</div>`;
        }
    } else {
        html += `<p class="no-data">Tidak ditemukan file sampah.</p>`;
    }
    
    // Ringkasan
    html += `<div class="summary">`;
    html += `<h4>📈 Ringkasan:</h4>`;
    html += `<p>Total penyimpanan yang discan: ${formatBytes(data.total_size || 0)}</p>`;
    html += `<p>File besar ditemukan: ${data.large_files?.length || 0}</p>`;
    html += `<p>File sampah ditemukan: ${totalJunkCount}</p>`;
    if (data.duplicate_files?.total_groups) {
        html += `<p>Grup duplikat: ${data.duplicate_files.total_groups}</p>`;
        html += `<p>Ruang yang bisa dihemat dari duplikat: ${formatBytes(data.duplicate_files.total_wasted_space)}</p>`;
    }
    html += `<p>File yang dipilih untuk penghapusan: <span id="selectedCount">0</span></p>`;
    html += `</div>`;
    
    document.getElementById("result").innerHTML = html;
    document.getElementById("cleanBtn").style.display = "block";
    
    // Setup collapsible sections
    const coll = document.getElementsByClassName("collapsible");
    for (let i = 0; i < coll.length; i++) {
        coll[i].addEventListener("click", function() {
            this.classList.toggle("active");
            const content = this.nextElementSibling;
            content.style.display = content.style.display === "block" ? "none" : "block";
        });
    }
    
    updateSelectedCount();
    
    // Tampilkan grafik - MENGGUNAKAN FUNGSI BARU
    setTimeout(() => {
        drawStorageCharts(data); // ⬅️ INI FUNGSI GRAFIK BARU
        calculateDSDT(data);
    }, 100);
}

function displayDuplicateFiles(duplicateData) {
    if (!duplicateData || duplicateData.duplicate_groups.length === 0) {
        return '<p class="no-data">Tidak ditemukan file duplikat.</p>';
    }
    
    let html = `
        <div class="duplicate-header">
            <h3>📁 File Duplikat Ditemukan</h3>
            <div class="duplicate-stats">
                <div class="stat-card">
                    <div class="stat-value">${duplicateData.total_groups}</div>
                    <div>Grup Duplikat</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${duplicateData.total_duplicate_files}</div>
                    <div>File Duplikat</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatBytes(duplicateData.total_wasted_space)}</div>
                    <div>Ruang Terbuang</div>
                </div>
            </div>
            <div class="duplicate-actions">
                <button class="btn" onclick="selectAllDuplicates()">Pilih Semua Duplikat</button>
                <button class="btn" onclick="smartSelectDuplicates()">Pilih Cerdas (Simpan Terbaru)</button>
                <button class="btn" onclick="selectLargestDuplicates()">Pilih File Terbesar</button>
            </div>
        </div>
    `;
    
    duplicateData.duplicate_groups.forEach((group, groupIndex) => {
        html += `
            <div class="duplicate-group">
                <div class="group-header">
                    <h4>Grup ${groupIndex + 1} - ${group.count} duplikat (${formatBytes(group.wasted_space)} terbuang)</h4>
                    <button class="btn" onclick="selectDuplicateGroup(${groupIndex})">Pilih Semua dalam Grup</button>
                </div>
                <div class="hash-display">Hash: ${group.hash.substring(0, 16)}...</div>
        `;
        
        group.files.sort((a, b) => new Date(b.modified_str) - new Date(a.modified_str));
        
        group.files.forEach((file, fileIndex) => {
            const isNewest = fileIndex === 0;
            html += `
                <div class="duplicate-file ${isNewest ? 'keep-file' : 'delete-file'}">
                    <label>
                        <input type="checkbox" value="${file.path}" 
                               ${isNewest ? 'disabled' : 'checked'} 
                               class="duplicate-checkbox" 
                               data-group="${groupIndex}"
                               data-size="${file.size}"
                               data-modified="${file.modified}"
                               onclick="toggleFile(this)">
                        <span class="file-path">${file.path}</span>
                        <span class="file-info">
                            ${formatBytes(file.size)} | Dimodifikasi: ${file.modified_str}
                            ${isNewest ? ' <span class="keep-badge">(SIMPAN - Terbaru)</span>' : ' <span class="delete-badge">(HAPUS)</span>'}
                        </span>
                    </label>
                </div>
            `;
        });
        
        html += `</div>`;
    });
    
    return html;
}

// ======================
// FUNGSI SELEKSI DUPLIKAT
// ======================
function selectAllDuplicates() {
    const checkboxes = document.querySelectorAll('.duplicate-checkbox:not(:disabled)');
    checkboxes.forEach(cb => {
        cb.checked = true;
        toggleFile(cb);
    });
    updateSelectedCount();
    showNotification(`Memilih ${checkboxes.length} file duplikat untuk penghapusan`);
}

function smartSelectDuplicates() {
    const groups = {};
    
    document.querySelectorAll('.duplicate-checkbox').forEach(cb => {
        const group = cb.dataset.group;
        if (!groups[group]) groups[group] = [];
        groups[group].push(cb);
    });
    
    Object.values(groups).forEach(groupCheckboxes => {
        groupCheckboxes.sort((a, b) => {
            return new Date(b.dataset.modified) - new Date(a.dataset.modified);
        });
        
        groupCheckboxes.forEach(cb => {
            cb.checked = false;
            toggleFile(cb);
        });
        
        groupCheckboxes.slice(1).forEach(cb => {
            if (!cb.disabled) {
                cb.checked = true;
                toggleFile(cb);
            }
        });
    });
    
    updateSelectedCount();
    showNotification("Seleksi cerdas selesai: Menyimpan file terbaru di setiap grup");
}

function selectLargestDuplicates() {
    const groups = {};
    
    document.querySelectorAll('.duplicate-checkbox').forEach(cb => {
        const group = cb.dataset.group;
        if (!groups[group]) groups[group] = [];
        groups[group].push(cb);
    });
    
    Object.values(groups).forEach(groupCheckboxes => {
        groupCheckboxes.sort((a, b) => {
            return parseInt(b.dataset.size) - parseInt(a.dataset.size);
        });
        
        groupCheckboxes.forEach(cb => {
            cb.checked = false;
            toggleFile(cb);
        });
        
        groupCheckboxes.slice(1).forEach(cb => {
            if (!cb.disabled) {
                cb.checked = true;
                toggleFile(cb);
            }
        });
    });
    
    updateSelectedCount();
    showNotification("Seleksi selesai: Menyimpan file terbesar di setiap grup");
}

function selectDuplicateGroup(groupIndex) {
    const checkboxes = document.querySelectorAll(`.duplicate-checkbox[data-group="${groupIndex}"]:not(:disabled)`);
    checkboxes.forEach(cb => {
        cb.checked = true;
        toggleFile(cb);
    });
    updateSelectedCount();
    showNotification(`Memilih ${checkboxes.length} file dalam grup ${parseInt(groupIndex) + 1}`);
}

// ======================
// FUNGSI SELEKSI FILE
// ======================
function toggleFile(checkbox) {
    if (checkbox.checked) {
        if (!selectedForDelete.includes(checkbox.value)) {
            selectedForDelete.push(checkbox.value);
        }
    } else {
        selectedForDelete = selectedForDelete.filter(x => x !== checkbox.value);
    }
    updateSelectedCount();
}

function toggleCategory(catCheckbox, cat) {
    const checkboxes = document.querySelectorAll(`.fileCheckbox[data-cat='${cat}']`);
    checkboxes.forEach(cb => {
        cb.checked = catCheckbox.checked;
        toggleFile(cb);
    });
}

function toggleAllJunk(masterCheckbox) {
    const allCatBoxes = document.querySelectorAll(".catCheckbox");
    allCatBoxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        toggleCategory(cb, cb.dataset.cat);
    });
}

function updateSelectedCount() {
    const countElement = document.getElementById("selectedCount");
    if (countElement) {
        countElement.textContent = selectedForDelete.length;
        countElement.style.color = selectedForDelete.length > 0 ? "#e74c3c" : "#333";
    }
}

// ======================
// FUNGSI CLEANER
// ======================
function generateDeleteJSON() {
    if (selectedForDelete.length === 0) {
        alert("Pilih minimal satu file untuk dihapus!");
        return false;
    }
    
    // Konfirmasi sebelum membuat file delete
    const confirmDelete = confirm(`Anda akan menghapus ${selectedForDelete.length} file.\n\nPastikan Anda sudah:\n✅ Backup data penting\n✅ Tidak memilih file system\n✅ Hanya memilih file sampah/duplikat\n\nLanjutkan?`);
    
    if (!confirmDelete) {
        return false;
    }
    
    const blob = new Blob([JSON.stringify(selectedForDelete, null, 4)], {type: "application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "delete_request.json";
    link.click();
    
    // Tampilkan petunjuk selanjutnya
    setTimeout(() => {
        alert("delete_request.json telah dibuat!\n\n📋 LANGKAH SELANJUTNYA:\n1. Download cleaner.exe (jika belum)\n2. Taruh cleaner.exe dan delete_request.json di folder yang sama\n3. Backup data penting\n4. Jalankan cleaner.exe untuk menghapus file");
    }, 500);
    
    return true;
}

function runCleaner() {
    if (!generateDeleteJSON()) {
        return;
    }
    
    // Tampilkan modal dengan instruksi lengkap
    const cleanerModal = document.createElement('div');
    cleanerModal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 30px;
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 500px;
        width: 90%;
    `;
    
    cleanerModal.innerHTML = `
        <h3 style="color: #e74c3c; margin-bottom: 20px;">⚠️ PERINGATAN KEAMANAN</h3>
        <p><strong>delete_request.json telah dibuat!</strong></p>
        
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h4>📋 Langkah selanjutnya:</h4>
            <ol style="text-align: left; margin-left: 20px;">
                <li><button onclick="downloadCleaner()" style="background: #667eea; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;">Download cleaner.exe</button> (jika belum)</li>
                <li>Taruh <strong>cleaner.exe</strong> dan <strong>delete_request.json</strong> di folder yang sama</li>
                <li><strong style="color: #e74c3c;">BACKUP DATA PENTING</strong> sebelum melanjutkan</li>
                <li>Jalankan <strong>cleaner.exe</strong> (double-click)</li>
                <li>Ikuti instruksi di Command Prompt</li>
            </ol>
        </div>
        
        <div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin: 15px 0; color: #721c24;">
            <h4><i class="fas fa-exclamation-triangle"></i> PERINGATAN:</h4>
            <p>• Cleaner akan menghapus file PERMANEN</p>
            <p>• Tidak bisa di-undo (kecuali dari backup)</p>
            <p>• Pastikan tidak memilih file system/program</p>
        </div>
        
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
            <button onclick="this.parentElement.parentElement.remove()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">
                Tutup
            </button>
            <button onclick="downloadCleaner(); this.parentElement.parentElement.remove()" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                Download Cleaner.exe
            </button>
        </div>
    `;
    
    document.body.appendChild(cleanerModal);
}

// ======================
// FUNGSI UTILITY
// ======================
function showNotification(message) {
    const notification = document.createElement("div");
    notification.className = "notification";
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    if (bytes < 0) return "-" + formatBytes(-bytes);
    
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return bytes.toFixed(2) + " " + units[i];
}

function formatTime(seconds) {
    if (seconds < 60) {
        return seconds + " detik";
    } else if (seconds < 3600) {
        return (seconds / 60).toFixed(1) + " menit";
    } else if (seconds < 86400) {
        return (seconds / 3600).toFixed(1) + " jam";
    } else {
        return (seconds / 86400).toFixed(1) + " hari";
    }
}

// ======================
// FUNGSI CHART LAMA (Backup)
// ======================
function drawChart(data) {
    const ctx = document.getElementById("lineChart");
    if (!ctx) return;
    
    if (!data.storage_history || data.storage_history.length < 2) {
        ctx.style.display = "none";
        return;
    }
    
    ctx.style.display = "block";
    
    const labels = data.storage_history.map(h => 
        new Date(h.time * 1000).toLocaleDateString() + ' ' + 
        new Date(h.time * 1000).toLocaleTimeString()
    );
    
    const values = data.storage_history.map(h => {
        if (h.storage_info) {
            return Object.values(h.storage_info).reduce((sum, info) => sum + (info.used || 0), 0);
        }
        return h.used_storage || 0;
    });
    
    if (window.lineChart) {
        window.lineChart.destroy();
    }
    
    window.lineChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Penyimpanan Terpakai",
                data: values,
                borderColor: "#3498db",
                backgroundColor: "rgba(52, 152, 219, 0.1)",
                borderWidth: 2,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Terpakai: ${formatBytes(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: function(value) {
                            return formatBytes(value);
                        }
                    }
                }
            }
        }
    });
}

function calculateDSDT(data) {
    const hist = data.storage_history;
    if (!hist || hist.length < 2) {
        document.getElementById("dsdtBox").innerHTML = "";
        return;
    }
    
    const s2 = hist[hist.length - 1].total_size || 0;
    const s1 = hist[hist.length - 2].total_size || 0;
    const t2 = hist[hist.length - 1].time;
    const t1 = hist[hist.length - 2].time;
    
    const ds = s2 - s1;
    const dt = t2 - t1;
    
    if (dt === 0) {
        document.getElementById("dsdtBox").innerHTML = `<h3>Perhitungan ds/dt</h3><p>Tidak ada perbedaan waktu antara scan.</p>`;
        return;
    }
    
    const dsdt = ds / dt;
    
    let html = `<div class="dsdt-box">`;
    html += `<h3>📈 Analisis Pertumbuhan Penyimpanan</h3>`;
    html += `<p><strong>Perubahan penyimpanan (ds):</strong> ${formatBytes(ds)}</p>`;
    html += `<p><strong>Perubahan waktu (dt):</strong> ${formatTime(dt)}</p>`;
    html += `<p><strong>Laju pertumbuhan (ds/dt):</strong> ${formatBytes(dsdt)}/detik</p>`;
    
    if (dsdt > 5 * 1024 * 1024) {
        html += `<p class="warning-high">⚠️ PERTUMBUHAN TINGGI! Penyimpanan meningkat cepat.</p>`;
    } else if (dsdt > 1 * 1024 * 1024) {
        html += `<p class="warning-medium">⚠️ Pertumbuhan sedang. Pantau penggunaan penyimpanan.</p>`;
    } else if (dsdt < 0) {
        html += `<p class="success">✓ Penyimpanan berkurang. Pembersihan berhasil!</p>`;
    } else {
        html += `<p class="success">✓ Laju pertumbuhan normal.</p>`;
    }
    
    // Prediksi kapan storage penuh
    if (hist.length >= 2) {
        const latest = hist[hist.length - 1];
        if (latest.storage_info) {
            let totalFree = 0;
            let totalUsed = 0;
            Object.values(latest.storage_info).forEach(info => {
                totalFree += info.free;
                totalUsed += info.used;
            });
            
            if (dsdt > 0 && totalFree > 0) {
                const timeToFull = totalFree / dsdt; // detik
                html += `<p><strong>⏳ Prediksi:</strong> Storage akan penuh dalam ${formatTime(timeToFull)}</p>`;
            }
        }
    }
    
    html += `</div>`;
    document.getElementById("dsdtBox").innerHTML = html;
}

// ======================
// INISIALISASI
// ======================
document.addEventListener("DOMContentLoaded", function() {
    console.log("My Storage Scanner v2.0 berhasil dimuat");
    console.log("Download path: downloads/scanner.exe, downloads/cleaner.exe");
    
    // Cek ketersediaan file saat load
    setTimeout(() => {
        const checkFiles = new XMLHttpRequest();
        checkFiles.open('HEAD', 'downloads/scanner.exe', true);
        checkFiles.onreadystatechange = function() {
            if (checkFiles.readyState === 4) {
                if (checkFiles.status === 200) {
                    console.log("✅ scanner.exe tersedia di downloads/");
                } else {
                    console.warn("⚠️ scanner.exe belum tersedia di downloads/");
                }
            }
        };
        checkFiles.send();
    }, 1000);
});