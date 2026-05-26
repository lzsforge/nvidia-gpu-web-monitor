import os
import json
import secrets
import psutil
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import pynvml
import uvicorn

CONFIG_FILE = "config.json"

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

def load_or_create_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            try:
                config = json.load(f)
                if "auth_key" in config:
                    return config["auth_key"]
            except json.JSONDecodeError:
                pass
    
    # Auto-generate random Key if missing
    new_key = secrets.token_hex(16)
    with open(CONFIG_FILE, "w") as f:
        json.dump({"auth_key": new_key}, f, indent=4)
    
    print("\n" + "="*60)
    print("首次运行，已自动生成随机 Auth Key 并写入 config.json。")
    print(f"Auth Key: {new_key}")
    print(f"登录地址: http://localhost:8000/?key={new_key}")
    print("="*60 + "\n")
    return new_key

AUTH_KEY = load_or_create_config()

app = FastAPI(title="NVIDIA GPU Web Monitor")

def verify_key(x_auth_key: str = Header(None)):
    if x_auth_key != AUTH_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid Auth Key")
    return x_auth_key

@app.on_event("startup")
def startup_event():
    try:
        pynvml.nvmlInit()
        print("NVML initialized successfully.")
    except pynvml.NVMLError as e:
        print(f"Failed to initialize NVML: {e}")

@app.on_event("shutdown")
def shutdown_event():
    try:
        pynvml.nvmlShutdown()
    except Exception:
        pass

@app.get("/api/status")
def get_status(key: str = Depends(verify_key)):
    try:
        device_count = pynvml.nvmlDeviceGetCount()
    except pynvml.NVMLError:
        return {"error": "无法获取 GPU 数量，可能是驱动未安装或 NVML 未正确初始化。"}
    
    gpus = []
    for i in range(device_count):
        handle = pynvml.nvmlDeviceGetHandleByIndex(i)
        gpu_info = {"id": i}
        
        try:
            gpu_info["name"] = pynvml.nvmlDeviceGetName(handle)
        except Exception:
            gpu_info["name"] = "N/A"
            
        try:
            gpu_info["temperature"] = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
        except Exception:
            gpu_info["temperature"] = "N/A"
            
        try:
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            gpu_info["utilization_gpu"] = util.gpu
            gpu_info["utilization_memory"] = util.memory
        except Exception:
            gpu_info["utilization_gpu"] = "N/A"
            gpu_info["utilization_memory"] = "N/A"
            
        try:
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            gpu_info["memory_total"] = mem.total
            gpu_info["memory_used"] = mem.used
            gpu_info["memory_free"] = mem.free
        except Exception:
            gpu_info["memory_total"] = "N/A"
            gpu_info["memory_used"] = "N/A"
            gpu_info["memory_free"] = "N/A"
            
        try:
            power = pynvml.nvmlDeviceGetPowerUsage(handle)
            power_limit = pynvml.nvmlDeviceGetPowerManagementLimit(handle)
            gpu_info["power_usage"] = power / 1000.0  # W
            gpu_info["power_limit"] = power_limit / 1000.0
        except Exception:
            gpu_info["power_usage"] = "N/A"
            gpu_info["power_limit"] = "N/A"
            
        try:
            gpu_info["clock_graphics"] = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS)
            gpu_info["clock_memory"] = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_MEM)
        except Exception:
            gpu_info["clock_graphics"] = "N/A"
            gpu_info["clock_memory"] = "N/A"
            
        try:
            # NVML usually returns an array of fan speeds if there are multiple. 
            # nvmlDeviceGetFanSpeed is the legacy function (first fan).
            gpu_info["fan_speed"] = pynvml.nvmlDeviceGetFanSpeed(handle)
        except Exception:
            gpu_info["fan_speed"] = "N/A"
            
        try:
            num_fans = pynvml.nvmlDeviceGetNumFans(handle)
            fan_rpms = []
            for fan_idx in range(num_fans):
                try:
                    # In newer pynvml versions, might not have direct RPM function, but sometimes it does (nvmlDeviceGetFanSpeed_v2).
                    # Actually pynvml might not have fan RPM easily. We will omit RPM or just try a dummy call to see if it exists.
                    pass
                except Exception:
                    pass
        except Exception:
            pass
            
        gpus.append(gpu_info)
        
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

class FanSpeedRequest(BaseModel):
    gpu_id: int
    speed_percent: int

@app.post("/api/fan_speed")
def set_fan_speed(req: FanSpeedRequest, key: str = Depends(verify_key)):
    if req.speed_percent < 20 or req.speed_percent > 100:
        raise HTTPException(status_code=400, detail="风扇转速百分比必须限制在 20 到 100 之间")
    
    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(req.gpu_id)
        num_fans = pynvml.nvmlDeviceGetNumFans(handle)
        
        for i in range(num_fans):
            # pynvml 提供了 nvmlDeviceSetFanSpeed_v2
            pynvml.nvmlDeviceSetFanSpeed_v2(handle, i, req.speed_percent)
            
        return {"status": "success", "message": f"成功将 GPU {req.gpu_id} 的风扇转速设置为 {req.speed_percent}%"}
    except AttributeError:
        # Fallback to older v1
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(req.gpu_id)
            pynvml.nvmlDeviceSetFanSpeed(handle, req.speed_percent)
            return {"status": "success", "message": f"成功将 GPU {req.gpu_id} 的风扇转速设置为 {req.speed_percent}% (v1)"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"设置风扇转速失败(v1): {e}。可能需要管理员/root权限或驱动不支持。")
    except pynvml.NVMLError as e:
        raise HTTPException(status_code=500, detail=f"设置风扇转速失败(NVML): {e}。注意：Linux 上可能需要管理员权限或配置 Xorg。")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"设置风扇转速时发生未知错误: {e}")

class FanAutoRequest(BaseModel):
    gpu_id: int

@app.post("/api/fan_auto")
def set_fan_auto(req: FanAutoRequest, key: str = Depends(verify_key)):
    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(req.gpu_id)
        num_fans = pynvml.nvmlDeviceGetNumFans(handle)
        
        for i in range(num_fans):
            pynvml.nvmlDeviceSetDefaultFanSpeed_v2(handle, i)
            
        return {"status": "success", "message": f"成功将 GPU {req.gpu_id} 的风扇控制恢复为自动(Auto)模式"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"恢复自动风扇控制失败: {e}。可能需要管理员/root权限。")

# Mount static files at root
os.makedirs("static", exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
