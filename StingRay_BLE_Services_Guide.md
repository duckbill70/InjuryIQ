# StingRay Fitness Sensor - XIAO BLE Sense

**Hardware:** Seeed XIAO BLE Sense (nRF52840) with LSM6DS3TR-C IMU
**Firmware Version:** Revision E (Hardware Pedometer Integration)
**Date:** November 14, 2025

---

## Overview

The StingRay is an advanced fitness sensor providing real-time motion tracking, step counting, and fatigue monitoring. Built on Zephyr RTOS, it features a high-performance FIFO buffer system for training data collection and Bluetooth LE for wireless control and monitoring.

### Key Features

-   **Hardware Pedometer**: LSM6DS3TR-C's built-in step detection algorithm
-   **FIFO Data Collection**: 50Hz IMU sampling with configurable buffer (up to 30 seconds @ 1600 samples)
-   **Serial Data Export**: CSV format for TensorFlow training
-   **BLE Services**: Command control, statistics, battery monitoring, step counting
-   **LED State Indicators**: Visual feedback for device state and location
-   **USB CDC Serial**: Command interface and data export

---

## Hardware Specifications

-   **MCU**: Nordic nRF52840 (ARM Cortex-M4F @ 64MHz)
-   **Memory**: 1MB Flash, 256KB RAM
-   **IMU**: LSM6DS3TR-C 6-axis (accelerometer + gyroscope)
-   **LEDs**: RGB (Red=P0.26, Green=P0.30, Blue=P0.06 via PWM)
-   **Connectivity**: USB CDC, BLE 5.0
-   **Power**: LiPo battery with charging circuit

---

## Quick Start

### Building & Flashing

```bash
# Build
./scripts/build.sh

# Flash (double-tap reset button to enter bootloader)
./scripts/flash.sh

# Or manual flash
# Copy build/xiao/zephyr/zephyr.uf2 to XIAO-SENSE drive
```

### Serial Connection

```bash
# macOS/Linux
screen /dev/tty.usbmodem* 115200

# Or any serial terminal at 115200 baud
```

### First Use

1. Connect via serial terminal
2. Type `HELP` to see available commands
3. Use `RUN` to start recording, `STOP` to pause, `DUMP` to export data
4. Connect via BLE for wireless control (device name: "STINGRAY")

---

## Serial Commands

All commands are case-insensitive and can be sent via USB CDC serial.

### Recording Control

| Command          | Description                                            |
| ---------------- | ------------------------------------------------------ |
| `RUN` or `START` | Start IMU data collection into FIFO buffer             |
| `STOP`           | Stop recording (data preserved in buffer)              |
| `RESET`          | Clear FIFO buffer (only in STOP mode)                  |
| `DUMP`           | Export FIFO data as CSV via serial (only in STOP mode) |

### Configuration

| Command      | Description                                                   |
| ------------ | ------------------------------------------------------------- |
| `LOC <0\|1>` | Set location: 0=RED, 1=GREEN (affects LED color when running) |
| `STATS`      | Display current FIFO statistics and buffer status             |

### Information

| Command       | Description                         |
| ------------- | ----------------------------------- |
| `HELP` or `?` | Show command list                   |
| `IMU` or `M`  | Display current IMU sensor readings |
| `VERSION`     | Show firmware version information   |

### Example Session

```
> STATS
FIFO Status:
  Buffer: 0/1600 samples (0.0%)
  Recording: No
  Duration: 0 ms

> LOC 1
Location set to 1 (GREEN)

> RUN
Recording started

> STATS
FIFO Status:
  Buffer: 842/1600 samples (52.6%)
  Recording: Yes
  Duration: 16840 ms
  Rate: 50.0 Hz

> STOP
Recording stopped

> DUMP
=== IMU FIFO DUMP START ===
Total samples: 842
Duration: 16840 ms
Format: Pos,Time_ms,Accel_X,Accel_Y,Accel_Z,Gyro_X,Gyro_Y,Gyro_Z
---
0,0,0.123,-0.456,9.807,0.012,-0.003,0.001
1,20,0.134,-0.467,9.798,0.023,-0.012,0.002
...
=== IMU FIFO DUMP END ===
```

---

## LED States

The RGB LED provides visual feedback for device state and location.

### State Indicators

| State                    | LED Behavior | Description                     |
| ------------------------ | ------------ | ------------------------------- |
| **STOP (No BLE)**        | Pulsing Blue | Idle, ready for commands        |
| **STOP (BLE Connected)** | Solid Blue   | Idle with active BLE connection |
| **RUN (Location RED)**   | Solid Red    | Recording with RED location     |
| **RUN (Location GREEN)** | Solid Green  | Recording with GREEN location   |
| **DUMP**                 | Flashing Red | Data export in progress         |

**Note**: LED state automatically updates based on recording status and BLE connection.

---

## BLE Services

The device exposes 4 Bluetooth LE GATT services for wireless control and monitoring.

### Service Overview

| Service                               | UUID                | Purpose                          |
| ------------------------------------- | ------------------- | -------------------------------- |
| [Command](#command-service)           | `12345679-...`      | Control recording and operations |
| [Step Counter](#step-counter-service) | `0x1814` (Standard) | Hardware pedometer readings      |
| [Battery](#battery-service)           | `0x180F` (Standard) | Battery level monitoring         |
| [Fatigue](#fatigue-service)           | `12345678-...`      | Fatigue level analytics          |

### Command Service

**Service UUID**: `12345679-1234-5678-1234-56789abcdef0`

#### Command Characteristic

-   **UUID**: `12345679-1234-5678-1234-56789abcdef1`
-   **Properties**: Read, Write
-   **Data Type**: `uint8_t` (1 byte)

**Command Codes**:

| Value | Command     | Description           | Restrictions   |
| ----- | ----------- | --------------------- | -------------- |
| `0`   | STOP        | Stop recording        | None           |
| `1`   | RUN         | Start recording       | None           |
| `2`   | RESET       | Clear FIFO buffer     | STOP mode only |
| `3`   | DUMP        | Export data to serial | STOP mode only |
| `10`  | LOC_RED     | Set location to RED   | STOP mode only |
| `11`  | LOC_GREEN   | Set location to GREEN | STOP mode only |
| `20`  | RESET_STEPS | Reset step counter    | STOP mode only |

#### Statistics Characteristic

-   **UUID**: `12345679-1234-5678-1234-56789abcdef2`
-   **Properties**: Read, Notify
-   **Data Type**: 16-byte packed struct
-   **Update Frequency**: Every 1 second while recording

**Data Structure**:

```c
struct {
    uint16_t samples_stored;      // Bytes 0-1: Current samples in buffer
    uint16_t samples_dropped;     // Bytes 2-3: Samples lost (should be 0)
    uint32_t total_captured;      // Bytes 4-7: Total samples collected
    uint16_t duration_sec;        // Bytes 8-9: Recording duration (seconds)
    uint16_t actual_rate_hz;      // Bytes 10-11: Actual sample rate (Hz)
    uint16_t buffer_capacity;     // Bytes 12-13: Maximum buffer size
    uint8_t  is_recording;        // Byte 14: 1=recording, 0=stopped
    uint8_t  is_full;             // Byte 15: 1=buffer full, 0=space available
}
```

**iOS/Swift Implementation**:

```swift
let commandServiceUUID = CBUUID(string: "12345679-1234-5678-1234-56789abcdef0")
let commandCharUUID = CBUUID(string: "12345679-1234-5678-1234-56789abcdef1")
let statsCharUUID = CBUUID(string: "12345679-1234-5678-1234-56789abcdef2")

// Start recording
func startRecording() {
    let command = Data([1]) // CMD_RUN
    peripheral.writeValue(command, for: commandChar, type: .withResponse)
}

// Stop recording
func stopRecording() {
    let command = Data([0]) // CMD_STOP
    peripheral.writeValue(command, for: commandChar, type: .withResponse)
}

// Reset step counter (must be in STOP mode)
func resetSteps() {
    let command = Data([20]) // CMD_RESET_STEPS
    peripheral.writeValue(command, for: commandChar, type: .withResponse)
}

// Parse statistics
struct FIFOStats {
    let samplesStored: UInt16
    let samplesDropped: UInt16
    let totalCaptured: UInt32
    let durationSec: UInt16
    let actualRateHz: UInt16
    let bufferCapacity: UInt16
    let isRecording: Bool
    let isFull: Bool

    init?(from data: Data) {
        guard data.count == 16 else { return nil }
        samplesStored = data.subdata(in: 0..<2).withUnsafeBytes { $0.load(as: UInt16.self) }
        samplesDropped = data.subdata(in: 2..<4).withUnsafeBytes { $0.load(as: UInt16.self) }
        totalCaptured = data.subdata(in: 4..<8).withUnsafeBytes { $0.load(as: UInt32.self) }
        durationSec = data.subdata(in: 8..<10).withUnsafeBytes { $0.load(as: UInt16.self) }
        actualRateHz = data.subdata(in: 10..<12).withUnsafeBytes { $0.load(as: UInt16.self) }
        bufferCapacity = data.subdata(in: 12..<14).withUnsafeBytes { $0.load(as: UInt16.self) }
        isRecording = data[14] != 0
        isFull = data[15] != 0
    }

    var fillPercentage: Double {
        return bufferCapacity > 0 ? Double(samplesStored) / Double(bufferCapacity) * 100.0 : 0.0
    }
}
```

### Step Counter Service

**Service UUID**: `0x1814` (Running Speed and Cadence - Standard)

#### Step Count Characteristic

-   **UUID**: `0x2A53` (RSC Feature - repurposed)
-   **Properties**: Read, Notify
-   **Data Type**: `uint32_t` (4 bytes, little-endian)
-   **Range**: 0 to 4,294,967,295 steps
-   **Update Frequency**: Every 2 seconds

**Hardware Pedometer**: Uses the LSM6DS3TR-C's built-in step detection algorithm. The pedometer analyzes accelerometer data in hardware to detect steps with minimal CPU overhead.

**iOS/Swift Implementation**:

```swift
let stepServiceUUID = CBUUID(string: "1814")
let stepCountCharUUID = CBUUID(string: "2A53")

func parseStepCount(_ data: Data) -> UInt32 {
    guard data.count == 4 else { return 0 }
    return data.withUnsafeBytes { $0.load(as: UInt32.self) }
}
```

### Battery Service

**Service UUID**: `0x180F` (Standard Bluetooth SIG)

#### Battery Level Characteristic

-   **UUID**: `0x2A19` (Standard)
-   **Properties**: Read, Notify
-   **Data Type**: `uint8_t` (1 byte)
-   **Range**: 0-100 (percentage)
-   **Update Frequency**: Every 60 seconds

**iOS/Swift Implementation**:

```swift
let batteryServiceUUID = CBUUID(string: "180F")
let batteryLevelCharUUID = CBUUID(string: "2A19")

func parseBatteryLevel(_ data: Data) -> UInt8 {
    return data.first ?? 0
}
```

### Fatigue Service

**Service UUID**: `12345678-1234-5678-1234-56789abcdef0`

#### Fatigue Level Characteristic

-   **UUID**: `12345678-1234-5678-1234-56789abcdef1`
-   **Properties**: Read, Notify
-   **Data Type**: `uint8_t` (1 byte)
-   **Range**: 0-100 (percentage)
-   **Description**: Fatigue level based on IMU analysis
-   **Update Frequency**: Variable based on activity

**iOS/Swift Implementation**:

```swift
let fatigueServiceUUID = CBUUID(string: "12345678-1234-5678-1234-56789abcdef0")
let fatigueCharUUID = CBUUID(string: "12345678-1234-5678-1234-56789abcdef1")

func parseFatigueLevel(_ data: Data) -> UInt8 {
    return data.first ?? 0
}
```

---

## IMU Sensor (LSM6DS3TR-C)

### Specifications

-   **Type**: 6-axis motion sensor (3-axis accelerometer + 3-axis gyroscope)
-   **Sample Rate**: 50 Hz (configurable)
-   **Accelerometer Range**: ±2g
-   **Gyroscope Range**: ±250 dps
-   **Communication**: I2C @ 400kHz
-   **Power**: <1mA active mode

### Data Format

Each FIFO sample contains 8 values:

```csv
Position,Timestamp_ms,Accel_X,Accel_Y,Accel_Z,Gyro_X,Gyro_Y,Gyro_Z
```

-   **Position**: Sample index (0-based)
-   **Timestamp**: Milliseconds since recording started
-   **Accel**: Linear acceleration (m/s²)
-   **Gyro**: Angular velocity (°/s)

### Hardware Pedometer

The LSM6DS3TR-C includes a dedicated pedometer algorithm that runs in the IMU hardware:

-   **Step Detection**: Analyzes accelerometer patterns to detect steps
-   **Low Power**: Minimal CPU involvement
-   **Accuracy**: Optimized for walking and running patterns
-   **Counter**: 16-bit register (max 65,535 steps before rollover)

The pedometer is automatically enabled when the device starts and continuously counts steps in the background, even when not recording IMU data.

---

## FIFO Buffer System

### Overview

The FIFO (First-In-First-Out) buffer stores IMU samples for later export and analysis. This enables training data collection without real-time streaming.

### Configuration

-   **Capacity**: 1600 samples (fixed)
-   **Sample Rate**: 50 Hz
-   **Duration**: ~32 seconds at 50 Hz
-   **Memory**: ~75 KB

### Buffer States

| State       | Description                                         |
| ----------- | --------------------------------------------------- |
| **Empty**   | No samples stored                                   |
| **Filling** | Recording in progress                               |
| **Full**    | Maximum capacity reached (oldest samples discarded) |
| **Stopped** | Recording paused, data preserved                    |

### Usage Workflow

1. **Clear Buffer**: `RESET` command (ensures clean start)
2. **Start Recording**: `RUN` command
3. **Monitor Progress**: Check `STATS` or BLE statistics characteristic
4. **Stop Recording**: `STOP` command when done
5. **Export Data**: `DUMP` command to get CSV output
6. **Save Data**: Capture serial output to file for training

---

## Training Data Export

### CSV Format

Data is exported in CSV format compatible with TensorFlow and other ML frameworks:

```csv
=== IMU FIFO DUMP START ===
Total samples: 1615
Duration: 32300 ms
Format: Pos,Time_ms,Accel_X,Accel_Y,Accel_Z,Gyro_X,Gyro_Y,Gyro_Z
---
0,0,0.123,-0.456,9.807,0.012,-0.003,0.001
1,20,0.134,-0.467,9.798,0.023,-0.012,0.002
2,40,0.145,-0.478,9.789,0.034,-0.021,0.003
...
=== IMU FIFO DUMP END ===
```

### Python Processing Example

```python
import pandas as pd
import numpy as np

# Load exported data
data = pd.read_csv('fifo_dump.csv', skiprows=4, skipfooter=1, engine='python')

# Convert timestamp to seconds
data['time_sec'] = data['Time_ms'] / 1000.0

# Create sliding windows for training
def create_windows(df, window_size=100, overlap=50):
    windows = []
    stride = window_size - overlap
    for i in range(0, len(df) - window_size, stride):
        window = df.iloc[i:i+window_size]
        features = window[['Accel_X', 'Accel_Y', 'Accel_Z',
                          'Gyro_X', 'Gyro_Y', 'Gyro_Z']].values
        windows.append(features)
    return np.array(windows)

# Generate training windows
X = create_windows(data)
print(f"Generated {len(X)} training windows of shape {X.shape}")
```

---

## Memory Usage

### Current Build

-   **FLASH**: 286,300 bytes / 788 KB (35.48%)
-   **RAM**: 156,264 bytes / 256 KB (59.61%)

### Memory Breakdown

| Component   | Flash   | RAM    |
| ----------- | ------- | ------ |
| Zephyr RTOS | ~150 KB | ~60 KB |
| BLE Stack   | ~50 KB  | ~30 KB |
| IMU Driver  | ~20 KB  | ~2 KB  |
| FIFO Buffer | ~5 KB   | ~75 KB |
| Application | ~60 KB  | ~20 KB |

---

## Configuration

### Key Kconfig Options (prj.conf)

```conf
# USB CDC Console
CONFIG_USB_DEVICE_STACK_NEXT=y
CONFIG_USBD_CDC_ACM_CLASS=y

# Logging (disable for production)
CONFIG_LOG=y
CONFIG_LOG_BACKEND_UART=y
# CONFIG_LOG_PRINTK is not set  # Keep printk() separate from logging

# Bluetooth LE
CONFIG_BT=y
CONFIG_BT_PERIPHERAL=y
CONFIG_BT_DEVICE_NAME="STINGRAY"

# IMU Sensor
CONFIG_I2C=y
CONFIG_SENSOR=y
CONFIG_LSM6DSL=y

# Settings (NVS for persistence)
CONFIG_SETTINGS=y
CONFIG_SETTINGS_NVS=y
CONFIG_FLASH=y
```

### Production Logging Configuration

For production builds, disable logging to save flash/RAM and eliminate serial interference:

```conf
# Disable all logging (printk() still works for DUMP command)
CONFIG_LOG=n
```

Or set minimal logging:

```conf
CONFIG_LOG_MODE_MINIMAL=y
CONFIG_LOG_DEFAULT_LEVEL=0
```

Benefits:

-   ~10-20 KB flash savings
-   ~8 KB RAM savings
-   Clean FIFO dumps with no log interference
-   `printk()` still functions for CSV export

---

## Project Structure

```
apps/xiao/
├── CMakeLists.txt              # Build configuration
├── prj.conf                    # Kconfig settings
├── README.md                   # This file
├── app.overlay                 # Devicetree overlay
├── src/
│   ├── main.c                  # Initialization & connection callbacks
│   ├── cmd_handler.c/h         # Serial command processor
│   ├── imu_fifo.c/h           # FIFO buffer management
│   ├── lsm6dsl_custom.c/h     # Custom IMU driver with pedometer
│   ├── led_control.c/h        # LED state management
│   ├── ble_command.c/h        # BLE Command Service
│   ├── ble_battery.c/h        # BLE Battery Service
│   ├── ble_steps.c/h          # BLE Step Counter Service (hardware pedometer)
│   └── ble_fatigue.c/h        # BLE Fatigue Service
└── scripts/
    ├── build.sh               # Incremental build
    ├── rebuild.sh             # Clean rebuild
    └── flash.sh               # UF2 flashing
```

---

## Development

### Build Scripts

```bash
# Incremental build (faster)
./scripts/build.sh

# Clean rebuild
./scripts/rebuild.sh

# Flash to device
./scripts/flash.sh
```

### VS Code Integration

Action buttons configured for one-click operations:

-   🔨 Build
-   🔄 Rebuild
-   🚀 Flash
-   📂 Open Flash Folder

### Testing

```bash
# Run automated tests
cd tools
python test_xiao_footpod.py /dev/tty.usbmodem* --standard
```

Tests verify:

-   Serial command handling
-   FIFO recording and dump
-   Data integrity
-   Buffer overflow handling

---

## Troubleshooting

### Serial Issues

**No console output:**

-   Wait 1 second after power-on for USB enumeration
-   Check USB cable supports data (not charge-only)
-   Verify port: `ls /dev/tty.usb*` on macOS/Linux

**Garbled output:**

-   Ensure 115200 baud rate
-   Disable hardware flow control

### BLE Connection

**Cannot discover device:**

-   Check device is powered and not in deep sleep
-   Bluetooth is enabled on phone/computer
-   Try resetting device (double-tap reset button)

**Connection drops:**

-   Check signal strength (RSSI)
-   Reduce distance or remove obstacles
-   Check battery level

### IMU/FIFO Issues

**No samples captured:**

-   Verify IMU initialized: check logs for "IMU initialization successful"
-   Ensure recording started: `RUN` command or BLE `CMD_RUN`

**Samples dropped:**

-   Should be 0 for normal operation
-   If >0, check for system overload
-   Reduce sample rate if needed

**DUMP shows log interference:**

-   For production, disable logging in `prj.conf`
-   Set `CONFIG_LOG=n` to eliminate all log output
-   `printk()` will still work for CSV dumps

### Hardware Pedometer

**Step count not increasing:**

-   Ensure device is moving (walking/running)
-   Pedometer requires natural step patterns
-   Check that IMU is initialized properly

**Step count resets unexpectedly:**

-   16-bit counter rolls over at 65,535 steps
-   Check for `CMD_RESET_STEPS` commands
-   Verify firmware didn't restart

---

## Performance Optimization

### FIFO Collection

-   **Current Rate**: 50 Hz (20ms interval)
-   **CPU Usage**: ~2-3% @ 64 MHz
-   **Reliability**: >99.9% (minimal dropped samples)

### BLE Throughput

-   **Command Response**: <50ms typical
-   **Statistics Updates**: Every 1 second while recording
-   **Notification Overhead**: ~1% CPU

### Battery Life

-   **Active Recording**: 8-12 hours (BLE connected, LED active)
-   **Idle (BLE connected)**: 24+ hours
-   **Deep Sleep**: Not implemented (future enhancement)

---

## Future Enhancements

-   [ ] Configurable FIFO size and sample rate
-   [ ] Real-time gesture recognition
-   [ ] Advanced fatigue algorithms
-   [ ] Flash storage for multiple recording sessions
-   [ ] Deep sleep mode for extended battery life
-   [ ] OTA firmware updates via BLE
-   [ ] Advanced pedometer features (cadence, stride length)
-   [ ] Data compression for larger datasets

---

## License

This is a development project for the XIAO BLE Sense board.

## References

-   [Zephyr RTOS Documentation](https://docs.zephyrproject.org/)
-   [XIAO BLE Sense Wiki](https://wiki.seeedstudio.com/XIAO_BLE/)
-   [nRF52840 Product Specification](https://infocenter.nordicsemi.com/pdf/nRF52840_PS_v1.7.pdf)
-   [LSM6DS3TR-C Datasheet](https://www.st.com/resource/en/datasheet/lsm6ds3tr-c.pdf)
