# CPU Monitoring and Fan Control Design

## Context
Adding CPU monitoring and CPU fan speed control to the existing NVIDIA GPU Web Monitor. The application runs on a Linux Desktop environment, likely with `root` privileges.

## Architecture & Components
- **Dependency**: Add `psutil` to `pyproject.toml` for fetching CPU utilization, per-core metrics, memory usage, and reading CPU temperatures (via `sensors_temperatures`).
- **Fan Control**: Direct manipulation of `/sys/class/hwmon` sysfs interface using Python's standard `os` and `pathlib`.
- **Backend API**:
  - `GET /api/status`: Extended to include CPU statistics (utilization, temp, memory) and a list of available/discovered hardware PWM controllers (paths like `/sys/class/hwmon/hwmon2/pwm1`).
  - `POST /api/cpu/fan_speed`: Sets fan to manual mode by writing `1` to `pwm_enable`, and a value `0-255` to the `pwm` file (converted from 20-100%).
  - `POST /api/cpu/fan_auto`: Restores automatic control (writes `0` or `2` or similar default to `pwm_enable`, or falls back gracefully depending on the exact chip driver).
- **Frontend UI**:
  - A new "CPU & System" card displayed alongside GPU cards.
  - Dropdown menu dynamically populated with the discovered PWM interfaces for the user to select the correct CPU fan controller.
  - Fan slider (20%-100%), and Apply / Auto buttons for CPU fan control.

## Data Flow & Persistence
1. Backend scans `/sys/class/hwmon/hwmon*` for directories that contain `pwm*` and `pwm*_enable` files, constructing a list of controllable fans and their human-readable labels (if `name` file exists).
2. Frontend queries `/api/status` and displays the list of PWM controllers in the CPU card's dropdown.
3. User selects the appropriate PWM interface for the CPU. This selection is persisted in `config.json` via a new configuration API (or automatically stored when the first control action happens).
4. When sliding/applying fan speeds, the frontend sends the selected `pwm_path` and `speed_percent` to the backend.

## Error Handling
- Lack of `root` permissions will surface as `PermissionError` during file writing; caught and returned as a clear HTTP 500 error advising the user to run as root.
- Missing `hwmon` paths handled gracefully with N/A values.

## Testing Strategy
- Start app as root.
- Ensure CPU stats appear correctly (utilization, temps, memory).
- Ensure dropdown shows available PWMs.
- Apply manual fan curve, confirm physical CPU fan responds (or check sysfs `pwm` value directly).
- Apply Auto mode, confirm `pwm_enable` resets.
