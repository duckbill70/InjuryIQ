# StingRay BLE Services & Characteristics Guide

**Author:** StingRay Team  
**Date:** October 26, 2025  
**Hardware:** nRF52840-based fitness sensor with LSM6DS3 IMU  
**Firmware Version:** Revision C (Optimized for real-time performance)

---

## Overview

The StingRay fitness sensor exposes **6 BLE services** providing comprehensive fitness monitoring, device control, and diagnostic capabilities. This document covers all services, their characteristics, data formats, and implementation guidelines for iOS applications.

### Quick Service Reference

| Service | Purpose | Standard | Characteristics |
|---------|---------|----------|----------------|
| [Fatigue Monitoring](#fatigue-monitoring-service) | Health analytics | Custom | 1 |
| [IMU Data](#imu-data-service) | Raw sensor data | Custom | 1 |
| [LED Control](#led-control-service) | Device state management | Custom | 1 |
| [Battery](#battery-service) | Power monitoring | Standard | 1 |
| [Step Counter](#step-counter-service) | Activity tracking | Standard | 1 |
| [Diagnostics](#diagnostic-service) | System health | Custom | 2 |

---

## Device Information

**Device Name Pattern:** `StingRay-XXXX` (where XXXX is device MAC suffix)  
**BLE Advertising:** Primary service advertised is Fatigue Monitoring  
**Connection:** Single concurrent connection supported  

---

## 1. Fatigue Monitoring Service

### Service Details
- **Service UUID:** `12345678-1234-5678-1234-56789abcdef0`
- **Type:** Custom 128-bit UUID
- **Purpose:** Advanced health analytics and fatigue detection

### Characteristics

#### Fatigue Level
- **UUID:** `12345678-1234-5678-1234-56789abcdef1`
- **Properties:** Read, Notify
- **Data Type:** `uint8_t` (1 byte)
- **Range:** 0-100 (percentage)
- **Description:** Current fatigue level based on IMU analysis
- **Update Frequency:** Real-time during active modes

**iOS Implementation:**
```swift
let fatigueServiceUUID = CBUUID(string: "12345678-1234-5678-1234-56789abcdef0")
let fatigueCharUUID = CBUUID(string: "12345678-1234-5678-1234-56789abcdef1")

func parseFatigueLevel(_ data: Data) -> UInt8 {
    return data.first ?? 0
}
```

---

## 2. IMU Data Service

### Service Details
- **Service UUID:** `abcdef01-2345-6789-abcd-ef0123456789`
- **Type:** Custom 128-bit UUID  
- **Purpose:** Raw 6-axis sensor data streaming (accelerometer + gyroscope)

### Characteristics

#### Raw IMU Data
- **UUID:** `abcdef01-2345-6789-abcd-ef0123456790`
- **Properties:** Read, Notify
- **Data Type:** 6 × `float` (24 bytes total)
- **Format:** `[ax, ay, az, gx, gy, gz]`
- **Units:** 
  - Accelerometer: g-force (±4g range)
  - Gyroscope: degrees/second (±500°/s range)
- **Update Rate:** Up to 50Hz (throttled based on BLE capacity)

**Data Structure:**
```
Bytes 0-3:   ax (float) - X-axis acceleration
Bytes 4-7:   ay (float) - Y-axis acceleration  
Bytes 8-11:  az (float) - Z-axis acceleration
Bytes 12-15: gx (float) - X-axis angular velocity
Bytes 16-19: gy (float) - Y-axis angular velocity
Bytes 20-23: gz (float) - Z-axis angular velocity
```

**iOS Implementation:**
```swift
let imuServiceUUID = CBUUID(string: "abcdef01-2345-6789-abcd-ef0123456789")
let imuCharUUID = CBUUID(string: "abcdef01-2345-6789-abcd-ef0123456790")

struct IMUData {
    let ax, ay, az: Float  // Accelerometer (g-force)
    let gx, gy, gz: Float  // Gyroscope (°/s)
    
    init?(from data: Data) {
        guard data.count == 24 else { return nil }
        
        ax = data.subdata(in: 0..<4).withUnsafeBytes { $0.load(as: Float.self) }
        ay = data.subdata(in: 4..<8).withUnsafeBytes { $0.load(as: Float.self) }
        az = data.subdata(in: 8..<12).withUnsafeBytes { $0.load(as: Float.self) }
        gx = data.subdata(in: 12..<16).withUnsafeBytes { $0.load(as: Float.self) }
        gy = data.subdata(in: 16..<20).withUnsafeBytes { $0.load(as: Float.self) }
        gz = data.subdata(in: 20..<24).withUnsafeBytes { $0.load(as: Float.self) }
    }
}
```

---

## 3. LED Control Service

### Service Details
- **Service UUID:** `19B10010-E8F2-537E-4F6C-D104768A1214`
- **Type:** Custom 128-bit UUID
- **Purpose:** Device operational state control and power management

### Characteristics

#### LED Mode Control
- **UUID:** `19B10010-E8F2-537E-4F6C-D104768A1215`
- **Properties:** Read, Write, Notify
- **Data Type:** `uint8_t` (1 byte)
- **Description:** Controls device operational mode and LED behavior

### LED Mode Values

| Value | Mode | LED Behavior | Power Mode | Data Transmission |
|-------|------|-------------|------------|------------------|
| 0 | `LED_AMBER` | Solid amber | Standby | Battery monitoring only |
| 1 | `LED_PULSE_RED` | Pulsing red | Active | Full IMU + fatigue data |
| 2 | `LED_PULSE_GREEN` | Pulsing green | Active | Full IMU + fatigue data |
| 3 | `LED_PULSE_BLUE` | Pulsing blue | Active | Full IMU + fatigue data |
| 4 | `LED_SOLID_RED` | Solid red | Active | Full IMU + fatigue data |
| 5 | `LED_SOLID_GREEN` | Solid green | Active | Full IMU + fatigue data |
| 6 | `LED_SOLID_BLUE` | Solid blue | Active | Full IMU + fatigue data |
| 10 | `LED_OFF` | All LEDs off | Low power | No transmission, step reset |

**iOS Implementation:**
```swift
let ledServiceUUID = CBUUID(string: "19B10010-E8F2-537E-4F6C-D104768A1214")
let ledCharUUID = CBUUID(string: "19B10010-E8F2-537E-4F6C-D104768A1215")

enum LEDMode: UInt8 {
    case amber = 0
    case pulseRed = 1, pulseGreen = 2, pulseBlue = 3
    case solidRed = 4, solidGreen = 5, solidBlue = 6
    case off = 10
    
    var isActive: Bool {
        return (1...6).contains(rawValue)
    }
    
    var description: String {
        switch self {
        case .amber: return "Standby"
        case .pulseRed, .pulseGreen, .pulseBlue,
             .solidRed, .solidGreen, .solidBlue: return "Active"
        case .off: return "Low Power"
        default: return "Unknown"
        }
    }
}

func setLEDMode(_ mode: LEDMode, peripheral: CBPeripheral, characteristic: CBCharacteristic) {
    let data = Data([mode.rawValue])
    peripheral.writeValue(data, for: characteristic, type: .withResponse)
}
```

---

## 4. Battery Service

### Service Details
- **Service UUID:** `180F` (Standard Bluetooth SIG)
- **Type:** Standard 16-bit UUID
- **Purpose:** Battery level monitoring

### Characteristics

#### Battery Level
- **UUID:** `2A19` (Standard Bluetooth SIG)
- **Properties:** Read, Notify
- **Data Type:** `uint8_t` (1 byte)
- **Range:** 0-100 (percentage)
- **Description:** Current battery charge level
- **Update Frequency:** Every 60 seconds in active modes

**iOS Implementation:**
```swift
let batteryServiceUUID = CBUUID(string: "180F")
let batteryLevelCharUUID = CBUUID(string: "2A19")

func parseBatteryLevel(_ data: Data) -> UInt8 {
    return data.first ?? 0
}
```

---

## 5. Step Counter Service

### Service Details
- **Service UUID:** `1814` (Running Speed and Cadence - Standard)
- **Type:** Standard 16-bit UUID
- **Purpose:** Activity and step counting

### Characteristics

#### Step Count
- **UUID:** `2A53` (RSC Feature - repurposed for step count)
- **Properties:** Read, Notify
- **Data Type:** `uint32_t` (4 bytes, little-endian)
- **Range:** 0 to 4,294,967,295 steps
- **Description:** Cumulative step count since last reset
- **Reset Conditions:** Device enters `LED_OFF` mode

**iOS Implementation:**
```swift
let stepServiceUUID = CBUUID(string: "1814")
let stepCountCharUUID = CBUUID(string: "2A53")

func parseStepCount(_ data: Data) -> UInt32 {
    guard data.count == 4 else { return 0 }
    return data.withUnsafeBytes { $0.load(as: UInt32.self) }
}
```

---

## 6. Diagnostic Service

### Service Details
- **Service UUID:** `87654321-4321-8765-4321-210987654321`
- **Type:** Custom 128-bit UUID
- **Purpose:** System health monitoring, error reporting, and performance analysis

### Characteristics

#### 6.1 Error Code
- **UUID:** `87654321-4321-8765-4321-210987654322`
- **Properties:** Read, Notify
- **Data Type:** `uint8_t` (1 byte)
- **Description:** Most recent error code
- **Update Frequency:** Immediate (event-driven)

#### 6.2 System Status
- **UUID:** `87654321-4321-8765-4321-210987654325`
- **Properties:** Read, Notify
- **Data Type:** 36-byte packed struct
- **Description:** Comprehensive system status with performance metrics
- **Update Frequency:** Every 10 seconds

### Error Codes Reference

| Code | Name | Description |
|------|------|-------------|
| 0 | `ERR_NONE` | No error |
| 1 | `ERR_IMU_INIT_FAIL` | IMU initialization failed |
| 2 | `ERR_IMU_READ_FAIL` | IMU data read failure |
| 3 | `ERR_BLE_INIT_FAIL` | BLE initialization failed |
| 4 | `ERR_BLE_CONN_LOST` | BLE connection lost |
| 5 | `ERR_FLASH_WRITE_FAIL` | Flash write verification failed |
| 6 | `ERR_FLASH_READ_FAIL` | Flash read/validation failed |
| 7 | `ERR_BATTERY_READ_FAIL` | Battery ADC read failure |
| 8 | `ERR_LOW_BATTERY` | Battery critically low (≤ 5%) |
| 9 | `ERR_SYSTEM_OVERLOAD` | System performance degraded |
| 10 | `ERR_WATCHDOG_RESET` | Watchdog timer triggered reset |
| 11 | `ERR_SERIAL_DEBUG_ENABLED` | Serial debug mode enabled |
| 12 | `ERR_TENSORFLOW_DISABLED` | TensorFlow inference disabled |
| 13 | `ERR_BLE_CONN_TIMEOUT` | Connection supervision timeout |
| 14 | `ERR_BLE_RSSI_LOW` | Signal strength too low |
| 15 | `ERR_BLE_MTU_FAIL` | MTU negotiation failed |
| 16 | `ERR_BLE_WRITE_FAIL` | BLE characteristic write failed |
| 17 | `ERR_BLE_BACKPRESSURE` | BLE transmission backpressure |
| 255 | `ERR_UNKNOWN` | Unknown/unclassified error |

### System Status Structure (36 bytes)

| Bytes | Field | Type | Description |
|-------|-------|------|-------------|
| 0 | `bleStatus` | uint8_t | BLE status (0=unavailable, 1=available, 2=connected) |
| 1 | `imuStatus` | uint8_t | IMU status (0=failed, 1=ready) |
| 2 | `ledMode` | uint8_t | Current LED mode (see LED Mode Values) |
| 3 | `batteryLevel` | uint8_t | Battery percentage (0-100%) |
| 4-7 | `uptime` | uint32_t | System uptime in seconds |
| 8-11 | `imuSamplesSent` | uint32_t | IMU samples successfully transmitted |
| 12-15 | `imuSamplesDropped` | uint32_t | IMU samples dropped due to throttling |
| 16-19 | `totalErrorCount` | uint32_t | Total errors since last clear |
| 20-23 | `totalDisconnectCount` | uint32_t | Total BLE disconnections recorded |
| 24-27 | `bleWriteFailures` | uint32_t | Failed BLE write operations |
| 28-31 | `maxLoopTime` | uint32_t | Maximum loop execution time (ms) |
| 32-35 | `reserved` | uint8_t[4] | Reserved for future use |

**iOS Implementation:**
```swift
let diagnosticServiceUUID = CBUUID(string: "87654321-4321-8765-4321-210987654321")
let errorCodeCharUUID = CBUUID(string: "87654321-4321-8765-4321-210987654322")
let systemStatusCharUUID = CBUUID(string: "87654321-4321-8765-4321-210987654325")

struct SystemStatus {
    let bleStatus: UInt8
    let imuStatus: UInt8
    let ledMode: UInt8
    let batteryLevel: UInt8
    let uptime: UInt32
    let imuSamplesSent: UInt32
    let imuSamplesDropped: UInt32
    let totalErrorCount: UInt32
    let totalDisconnectCount: UInt32
    let bleWriteFailures: UInt32
    let maxLoopTime: UInt32
    let reserved: (UInt8, UInt8, UInt8, UInt8)
    
    init?(from data: Data) {
        guard data.count == 36 else { return nil }
        
        bleStatus = data[0]
        imuStatus = data[1]
        ledMode = data[2]
        batteryLevel = data[3]
        uptime = data.subdata(in: 4..<8).withUnsafeBytes { $0.load(as: UInt32.self) }
        imuSamplesSent = data.subdata(in: 8..<12).withUnsafeBytes { $0.load(as: UInt32.self) }
        imuSamplesDropped = data.subdata(in: 12..<16).withUnsafeBytes { $0.load(as: UInt32.self) }
        totalErrorCount = data.subdata(in: 16..<20).withUnsafeBytes { $0.load(as: UInt32.self) }
        totalDisconnectCount = data.subdata(in: 20..<24).withUnsafeBytes { $0.load(as: UInt32.self) }
        bleWriteFailures = data.subdata(in: 24..<28).withUnsafeBytes { $0.load(as: UInt32.self) }
        maxLoopTime = data.subdata(in: 28..<32).withUnsafeBytes { $0.load(as: UInt32.self) }
        reserved = (data[32], data[33], data[34], data[35])
    }
    
    // Computed properties for analysis
    var imuEfficiency: Double {
        let total = imuSamplesSent + imuSamplesDropped
        return total > 0 ? Double(imuSamplesSent) / Double(total) * 100.0 : 100.0
    }
    
    var bleEfficiency: Double {
        let totalWrites = imuSamplesSent + bleWriteFailures
        return totalWrites > 0 ? Double(imuSamplesSent) / Double(totalWrites) * 100.0 : 100.0
    }
    
    var isHealthy: Bool {
        return bleStatus == 2 && imuStatus == 1 && batteryLevel > 10 && maxLoopTime < 75
    }
    
    var performanceGrade: String {
        if maxLoopTime < 20 { return "Excellent" }
        else if maxLoopTime < 50 { return "Good" }
        else if maxLoopTime < 75 { return "Fair" }
        else { return "Poor" }
    }
    
    var disconnectRate: Double {
        return uptime > 0 ? Double(totalDisconnectCount) / (Double(uptime) / 3600.0) : 0.0 // per hour
    }
}

func parseErrorCode(_ data: Data) -> UInt8 {
    return data.first ?? 0
}

func getErrorDescription(_ errorCode: UInt8) -> String {
    switch errorCode {
    case 0: return "No Error"
    case 1: return "IMU Initialization Failed"
    case 2: return "IMU Data Read Failure"
    case 3: return "BLE Initialization Failed"
    case 4: return "BLE Connection Lost"
    case 5: return "Flash Write Failed"
    case 6: return "Flash Read Failed"
    case 7: return "Battery Read Failed"
    case 8: return "Low Battery"
    case 9: return "System Overload"
    case 10: return "Watchdog Reset"
    case 11: return "Serial Debug Enabled"
    case 12: return "TensorFlow Disabled"
    case 13: return "BLE Connection Timeout"
    case 14: return "Signal Strength Too Low"
    case 15: return "MTU Negotiation Failed"
    case 16: return "BLE Write Failed"
    case 17: return "BLE Backpressure Detected"
    case 255: return "Unknown Error"
    default: return "Undefined Error (\(errorCode))"
    }
}
```

---

## Implementation Guidelines

### Service Discovery
```swift
let serviceUUIDs = [
    CBUUID(string: "12345678-1234-5678-1234-56789abcdef0"), // Fatigue
    CBUUID(string: "abcdef01-2345-6789-abcd-ef0123456789"), // IMU
    CBUUID(string: "19B10010-E8F2-537E-4F6C-D104768A1214"), // LED Control
    CBUUID(string: "180F"),                                  // Battery
    CBUUID(string: "1814"),                                  // Step Counter
    CBUUID(string: "87654321-4321-8765-4321-210987654321")  // Diagnostics
]

func discoverServices() {
    peripheral.discoverServices(serviceUUIDs)
}
```

### Notification Management
```swift
func enableNotifications(for peripheral: CBPeripheral) {
    // Essential notifications for real-time data
    peripheral.setNotifyValue(true, for: fatigueCharacteristic)
    peripheral.setNotifyValue(true, for: imuRawCharacteristic)
    peripheral.setNotifyValue(true, for: ledCharacteristic)
    peripheral.setNotifyValue(true, for: batteryLevelCharacteristic)
    peripheral.setNotifyValue(true, for: stepCountCharacteristic)
    
    // Diagnostic notifications
    peripheral.setNotifyValue(true, for: errorCodeCharacteristic)
    peripheral.setNotifyValue(true, for: systemStatusCharacteristic)
}
```

### Data Rate Considerations
- **IMU Data:** Up to 50Hz (high bandwidth - consider selective notification)
- **Fatigue:** Variable rate based on analysis
- **System Status:** Every 10 seconds
- **Error Codes:** Event-driven (immediate)
- **Battery/Steps:** Low frequency updates

### Power Management Integration
```swift
func setDeviceMode(_ mode: LEDMode) {
    switch mode {
    case .amber:
        // Standby mode - battery monitoring only
        disableHighFrequencyNotifications()
        
    case .pulseRed, .pulseGreen, .pulseBlue, .solidRed, .solidGreen, .solidBlue:
        // Active mode - full data streaming
        enableAllNotifications()
        
    case .off:
        // Low power mode - minimal activity
        disableAllNotifications()
    }
}
```

---

## Performance Analysis

### Expected Performance Metrics
- **IMU Rate:** 37-39Hz actual (74-78% efficiency)
- **BLE Write Success:** >99% success rate
- **Loop Time:** <75ms for healthy operation
- **Battery Life:** 8-12 hours in active mode

### Health Indicators
- **Good Performance:** IMU efficiency >70%, BLE efficiency >95%, maxLoopTime <50ms
- **Degraded Performance:** IMU efficiency 50-70%, maxLoopTime 50-75ms
- **Poor Performance:** IMU efficiency <50%, maxLoopTime >75ms

### Troubleshooting
- **High disconnect rate:** Check RSSI levels and environmental interference
- **Low IMU efficiency:** System overload or BLE congestion
- **High error count:** Hardware issues or firmware problems
- **High loop time:** CPU overload or blocking operations

---

## Device-Specific Features

### Error Management
- **50-entry error history buffer** (device-side storage)
- **Automatic error clearing** when entering LED_OFF mode
- **Error deduplication** with occurrence counting
- **Real-time error code notifications**

### BLE Connection Monitoring
- **10-entry disconnect history** with cause classification
- **Automatic reconnection** capability
- **Connection quality metrics** (RSSI, duration, etc.)
- **Performance correlation** with disconnection events

### Flash Memory Optimization
- **Step count persistence** (saved every 50 steps)
- **Reduced write cycles** for extended device lifetime
- **Graceful degradation** on flash failures

---

*For detailed diagnostic service implementation, see the companion document: [StingRay_Diagnostic_Service_iOS_Guide.txt](./StingRay_Diagnostic_Service_iOS_Guide.txt)*