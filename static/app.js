let authKey = '';
let pollInterval = null;

// Theme switcher management
function setTheme(theme) {
    const htmlEl = document.documentElement;
    
    // De-activate all theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
    
    // Save to local storage
    localStorage.setItem('theme_preference', theme);
    
    // Update button active state
    const activeBtn = document.getElementById(`theme-btn-${theme}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        htmlEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
        htmlEl.setAttribute('data-theme', theme);
    }
}

// Watch system preference change in real-time
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    const currentTheme = localStorage.getItem('theme_preference') || 'system';
    if (currentTheme === 'system') {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
});

// Custom Toast notification system
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconName = type === 'success' ? 'check-circle' : 'alert-circle';
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span class="toast-text">${message}</span>
        <button class="toast-close" onclick="const p = this.parentElement; p.classList.add('toast-fade-out'); setTimeout(() => p.remove(), 300);">&times;</button>
    `;
    container.appendChild(toast);
    
    // Instantly compile icons in the toast
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
    // Automatically remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('toast-fade-out');
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// Initialize app
function init() {
    // Apply saved theme before rendering to prevent screen flash
    const savedTheme = localStorage.getItem('theme_preference') || 'system';
    setTheme(savedTheme);

    const urlParams = new URLSearchParams(window.location.search);
    const urlKey = urlParams.get('key');
    
    if (urlKey) {
        localStorage.setItem('authKey', urlKey);
        // Clear URL key param
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    authKey = localStorage.getItem('authKey');
    
    // Render initial static page icons (login modal elements)
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
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
    
    // Refresh icons inside login container
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function showDashboard() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    
    // Refresh icons in dashboard shell
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
    fetchStatus();
    pollInterval = setInterval(fetchStatus, 2000);
}

function saveAuthKey() {
    const input = document.getElementById('auth-key-input').value.trim();
    if (input) {
        authKey = input;
        localStorage.setItem('authKey', authKey);
        showDashboard();
        showToast("登录成功", 'success');
    } else {
        showToast("请输入有效的 Auth Key", 'error');
    }
}

function logout() {
    localStorage.removeItem('authKey');
    authKey = '';
    showLogin();
    showToast("已安全注销登录", 'success');
}

function showError(msg) {
    const errorDiv = document.getElementById('error-message');
    if (!errorDiv) return;
    
    if (msg) {
        const textSpan = errorDiv.querySelector('.error-text');
        if (textSpan) textSpan.textContent = msg;
        errorDiv.style.display = 'flex';
        
        // Render error icon
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
        // Show non-blocking sliding notification
        showToast(msg, 'error');
        
        setTimeout(() => { 
            errorDiv.style.display = 'none'; 
        }, 6000);
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
        // Error is handled inside apiRequest & showError
    }
}

function renderGPUs(gpus) {
    const container = document.getElementById('gpu-container');
    if (!container) return;
    
    if (!gpus || gpus.length === 0) {
        container.innerHTML = `
            <div class="glass-card" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">
                <i data-lucide="alert-circle" style="width: 32px; height: 32px; color: var(--text-muted); margin-bottom: 12px; display: inline-block;"></i>
                <p>未检测到 NVIDIA GPU 设备</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    gpus.forEach(gpu => {
        let card = document.getElementById(`gpu-card-${gpu.id}`);
        if (!card) {
            card = document.createElement('div');
            card.id = `gpu-card-${gpu.id}`;
            card.className = 'gpu-card';
            container.appendChild(card);
            
            // Build modern premium card structure
            card.innerHTML = `
                <div class="gpu-header">
                    <h3>
                        <i data-lucide="cpu"></i>
                        <span>GPU ${gpu.id}: ${gpu.name}</span>
                    </h3>
                    <span class="header-status-badge">
                        <span class="status-dot"></span>
                        <span>运行中</span>
                    </span>
                </div>
                
                <div class="gpu-stat">
                    <span class="label"><i data-lucide="thermometer"></i>温度</span>
                    <span class="value" id="temp-${gpu.id}">N/A</span>
                </div>
                
                <div class="gpu-stat">
                    <span class="label"><i data-lucide="activity"></i>利用率 (GPU)</span>
                    <span class="value" id="util-gpu-${gpu.id}">N/A</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" id="bar-util-${gpu.id}" style="width: 0%"></div>
                </div>
                
                <div class="gpu-stat">
                    <span class="label"><i data-lucide="database"></i>显存占用</span>
                    <span class="value" id="mem-${gpu.id}">N/A</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" id="bar-mem-${gpu.id}" style="width: 0%"></div>
                </div>
                
                <div class="gpu-stat">
                    <span class="label"><i data-lucide="zap"></i>功耗</span>
                    <span class="value" id="power-${gpu.id}">N/A</span>
                </div>
                
                <div class="gpu-stat">
                    <span class="label"><i data-lucide="gauge"></i>频率 (核心/显存)</span>
                    <span class="value" id="clock-${gpu.id}">N/A</span>
                </div>
                
                <div class="gpu-stat">
                    <span class="label"><i data-lucide="fan" class="spinning-fan"></i>当前风扇转速</span>
                    <span class="value" id="fan-speed-${gpu.id}">N/A</span>
                </div>
                
                <div class="fan-control">
                    <h4><i data-lucide="sliders"></i>风扇控制 (手动)</h4>
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
            
            // Render newly appended icons
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
        
        // Update GPU dynamic stats
        const tempVal = document.getElementById(`temp-${gpu.id}`);
        if (tempVal) tempVal.textContent = gpu.temperature !== 'N/A' ? `${gpu.temperature} °C` : 'N/A';
        
        const utilVal = document.getElementById(`util-gpu-${gpu.id}`);
        if (utilVal) utilVal.textContent = gpu.utilization_gpu !== 'N/A' ? `${gpu.utilization_gpu} %` : 'N/A';
        
        const utilBar = document.getElementById(`bar-util-${gpu.id}`);
        if (utilBar) utilBar.style.width = gpu.utilization_gpu !== 'N/A' ? `${gpu.utilization_gpu}%` : '0%';
        
        const memVal = document.getElementById(`mem-${gpu.id}`);
        const memBar = document.getElementById(`bar-mem-${gpu.id}`);
        if (gpu.memory_used !== 'N/A' && gpu.memory_total !== 'N/A') {
            const usedMB = (gpu.memory_used / 1024 / 1024).toFixed(0);
            const totalMB = (gpu.memory_total / 1024 / 1024).toFixed(0);
            const memPercent = ((gpu.memory_used / gpu.memory_total) * 100).toFixed(1);
            if (memVal) memVal.textContent = `${usedMB} MB / ${totalMB} MB (${memPercent}%)`;
            if (memBar) memBar.style.width = `${memPercent}%`;
        } else {
            if (memVal) memVal.textContent = 'N/A';
            if (memBar) memBar.style.width = '0%';
        }
        
        const powerVal = document.getElementById(`power-${gpu.id}`);
        if (powerVal) {
            powerVal.textContent = (gpu.power_usage !== 'N/A' && gpu.power_limit !== 'N/A') 
                ? `${gpu.power_usage.toFixed(1)} W / ${gpu.power_limit.toFixed(1)} W` 
                : 'N/A';
        }
        
        const clockVal = document.getElementById(`clock-${gpu.id}`);
        if (clockVal) {
            clockVal.textContent = (gpu.clock_graphics !== 'N/A' && gpu.clock_memory !== 'N/A') 
                ? `${gpu.clock_graphics} MHz / ${gpu.clock_memory} MHz` 
                : 'N/A';
        }
        
        const fanVal = document.getElementById(`fan-speed-${gpu.id}`);
        if (fanVal) {
            const currentSpeed = gpu.fan_speed !== 'N/A' ? `${gpu.fan_speed} %` : 'N/A';
            fanVal.textContent = currentSpeed;
            
            // Adjust spinning speed animation based on current fan percentage
            const fanIcon = card.querySelector('.spinning-fan');
            if (fanIcon) {
                if (gpu.fan_speed !== 'N/A' && gpu.fan_speed > 0) {
                    // map 20%-100% to 4s-0.5s duration
                    const duration = Math.max(0.5, 4 - (gpu.fan_speed / 100) * 3.5);
                    fanIcon.style.animationDuration = `${duration}s`;
                    fanIcon.style.display = 'inline-block';
                } else {
                    fanIcon.style.animationDuration = '0s';
                }
            }
        }
    });
}

async function setFanSpeed(gpuId) {
    const slider = document.getElementById(`fan-slider-${gpuId}`);
    if (!slider) return;
    const speed = parseInt(slider.value, 10);
    
    try {
        const res = await apiRequest('/api/fan_speed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gpu_id: gpuId, speed_percent: speed })
        });
        showToast(res.message || "风扇转速设定成功", 'success');
        fetchStatus();
    } catch (e) {
        // Errors are automatically formatted inside apiRequest and showError
    }
}

async function setAutoFan(gpuId) {
    try {
        const res = await apiRequest('/api/fan_auto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gpu_id: gpuId })
        });
        showToast(res.message || "风扇控制已成功恢复自动(Auto)", 'success');
        fetchStatus();
    } catch (e) {
        // Errors are handled internally
    }
}

function renderCPU(cpu) {
    const container = document.getElementById('cpu-container');
    if (!container || !cpu || cpu.error) return;

    let card = document.getElementById('cpu-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'cpu-card';
        card.className = 'gpu-card';
        container.appendChild(card);
        
        // Premium static structure
        card.innerHTML = `
            <div class="gpu-header">
                <h3>
                    <i data-lucide="server"></i>
                    <span>系统 &amp; CPU 监控</span>
                    <span id="cpu-core-info" style="font-size: 11px; color: var(--text-secondary); font-weight: normal; margin-left: 8px; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 8px;"></span>
                </h3>
                <span class="header-status-badge">
                    <span class="status-dot" style="background-color: var(--secondary);"></span>
                    <span>监控中</span>
                </span>
            </div>
            
            <div class="gpu-stat">
                <span class="label"><i data-lucide="thermometer"></i>总体温度</span>
                <span class="value" id="cpu-total-temp">N/A</span>
            </div>
            
            <div class="gpu-stat">
                <span class="label"><i data-lucide="activity"></i>总体利用率</span>
                <span class="value" id="cpu-total-util">N/A</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="cpu-util-bar" style="width: 0%"></div>
            </div>
            
            <div class="gpu-stat">
                <span class="label"><i data-lucide="database"></i>内存占用</span>
                <span class="value" id="cpu-mem-text">N/A</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="cpu-mem-bar" style="width: 0%"></div>
            </div>
            
            <div id="cpu-freq-container"></div>
            <div id="cpu-temp-container"></div>
            <div id="cpu-fan-container"></div>
            
            <div class="fan-control">
                <h4><i data-lucide="sliders"></i>CPU 风扇控制 (PWM)</h4>
                <div class="gpu-stat" style="margin-bottom: 12px;">
                    <span class="label"><i data-lucide="settings"></i>选择控制设备</span>
                    <select id="cpu-pwm-select" onchange="saveCPUPWM()"></select>
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

        // Render CPU card icons
        if (window.lucide) {
            window.lucide.createIcons();
        }

        // Populate dropdown only once
        const select = document.getElementById('cpu-pwm-select');
        if (select && cpu.pwm_controllers) {
            if (cpu.pwm_controllers.length === 0) {
                select.add(new Option('--- 未检测到可控风扇 ---', ''));
                select.disabled = true;
                const fanSlider = document.getElementById('cpu-fan-slider');
                if (fanSlider) fanSlider.disabled = true;
                const btnSet = card.querySelector('.btn-set');
                if (btnSet) btnSet.disabled = true;
                const btnAuto = card.querySelector('.btn-auto');
                if (btnAuto) btnAuto.disabled = true;
            } else {
                select.add(new Option('--- 请选择设备 ---', ''));
                cpu.pwm_controllers.forEach(pwm => {
                    select.add(new Option(pwm.label, pwm.path));
                });
                
                // Load previously saved path
                const savedPWM = localStorage.getItem('cpu_pwm_path');
                if (savedPWM) select.value = savedPWM;
            }
        }
    }
    
    // Update dynamic fields
    const coreInfo = document.getElementById('cpu-core-info');
    if (coreInfo) coreInfo.textContent = cpu.cores_physical ? `${cpu.cores_physical}C / ${cpu.cores_logical}T` : '';
    
    const totalTemp = document.getElementById('cpu-total-temp');
    if (totalTemp) totalTemp.textContent = cpu.temperature !== 'N/A' ? `${cpu.temperature} °C` : 'N/A';
    
    const totalUtil = document.getElementById('cpu-total-util');
    if (totalUtil) totalUtil.textContent = cpu.utilization !== undefined ? `${cpu.utilization} %` : 'N/A';
    
    const utilBar = document.getElementById('cpu-util-bar');
    if (utilBar) utilBar.style.width = cpu.utilization !== undefined ? `${cpu.utilization}%` : '0%';
    
    const memText = document.getElementById('cpu-mem-text');
    const memBar = document.getElementById('cpu-mem-bar');
    if (cpu.memory_used && cpu.memory_total) {
        const usedGB = (cpu.memory_used / 1024 / 1024 / 1024).toFixed(1);
        const totalGB = (cpu.memory_total / 1024 / 1024 / 1024).toFixed(1);
        const memPercent = ((cpu.memory_used / cpu.memory_total) * 100).toFixed(1);
        if (memText) memText.textContent = `${usedGB} GB / ${totalGB} GB (${memPercent}%)`;
        if (memBar) memBar.style.width = `${memPercent}%`;
    }

    // Build Frequencies Grid
    let freqHtml = '';
    let shouldUpdateFreq = false;
    if (cpu.frequencies && cpu.frequencies.length > 0) {
        freqHtml = `<div class="section-title"><i data-lucide="zap" style="width:13px;height:13px;color:var(--secondary)"></i>CPU 频率</div><div class="info-grid">`;
        cpu.frequencies.forEach((f, idx) => {
            let lbl = cpu.frequencies.length === 1 ? '核心频率' : `核心 ${idx}`;
            freqHtml += `
                <div class="info-chip">
                    <span class="chip-label">${lbl}</span>
                    <span class="chip-value">${f.current} MHz</span>
                </div>`;
        });
        freqHtml += `</div>`;
        shouldUpdateFreq = true;
    }
    const freqContainer = document.getElementById('cpu-freq-container');
    if (freqContainer && shouldUpdateFreq) freqContainer.innerHTML = freqHtml;

    // Build Core Temps Grid
    let tempHtml = '';
    let shouldUpdateTemp = false;
    if (cpu.core_temperatures && cpu.core_temperatures.length > 0) {
        tempHtml = `<div class="section-title"><i data-lucide="thermometer" style="width:13px;height:13px;color:var(--secondary)"></i>传感器温度</div><div class="info-grid">`;
        cpu.core_temperatures.forEach(t => {
            tempHtml += `
                <div class="info-chip">
                    <span class="chip-label">${t.label}</span>
                    <span class="chip-value">${t.current} °C</span>
                </div>`;
        });
        tempHtml += `</div>`;
        shouldUpdateTemp = true;
    }
    const tempContainer = document.getElementById('cpu-temp-container');
    if (tempContainer && shouldUpdateTemp) tempContainer.innerHTML = tempHtml;

    // Build Fan RPMs Grid
    let fanHtml = '';
    let shouldUpdateFan = false;
    if (cpu.fans_rpm && cpu.fans_rpm.length > 0) {
        fanHtml = `<div class="section-title"><i data-lucide="fan" style="width:13px;height:13px;color:var(--secondary)"></i>风扇当前转速</div><div class="info-grid">`;
        cpu.fans_rpm.forEach(f => {
            fanHtml += `
                <div class="info-chip">
                    <span class="chip-label">${f.label}</span>
                    <span class="chip-value">${f.rpm} RPM</span>
                </div>`;
        });
        fanHtml += `</div>`;
        shouldUpdateFan = true;
    }
    const fanContainer = document.getElementById('cpu-fan-container');
    if (fanContainer && shouldUpdateFan) fanContainer.innerHTML = fanHtml;
    
    // Redraw dynamic icons inside new innerHTML grids
    if (window.lucide && (shouldUpdateFreq || shouldUpdateTemp || shouldUpdateFan)) {
        window.lucide.createIcons();
    }
}

function saveCPUPWM() {
    const select = document.getElementById('cpu-pwm-select');
    if (select) {
        localStorage.setItem('cpu_pwm_path', select.value);
    }
}

async function setCPUFanSpeed() {
    const select = document.getElementById('cpu-pwm-select');
    if (!select) return;
    const pwmPath = select.value;
    if (!pwmPath) return showToast('请先选择风扇(PWM)设备', 'error');
    
    const slider = document.getElementById('cpu-fan-slider');
    if (!slider) return;
    const speed = parseInt(slider.value, 10);
    
    try {
        const res = await apiRequest('/api/cpu/fan_speed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pwm_path: pwmPath, speed_percent: speed })
        });
        showToast(res.message || "CPU风扇转速设定成功", 'success');
        fetchStatus();
    } catch (e) {
        // Handled internally
    }
}

async function setAutoCPUFan() {
    const select = document.getElementById('cpu-pwm-select');
    if (!select) return;
    const pwmPath = select.value;
    if (!pwmPath) return showToast('请先选择风扇(PWM)设备', 'error');
    
    try {
        const res = await apiRequest('/api/cpu/fan_auto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pwm_path: pwmPath })
        });
        showToast(res.message || "CPU风扇已成功恢复自动模式", 'success');
        fetchStatus();
    } catch (e) {
        // Handled internally
    }
}

// Start Application
init();
