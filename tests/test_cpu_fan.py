# tests/test_cpu_fan.py
from fastapi.testclient import TestClient
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))
from main import app, AUTH_KEY
from unittest.mock import patch, mock_open

client = TestClient(app)

@patch("builtins.open", new_callable=mock_open)
@patch("os.path.exists", return_value=True)
def test_set_cpu_fan_speed(mock_exists, mock_file):
    req_data = {"pwm_path": "/sys/class/hwmon/hwmon0/pwm1", "speed_percent": 50}
    response = client.post("/api/cpu/fan_speed", json=req_data, headers={"x-auth-key": AUTH_KEY})
    assert response.status_code == 200
    assert "成功" in response.json()["message"]
    # Check that enable was set to 1 and pwm to 127
    mock_file.assert_any_call("/sys/class/hwmon/hwmon0/pwm1_enable", "w")
    mock_file.assert_any_call("/sys/class/hwmon/hwmon0/pwm1", "w")

@patch("builtins.open", new_callable=mock_open)
@patch("os.path.exists", return_value=True)
def test_set_cpu_fan_auto(mock_exists, mock_file):
    req_data = {"pwm_path": "/sys/class/hwmon/hwmon0/pwm1"}
    response = client.post("/api/cpu/fan_auto", json=req_data, headers={"x-auth-key": AUTH_KEY})
    assert response.status_code == 200
    mock_file.assert_any_call("/sys/class/hwmon/hwmon0/pwm1_enable", "w")
