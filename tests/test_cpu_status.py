# tests/test_cpu_status.py
from fastapi.testclient import TestClient
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))
from main import app, AUTH_KEY
from unittest.mock import patch, MagicMock

client = TestClient(app)

@patch("main.pynvml")
@patch("main.psutil")
@patch("main.get_hwmon_pwms")
def test_get_status_includes_cpu(mock_get_hwmon, mock_psutil, mock_pynvml):
    mock_pynvml.nvmlDeviceGetCount.return_value = 0
    mock_psutil.cpu_percent.return_value = 15.0
    mock_mem = MagicMock()
    mock_mem.total = 16000000000
    mock_mem.used = 8000000000
    mock_psutil.virtual_memory.return_value = mock_mem
    mock_psutil.sensors_temperatures.return_value = {"coretemp": [MagicMock(label="Core 0", current=45.0)]}
    mock_psutil.sensors_fans.return_value = {"nct6793": [MagicMock(label="fan1", current=1200)]}
    mock_psutil.cpu_freq.return_value = [MagicMock(current=3600, min=800, max=5000)]
    mock_psutil.cpu_count.side_effect = lambda logical: 8 if logical else 4
    mock_get_hwmon.return_value = [{"path": "/sys/class/hwmon/hwmon0/pwm1", "label": "coretemp - pwm1"}]
    
    response = client.get("/api/status", headers={"x-auth-key": AUTH_KEY})
    assert response.status_code == 200
    data = response.json()
    assert "cpu" in data
    assert data["cpu"]["utilization"] == 15.0
    assert data["cpu"]["temperature"] == 45.0
    assert len(data["cpu"]["pwm_controllers"]) == 1
