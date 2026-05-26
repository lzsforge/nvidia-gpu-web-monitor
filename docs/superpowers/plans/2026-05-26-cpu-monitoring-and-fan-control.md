# CPU Monitoring and Fan Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CPU utilization, memory, temperature monitoring, and manual CPU fan speed control.

**Architecture:** Use `psutil` for stats and temps. Directly manipulate `/sys/class/hwmon/` sysfs interfaces to control PWM fans. Serve via FastAPI and update vanilla JS frontend.

**Tech Stack:** Python, FastAPI, psutil, Vanilla JS/HTML/CSS.

---

### Task 1: Update Dependencies and Add psutil

**Files:**
- Modify: `pyproject.toml`
- Create: `tests/test_deps.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_deps.py
def test_psutil_installed():
    import psutil
    assert psutil.__version__
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_deps.py` (ensure pytest is installed or run `python -m pytest tests/test_deps.py`)
Expected: FAIL with ModuleNotFoundError for `psutil` or `pytest`.

- [ ] **Step 3: Write minimal implementation**

```toml
# In pyproject.toml, add psutil to dependencies
dependencies = [
    "fastapi",
    "uvicorn",
    "nvidia-ml-py",
    "pydantic",
    "psutil"
]
```
*(Also ensure we have pytest installed in our dev env, e.g. `pip install pytest psutil` if needed manually for testing).*

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_deps.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml tests/test_deps.py
git commit -m "build: add psutil dependency"
```

---

### Task 2: Implement Hardware Scanning and CPU Status

**Files:**
- Modify: `main.py`
- Create: `tests/test_cpu_status.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_cpu_status.py
from fastapi.testclient import TestClient
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))
from main import app, AUTH_KEY
from unittest.mock import patch, MagicMock

client = TestClient(app)

@patch("main.psutil")
@patch("main.get_hwmon_pwms")
def test_get_status_includes_cpu(mock_get_hwmon, mock_psutil):
    mock_psutil.cpu_percent.return_value = 15.0
    mock_mem = MagicMock()
    mock_mem.total = 16000000000
    mock_mem.used = 8000000000
    mock_psutil.virtual_memory.return_value = mock_mem
    mock_psutil.sensors_temperatures.return_value = {"coretemp": [MagicMock(current=45.0)]}
    mock_get_hwmon.return_value = [{"path": "/sys/class/hwmon/hwmon0/pwm1", "label": "coretemp - pwm1"}]
    
    response = client.get("/api/status", headers={"x-auth-key": AUTH_KEY})
    assert response.status_code == 200
    data = response.json()
    assert "cpu" in data
    assert data["cpu"]["utilization"] == 15.0
    assert data["cpu"]["temperature"] == 45.0
    assert len(data["cpu"]["pwm_controllers"]) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_cpu_status.py`
Expected: FAIL, missing `cpu` in response and `get_hwmon_pwms` not defined.

- [ ] **Step 3: Write minimal implementation**

In `main.py`, add imports and helper:
```python
import psutil
from pathlib import Path

def get_hwmon_pwms():
    pwms = []
    base_dir = Path("/sys/class/hwmon")
    if not base_dir.exists():
        return pwms
    for hwmon in base_dir.glob("hwmon*"):
        name_file = hwmon / "name"
        hwmon_name = name_file.read_text().strip() if name_file.exists() else hwmon.name
        for pwm in hwmon.glob("pwm*"):
            if "enable" not in pwm.name:
                pwms.append({
                    "path": str(pwm),
                    "label": f"{hwmon_name} - {pwm.name}"
                })
    return pwms
```

Update `/api/status` endpoint in `main.py` before `return {"gpus": gpus}`:
```python
    cpu_info = {}
    try:
        cpu_info["utilization"] = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        cpu_info["memory_total"] = mem.total
        cpu_info["memory_used"] = mem.used
        
        temps = psutil.sensors_temperatures()
        # Try to find a reasonable CPU temp (often coretemp, k10temp, or just take first)
        cpu_temp = "N/A"
        if temps:
            for name in ["coretemp", "k10temp", "cpu_thermal"]:
                if name in temps and len(temps[name]) > 0:
                    cpu_temp = temps[name][0].current
                    break
            if cpu_temp == "N/A":
                # Fallback to first available sensor
                first_key = list(temps.keys())[0]
                if temps[first_key]:
                    cpu_temp = temps[first_key][0].current
        cpu_info["temperature"] = cpu_temp
        cpu_info["pwm_controllers"] = get_hwmon_pwms()
    except Exception as e:
        cpu_info["error"] = str(e)
    
    return {"gpus": gpus, "cpu": cpu_info}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_cpu_status.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_cpu_status.py
git commit -m "feat: add cpu stats and hwmon scanning to status API"
```

---

### Task 3: Implement POST API Endpoints for CPU Fan Control

**Files:**
- Modify: `main.py`
- Create: `tests/test_cpu_fan.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_cpu_fan.py
from fastapi.testclient import TestClient
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))
from main import app, AUTH_KEY
from unittest.mock import patch, mock_open

client = TestClient(app)

@patch("builtins.open", new_callable=mock_open)
def test_set_cpu_fan_speed(mock_file):
    req_data = {"pwm_path": "/sys/class/hwmon/hwmon0/pwm1", "speed_percent": 50}
    response = client.post("/api/cpu/fan_speed", json=req_data, headers={"x-auth-key": AUTH_KEY})
    assert response.status_code == 200
    assert "成功" in response.json()["message"]
    # Check that enable was set to 1 and pwm to 127
    mock_file.assert_any_call("/sys/class/hwmon/hwmon0/pwm1_enable", "w")
    mock_file.assert_any_call("/sys/class/hwmon/hwmon0/pwm1", "w")

@patch("builtins.open", new_callable=mock_open)
def test_set_cpu_fan_auto(mock_file):
    req_data = {"pwm_path": "/sys/class/hwmon/hwmon0/pwm1"}
    response = client.post("/api/cpu/fan_auto", json=req_data, headers={"x-auth-key": AUTH_KEY})
    assert response.status_code == 200
    mock_file.assert_any_call("/sys/class/hwmon/hwmon0/pwm1_enable", "w")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_cpu_fan.py`
Expected: FAIL (404 Not Found for endpoints)

- [ ] **Step 3: Write minimal implementation**

In `main.py`, add new models and endpoints:
```python
class CPUFanSpeedRequest(BaseModel):
    pwm_path: str
    speed_percent: int

@app.post("/api/cpu/fan_speed")
def set_cpu_fan_speed(req: CPUFanSpeedRequest, key: str = Depends(verify_key)):
    if req.speed_percent < 20 or req.speed_percent > 100:
        raise HTTPException(status_code=400, detail="风扇转速百分比必须限制在 20 到 100 之间")
    
    try:
        pwm_val = int((req.speed_percent / 100.0) * 255)
        # Enable manual mode (1)
        enable_path = req.pwm_path + "_enable"
        if os.path.exists(enable_path):
            with open(enable_path, "w") as f:
                f.write("1\n")
                
        with open(req.pwm_path, "w") as f:
            f.write(f"{pwm_val}\n")
            
        return {"status": "success", "message": f"成功将 CPU 风扇转速设置为 {req.speed_percent}%"}
    except PermissionError:
        raise HTTPException(status_code=500, detail="没有权限写入 hwmon。请以 root 权限运行程序。")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"设置 CPU 风扇转速失败: {e}")

class CPUFanAutoRequest(BaseModel):
    pwm_path: str

@app.post("/api/cpu/fan_auto")
def set_cpu_fan_auto(req: CPUFanAutoRequest, key: str = Depends(verify_key)):
    try:
        # Restore auto mode. Depending on driver, this is usually 0, 2, or 5.
        # Most common for standard motherboards is 0 (full auto) or 2 (thermal cruise).
        # We will write 0.
        enable_path = req.pwm_path + "_enable"
        if os.path.exists(enable_path):
            with open(enable_path, "w") as f:
                f.write("0\n")
        return {"status": "success", "message": "成功将 CPU 风扇恢复为自动模式"}
    except PermissionError:
        raise HTTPException(status_code=500, detail="没有权限写入 hwmon。请以 root 权限运行程序。")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"恢复 CPU 自动风扇控制失败: {e}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_cpu_fan.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_cpu_fan.py
git commit -m "feat: add cpu fan control endpoints"
```

---

### Task 4: Implement Frontend CPU Card

**Files:**
- Modify: `static/index.html`
- Modify: `static/app.js`

- [ ] **Step 1: Write the failing test**
*(Frontend tests not present, verify via manual inspection or UI structure).*
Run logic visually. We'll add DOM manipulation logic directly.

- [ ] **Step 2: Run test to verify it fails**
(Skip automated fail check)

- [ ] **Step 3: Write minimal implementation**

In `static/index.html`, add `<div id="cpu-container" class="gpu-grid"></div>` right above `<div id="gpu-container" class="gpu-grid"></div>`.

In `static/app.js`, add `renderCPU(data.cpu)` inside `fetchStatus`:
```javascript
// In fetchStatus(), after fetching data:
// renderGPUs(data.gpus);
// if (data.cpu) renderCPU(data.cpu);

function renderCPU(cpu) {
    const container = document.getElementById('cpu-container');
    if (!cpu || cpu.error) return;

    let card = document.getElementById('cpu-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'cpu-card';
        card.className = 'gpu-card';
        container.appendChild(card);
        
        // Build CPU structure
        card.innerHTML = `
            <div class="gpu-header">
                <h3>系统 & CPU</h3>
            </div>
            
            <div class="gpu-stat">
                <span class="label">温度</span>
                <span class="value" id="cpu-temp">N/A</span>
            </div>
            
            <div class="gpu-stat">
                <span class="label">利用率</span>
                <span class="value" id="cpu-util">N/A</span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" id="bar-cpu-util" style="width: 0%"></div></div>
            
            <div class="gpu-stat">
                <span class="label">内存占用</span>
                <span class="value" id="cpu-mem">N/A</span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" id="bar-cpu-mem" style="width: 0%"></div></div>
            
            <div class="fan-control">
                <h4>CPU 风扇控制</h4>
                <div class="gpu-stat" style="margin-bottom: 10px;">
                    <span class="label">选择风扇(PWM)</span>
                    <select id="cpu-pwm-select" onchange="saveCPUPWM()" style="max-width: 150px; padding: 4px;"></select>
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
    }
    
    // Update values
    document.getElementById('cpu-temp').textContent = cpu.temperature !== 'N/A' ? \`\${cpu.temperature} °C\` : 'N/A';
    document.getElementById('cpu-util').textContent = cpu.utilization !== undefined ? \`\${cpu.utilization} %\` : 'N/A';
    document.getElementById('bar-cpu-util').style.width = cpu.utilization !== undefined ? \`\${cpu.utilization}%\` : '0%';
    
    if (cpu.memory_used && cpu.memory_total) {
        const usedGB = (cpu.memory_used / 1024 / 1024 / 1024).toFixed(1);
        const totalGB = (cpu.memory_total / 1024 / 1024 / 1024).toFixed(1);
        const memPercent = ((cpu.memory_used / cpu.memory_total) * 100).toFixed(1);
        document.getElementById('cpu-mem').textContent = \`\${usedGB} GB / \${totalGB} GB (\${memPercent}%)\`;
        document.getElementById('bar-cpu-mem').style.width = \`\${memPercent}%\`;
    }
    
    // Populate dropdown only once if empty
    const select = document.getElementById('cpu-pwm-select');
    if (select.options.length === 0 && cpu.pwm_controllers) {
        // add default empty option
        select.add(new Option('--- 未选择 ---', ''));
        cpu.pwm_controllers.forEach(pwm => {
            select.add(new Option(pwm.label, pwm.path));
        });
        // load saved
        const savedPWM = localStorage.getItem('cpu_pwm_path');
        if (savedPWM) select.value = savedPWM;
    }
}

function saveCPUPWM() {
    const val = document.getElementById('cpu-pwm-select').value;
    localStorage.setItem('cpu_pwm_path', val);
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
```
*(Need to also update `fetchStatus` function in `app.js` to call `if(data.cpu) renderCPU(data.cpu);` at the end).*

- [ ] **Step 4: Run test to verify it passes**
Open browser, ensure layout looks correct. (Manual check via UI).

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/app.js
git commit -m "feat: add cpu frontend monitor and control"
```
