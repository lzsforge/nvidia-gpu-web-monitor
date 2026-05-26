let authKey = '';
let pollInterval = null;

// Initialize app
function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlKey = urlParams.get('key');
    
    if (urlKey) {
        localStorage.setItem('authKey', urlKey);
        // Clear URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    authKey = localStorage.getItem('authKey');
    
    if (authKey) {
        showDashboard();
    } else {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('login-modal').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
    if (pollInterval) clearInterval(pollInterval);
}

function showDashboard() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    fetchStatus();
    pollInterval = setInterval(fetchStatus, 2000);
}

function saveAuthKey() {
    const input = document.getElementById('auth-key-input').value.trim();
    if (input) {
        authKey = input;
        localStorage.setItem('authKey', authKey);
        showDashboard();
    }
}

function logout() {
    localStorage.removeItem('authKey');
    authKey = '';
    showLogin();
}

function showError(msg) {
    const errorDiv = document.getElementById('error-message');
    if (msg) {
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
    } else {
        errorDiv.style.display = 'none';
    }
}

async function apiRequest(endpoint, options = {}) {
    const headers = {
        'x-auth-key': authKey,
        ...options.headers
    };
    
    try {
        const response = await fetch(endpoint, { ...options, headers });
        if (response.status === 401) {
            logout();
            throw new Error("Auth Key 无效，请重新登录");
        }
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || data.error || `请求失败 (${response.status})`);
        }
        return data;
    } catch (error) {
        showError(error.message);
        throw error;
    }
}

async function fetchStatus() {
    try {
        const data = await apiRequest('/api/status');
        if (data.error) {
            showError(data.error);
            return;
        }
        renderGPUs(data.gpus);
        if (data.cpu) renderCPU(data.cpu);
    } catch (e) {
        // Error already handled in apiRequest
    }
}

function renderGPUs(gpus) {
    const container = document.getElementById('gpu-container');
    
    if (!gpus || gpus.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #777;">未检测到 GPU</p>';
        return;
    }

    gpus.forEach(gpu => {
        let card = document.getElementById(`gpu-card-${gpu.id}`);
        if (!card) {
            card = document.createElement('div');
            card.id = `gpu-card-${gpu.id}`;
            card.className = 'gpu-card';
            container.appendChild(card);
            
            // Build initial structure
            card.innerHTML = `
                <div class="gpu-header">
                    <h3>GPU ${gpu.id}: ${gpu.name}</h3>
                </div>
                
                <div class="gpu-stat">
                    <span class="label">温度</span>
                    <span class="value" id="temp-${gpu.id}">N/A</span>
                </div>
                
                <div class="gpu-stat">
                    <span class="label">利用率 (GPU)</span>
                    <span class="value" id="util-gpu-${gpu.id}">N/A</span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" id="bar-util-${gpu.id}" style="width: 0%"></div></div>
                
                <div class="gpu-stat">
                    <span class="label">显存占用</span>
                    <span class="value" id="mem-${gpu.id}">N/A</span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" id="bar-mem-${gpu.id}" style="width: 0%"></div></div>
                
                <div class="gpu-stat">
                    <span class="label">功耗</span>
                    <span class="value" id="power-${gpu.id}">N/A</span>
                </div>
                
                <div class="gpu-stat">
                    <span class="label">频率 (核心/显存)</span>
                    <span class="value" id="clock-${gpu.id}">N/A</span>
                </div>
                
                <div class="gpu-stat">
                    <span class="label">当前风扇转速</span>
                    <span class="value" id="fan-speed-${gpu.id}">N/A</span>
                </div>
                
                <div class="fan-control">
                    <h4>风扇控制 (手动)</h4>
                    <div class="fan-slider-container">
                        <input type="range" id="fan-slider-${gpu.id}" min="20" max="100" value="50" oninput="document.getElementById('fan-slider-val-${gpu.id}').textContent = this.value + '%'">
                        <span id="fan-slider-val-${gpu.id}">50%</span>
                    </div>
                    <div class="btn-group">
                        <button class="btn-set" onclick="setFanSpeed(${gpu.id})">应用转速</button>
                        <button class="btn-auto" onclick="setAutoFan(${gpu.id})">恢复自动</button>
                    </div>
                </div>
            `;
        }
        
        // Update values
        document.getElementById(`temp-${gpu.id}`).textContent = gpu.temperature !== 'N/A' ? `${gpu.temperature} °C` : 'N/A';
        
        document.getElementById(`util-gpu-${gpu.id}`).textContent = gpu.utilization_gpu !== 'N/A' ? `${gpu.utilization_gpu} %` : 'N/A';
        document.getElementById(`bar-util-${gpu.id}`).style.width = gpu.utilization_gpu !== 'N/A' ? `${gpu.utilization_gpu}%` : '0%';
        
        if (gpu.memory_used !== 'N/A' && gpu.memory_total !== 'N/A') {
            const usedMB = (gpu.memory_used / 1024 / 1024).toFixed(0);
            const totalMB = (gpu.memory_total / 1024 / 1024).toFixed(0);
            const memPercent = ((gpu.memory_used / gpu.memory_total) * 100).toFixed(1);
            document.getElementById(`mem-${gpu.id}`).textContent = `${usedMB} MB / ${totalMB} MB (${memPercent}%)`;
            document.getElementById(`bar-mem-${gpu.id}`).style.width = `${memPercent}%`;
        } else {
            document.getElementById(`mem-${gpu.id}`).textContent = 'N/A';
            document.getElementById(`bar-mem-${gpu.id}`).style.width = '0%';
        }
        
        if (gpu.power_usage !== 'N/A' && gpu.power_limit !== 'N/A') {
            document.getElementById(`power-${gpu.id}`).textContent = `${gpu.power_usage.toFixed(1)} W / ${gpu.power_limit.toFixed(1)} W`;
        } else {
            document.getElementById(`power-${gpu.id}`).textContent = 'N/A';
        }
        
        if (gpu.clock_graphics !== 'N/A' && gpu.clock_memory !== 'N/A') {
            document.getElementById(`clock-${gpu.id}`).textContent = `${gpu.clock_graphics} MHz / ${gpu.clock_memory} MHz`;
        } else {
            document.getElementById(`clock-${gpu.id}`).textContent = 'N/A';
        }
        
        document.getElementById(`fan-speed-${gpu.id}`).textContent = gpu.fan_speed !== 'N/A' ? `${gpu.fan_speed} %` : 'N/A';
    });
}

async function setFanSpeed(gpuId) {
    const speed = parseInt(document.getElementById(`fan-slider-${gpuId}`).value, 10);
    
    try {
        const res = await apiRequest('/api/fan_speed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gpu_id: gpuId, speed_percent: speed })
        });
        alert(res.message || "设置成功");
        fetchStatus(); // immediate update
    } catch (e) {
        // error shown in UI by apiRequest
    }
}

async function setAutoFan(gpuId) {
    try {
        const res = await apiRequest('/api/fan_auto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gpu_id: gpuId })
        });
        alert(res.message || "恢复自动成功");
        fetchStatus();
    } catch (e) {
        // error shown in UI
    }
}

function renderCPU(cpu) {
    const container = document.getElementById('cpu-container');
    if (!cpu || cpu.error) return;

    let card = document.getElementById('cpu-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'cpu-card';
        card.className = 'gpu-card';
        container.appendChild(card);
        
        // Static structure
        card.innerHTML = `
            <div class="gpu-header">
                <h3>系统 & CPU监控 
                    <span id="cpu-core-info" style="font-size:12px; color:#777; font-weight:normal; margin-left:10px;"></span>
                </h3>
            </div>
            
            <div class="gpu-stat">
                <span class="label">总体温度</span>
                <span class="value" id="cpu-total-temp">N/A</span>
            </div>
            
            <div class="gpu-stat">
                <span class="label">总体利用率</span>
                <span class="value" id="cpu-total-util">N/A</span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" id="cpu-util-bar" style="width: 0%"></div></div>
            
            <div class="gpu-stat">
                <span class="label">内存占用</span>
                <span class="value" id="cpu-mem-text">N/A</span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" id="cpu-mem-bar" style="width: 0%"></div></div>
            
            <div id="cpu-freq-container"></div>
            <div id="cpu-temp-container"></div>
            <div id="cpu-fan-container"></div>
            
            <div class="fan-control">
                <h4>CPU 风扇控制 (PWM)</h4>
                <div class="gpu-stat" style="margin-bottom: 10px;">
                    <span class="label">选择控制设备</span>
                    <select id="cpu-pwm-select" onchange="saveCPUPWM()" style="max-width: 180px; padding: 4px;"></select>
                </div>
                <div class="fan-slider-container">
                    <input type="range" id="cpu-fan-slider" min="20" max="100" value="50" oninput="document.getElementById('cpu-fan-slider-val').textContent = this.value + '%'">
                    <span id="cpu-fan-slider-val">50%</span>
                </div>
                <div class="btn-group">
                    <button class="btn-set" onclick="setCPUFanSpeed()">应用转速</button>
                    <button class="btn-auto" onclick="setAutoCPUFan()">恢复自动</button>
                </div>
            </div>
        `;

        // Populate dropdown only once
        const select = document.getElementById('cpu-pwm-select');
        if (select && cpu.pwm_controllers) {
            if (cpu.pwm_controllers.length === 0) {
                select.add(new Option('--- 未检测到可控风扇 ---', ''));
                select.disabled = true;
                document.getElementById('cpu-fan-slider').disabled = true;
                document.querySelector('#cpu-card .btn-set').disabled = true;
                document.querySelector('#cpu-card .btn-auto').disabled = true;
            } else {
                select.add(new Option('--- 未选择 ---', ''));
                cpu.pwm_controllers.forEach(pwm => {
                    select.add(new Option(pwm.label, pwm.path));
                });
                // load saved
                const savedPWM = localStorage.getItem('cpu_pwm_path');
                if (savedPWM) select.value = savedPWM;
            }
        }
    }
    
    // Update dynamic fields
    document.getElementById('cpu-core-info').textContent = cpu.cores_physical ? `${cpu.cores_physical} 核 ${cpu.cores_logical} 线程` : '';
    document.getElementById('cpu-total-temp').textContent = cpu.temperature !== 'N/A' ? `${cpu.temperature} °C` : 'N/A';
    document.getElementById('cpu-total-util').textContent = cpu.utilization !== undefined ? `${cpu.utilization} %` : 'N/A';
    document.getElementById('cpu-util-bar').style.width = cpu.utilization !== undefined ? `${cpu.utilization}%` : '0%';
    
    if (cpu.memory_used && cpu.memory_total) {
        const usedGB = (cpu.memory_used / 1024 / 1024 / 1024).toFixed(1);
        const totalGB = (cpu.memory_total / 1024 / 1024 / 1024).toFixed(1);
        const memPercent = ((cpu.memory_used / cpu.memory_total) * 100).toFixed(1);
        document.getElementById('cpu-mem-text').textContent = `${usedGB} GB / ${totalGB} GB (${memPercent}%)`;
        document.getElementById('cpu-mem-bar').style.width = `${memPercent}%`;
    }

    // Build Frequencies Grid
    let freqHtml = '';
    if (cpu.frequencies && cpu.frequencies.length > 0) {
        freqHtml = `<div class="section-title">CPU 频率</div><div class="info-grid">`;
        cpu.frequencies.forEach((f, idx) => {
            let lbl = cpu.frequencies.length === 1 ? '核心频率' : `核心 ${idx}`;
            freqHtml += `
                <div class="info-chip">
                    <span class="chip-label">${lbl}</span>
                    <span class="chip-value">${f.current} MHz</span>
                </div>`;
        });
        freqHtml += `</div>`;
    }
    document.getElementById('cpu-freq-container').innerHTML = freqHtml;

    // Build Core Temps Grid
    let tempHtml = '';
    if (cpu.core_temperatures && cpu.core_temperatures.length > 0) {
        tempHtml = `<div class="section-title">传感器温度</div><div class="info-grid">`;
        cpu.core_temperatures.forEach(t => {
            tempHtml += `
                <div class="info-chip">
                    <span class="chip-label">${t.label}</span>
                    <span class="chip-value">${t.current} °C</span>
                </div>`;
        });
        tempHtml += `</div>`;
    }
    document.getElementById('cpu-temp-container').innerHTML = tempHtml;

    // Build Fan RPMs Grid
    let fanHtml = '';
    if (cpu.fans_rpm && cpu.fans_rpm.length > 0) {
        fanHtml = `<div class="section-title">风扇当前转速</div><div class="info-grid">`;
        cpu.fans_rpm.forEach(f => {
            fanHtml += `
                <div class="info-chip">
                    <span class="chip-label">${f.label}</span>
                    <span class="chip-value">${f.rpm} RPM</span>
                </div>`;
        });
        fanHtml += `</div>`;
    }
    document.getElementById('cpu-fan-container').innerHTML = fanHtml;
}

function saveCPUPWM() {
    const select = document.getElementById('cpu-pwm-select');
    if (select) {
        localStorage.setItem('cpu_pwm_path', select.value);
    }
}

async function setCPUFanSpeed() {
    const pwmPath = document.getElementById('cpu-pwm-select').value;
    if (!pwmPath) return alert('请先选择风扇(PWM)设备');
    const speed = parseInt(document.getElementById('cpu-fan-slider').value, 10);
    try {
        const res = await apiRequest('/api/cpu/fan_speed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pwm_path: pwmPath, speed_percent: speed })
        });
        alert(res.message || "设置成功");
    } catch (e) {}
}

async function setAutoCPUFan() {
    const pwmPath = document.getElementById('cpu-pwm-select').value;
    if (!pwmPath) return alert('请先选择风扇(PWM)设备');
    try {
        const res = await apiRequest('/api/cpu/fan_auto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pwm_path: pwmPath })
        });
        alert(res.message || "恢复自动成功");
    } catch (e) {}
}

// Start
init();
