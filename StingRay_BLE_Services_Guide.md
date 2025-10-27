# StingRay BLE Services & Characteristics Guide

**Author:** StingRay Team  
**Date:** October 26, 2025  
**Hardware:** nRF52840-based fitness sensor with LSM6DS3 IMU  
**Firmware Version:** Revision D (FIFO-based training data collection)

---

## Overview

The StingRay fitness sensor exposes **6 BLE services** providing comprehensive fitness monitoring, device control, and diagnostic capabilities. This document covers all services, their characteristics, data formats, and implementation guidelines for iOS applications.

**Major Update:** IMU data is no longer streamed over BLE. Instead, data is collected in a configurable FIFO buffer for TensorFlow model training and exported via Serial interface.

### Quick Service Reference

| Service | Purpose | Standard | Characteristics |
|---------|---------|----------|----------------|
| [Fatigue Monitoring](#fatigue-monitoring-service) | Health analytics | Custom | 1 |
| [Statistics](#statistics-service) | FIFO monitoring & config | Custom | 3 |
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

## 2. Statistics Service

### Service Details
- **Service UUID:** `fedcba98-7654-3210-fedc-ba9876543210`
- **Type:** Custom 128-bit UUID  
- **Purpose:** FIFO buffer monitoring, configuration, and training data management

**Note:** This service replaces the previous IMU Data Service. Raw sensor data is now collected in a configurable FIFO buffer for TensorFlow model training instead of real-time streaming.

### Characteristics

#### 2.1 FIFO Statistics
- **UUID:** `fedcba98-7654-3210-fedc-ba9876543211`
- **Properties:** Read, Notify
- **Data Type:** 32-byte packed struct
- **Description:** Real-time FIFO buffer status and system performance
- **Update Frequency:** Every 10 seconds

**Data Structure:**
```
Bytes 0-3:   currentSize (uint32_t) - Current samples in FIFO
Bytes 4-7:   maxSamples (uint32_t) - Maximum FIFO capacity
Bytes 8-11:  totalSamples (uint32_t) - Total samples collected
Bytes 12-15: overflowCount (uint32_t) - Samples lost due to overflow
Bytes 16-19: collectionRate (uint32_t) - Actual collection rate (Hz)
Bytes 20-23: memoryUsedKB (uint32_t) - Memory used by FIFO (KB)
Bytes 24-27: uptimeSeconds (uint32_t) - System uptime
Bytes 28-31: systemLoad (uint8_t) - System load percentage (0-100%)
```

#### 2.2 FIFO Configuration  
- **UUID:** `fedcba98-7654-3210-fedc-ba9876543212`
- **Properties:** Read, Write
- **Data Type:** 12-byte packed struct (enhanced)
- **Description:** Runtime configuration of FIFO parameters
- **Validation:** capacityMinutes (1-60), collectionFreqHz (1-200), timerIntervalMs (5-100 or 0=auto)

**Data Structure:**
```
Bytes 0-3:  capacityMinutes (uint32_t) - Buffer duration in minutes
Bytes 4-7:  collectionFreqHz (uint32_t) - Collection frequency in Hz
Bytes 8-11: timerIntervalMs (uint32_t) - Timer override (0=auto-calculate)
```

#### 2.3 FIFO Dump Request
- **UUID:** `fedcba98-7654-3210-fedc-ba9876543213`
- **Properties:** Write
- **Data Type:** `uint8_t` (1 byte)
- **Description:** Trigger Serial dump of collected data
- **Security:** Only functional when device is in LED_AMBER mode
- **Command:** Write `1` to trigger dump

#### 2.4 FIFO Tuning Parameters *(NEW)*
- **UUID:** `fedcba98-7654-3210-fedc-ba9876543214`
- **Properties:** Read, Write
- **Data Type:** 8-byte packed struct
- **Description:** Advanced tuning parameters for optimization
- **Purpose:** Real-time performance tuning without firmware updates

**Data Structure:**
```
Bytes 0-1: debugLevel (uint16_t) - Debug verbosity (0=none, 1=normal, 2=verbose)
Bytes 2-3: autoOptimize (uint16_t) - Auto optimization (0=off, 1=on)
Bytes 4-5: compressionMode (uint16_t) - Compression mode (0=none, 1=delta+fixed, 2=advanced)
Bytes 6-7: reserved (uint16_t) - Reserved for future use
```

**iOS Implementation:**
```swift
let statisticsServiceUUID = CBUUID(string: "fedcba98-7654-3210-fedc-ba9876543210")
let fifoStatsCharUUID = CBUUID(string: "fedcba98-7654-3210-fedc-ba9876543211")
let fifoConfigCharUUID = CBUUID(string: "fedcba98-7654-3210-fedc-ba9876543212")
let fifoDumpCharUUID = CBUUID(string: "fedcba98-7654-3210-fedc-ba9876543213")

struct FIFOStatistics {
    let currentSize: UInt32
    let maxSamples: UInt32
    let totalSamples: UInt32
    let overflowCount: UInt32
    let collectionRate: UInt32
    let memoryUsedKB: UInt32
    let uptimeSeconds: UInt32
    let systemLoad: UInt8
    
    init?(from data: Data) {
        guard data.count == 32 else { return nil }
        
        currentSize = data.subdata(in: 0..<4).withUnsafeBytes { $0.load(as: UInt32.self) }
        maxSamples = data.subdata(in: 4..<8).withUnsafeBytes { $0.load(as: UInt32.self) }
        totalSamples = data.subdata(in: 8..<12).withUnsafeBytes { $0.load(as: UInt32.self) }
        overflowCount = data.subdata(in: 12..<16).withUnsafeBytes { $0.load(as: UInt32.self) }
        collectionRate = data.subdata(in: 16..<20).withUnsafeBytes { $0.load(as: UInt32.self) }
        memoryUsedKB = data.subdata(in: 20..<24).withUnsafeBytes { $0.load(as: UInt32.self) }
        uptimeSeconds = data.subdata(in: 24..<28).withUnsafeBytes { $0.load(as: UInt32.self) }
        systemLoad = data[28]
    }
    
    // Computed properties
    var fillPercentage: Double {
        return maxSamples > 0 ? Double(currentSize) / Double(maxSamples) * 100.0 : 0.0
    }
    
    var overflowRate: Double {
        return totalSamples > 0 ? Double(overflowCount) / Double(totalSamples) * 100.0 : 0.0
    }
    
    var estimatedRemainingMinutes: Double {
        let samplesRemaining = maxSamples - currentSize
        return collectionRate > 0 ? Double(samplesRemaining) / Double(collectionRate) / 60.0 : 0.0
    }
    
    var isHealthy: Bool {
        return systemLoad < 80 && overflowRate < 5.0
    }
}

struct FIFOConfiguration {
    let capacityMinutes: UInt32
    let collectionFreqHz: UInt32
    
    var asData: Data {
        var data = Data()
        withUnsafeBytes(of: capacityMinutes) { data.append(contentsOf: $0) }
        withUnsafeBytes(of: collectionFreqHz) { data.append(contentsOf: $0) }
        return data
    }
    
    init?(from data: Data) {
        guard data.count == 8 else { return nil }
        capacityMinutes = data.subdata(in: 0..<4).withUnsafeBytes { $0.load(as: UInt32.self) }
        collectionFreqHz = data.subdata(in: 4..<8).withUnsafeBytes { $0.load(as: UInt32.self) }
    }
    
    // Validation
    var isValid: Bool {
        return (1...60).contains(capacityMinutes) && (1...200).contains(collectionFreqHz)
    }
    
    // Memory estimation
    var estimatedMemoryKB: UInt32 {
        let samplesTotal = capacityMinutes * 60 * collectionFreqHz
        return (samplesTotal * 28) / 1024  // 28 bytes per IMU sample with timestamp
    }
}

// Configuration functions
func configureFIFO(minutes: UInt32, frequencyHz: UInt32, peripheral: CBPeripheral, characteristic: CBCharacteristic) {
    let config = FIFOConfiguration(capacityMinutes: minutes, collectionFreqHz: frequencyHz)
    guard config.isValid else { 
        print("Invalid FIFO configuration: minutes=\(minutes), Hz=\(frequencyHz)")
        return 
    }
    
    peripheral.writeValue(config.asData, for: characteristic, type: .withResponse)
}

func requestFIFODump(peripheral: CBPeripheral, characteristic: CBCharacteristic) {
    let command = Data([1])
    peripheral.writeValue(command, for: characteristic, type: .withResponse)
}
```

### Training Data Export

When FIFO dump is triggered (device must be in LED_AMBER mode), data is exported to Serial in CSV format:

```
FIFO_DUMP_START
Samples: 19800
Timestamp,AccelX,AccelY,AccelZ,GyroX,GyroY,GyroZ
1609459200000,1.234567,-0.987654,9.876543,0.123456,-0.654321,0.987654
1609459200015,1.245678,-0.976543,9.865432,0.134567,-0.643210,0.976543
...
FIFO_DUMP_END
```

**Usage for TensorFlow Training:**
1. Configure FIFO parameters via BLE
2. Collect data in active modes (LED_PULSE_* or LED_SOLID_*)
3. Monitor collection progress via Statistics service
4. Switch to LED_AMBER mode
5. Trigger dump via BLE command
6. Capture Serial output for training dataset

---

## 3. LED Control Service

### Service Details
- **Service UUID:** `19B10010-E8F2-537E-4F6C-D104768A1214`
- **Type:** Custom 128-bit UUID
- **Purpose:** Device operational state control and power management
- **Alternative Control:** Serial commands (`LED <mode>`, `MODE <mode>`, `LED_STATUS`)

### Characteristics

#### LED Mode Control
- **UUID:** `19B10010-E8F2-537E-4F6C-D104768A1215`
- **Properties:** Read, Write, Notify
- **Data Type:** `uint8_t` (1 byte)
- **Description:** Controls device operational mode and LED behavior
- **Serial Alternative:** `LED <mode>` or `MODE <mode>` commands via USB serial

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
| 17 | `ERR_FIFO_ALLOC_FAIL` | FIFO memory allocation failed |
| 18 | `ERR_FIFO_NOT_INITIALIZED` | FIFO not properly initialized |
| 19 | `ERR_FIFO_OVERFLOW` | FIFO buffer overflow |
| 255 | `ERR_UNKNOWN` | Unknown/unclassified error |

### System Status Structure (36 bytes)

| Bytes | Field | Type | Description |
|-------|-------|------|-------------|
| 0 | `bleStatus` | uint8_t | BLE status (0=unavailable, 1=available, 2=connected) |
| 1 | `imuStatus` | uint8_t | IMU status (0=failed, 1=ready) |
| 2 | `ledMode` | uint8_t | Current LED mode (see LED Mode Values) |
| 3 | `batteryLevel` | uint8_t | Battery percentage (0-100%) |
| 4-7 | `uptime` | uint32_t | System uptime in seconds |
| 8-11 | `fifoTotalSamples` | uint32_t | Total FIFO samples collected |
| 12-15 | `fifoCurrentSize` | uint32_t | Current FIFO buffer size |
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
        fifoTotalSamples = data.subdata(in: 8..<12).withUnsafeBytes { $0.load(as: UInt32.self) }
        fifoCurrentSize = data.subdata(in: 12..<16).withUnsafeBytes { $0.load(as: UInt32.self) }
        totalErrorCount = data.subdata(in: 16..<20).withUnsafeBytes { $0.load(as: UInt32.self) }
        totalDisconnectCount = data.subdata(in: 20..<24).withUnsafeBytes { $0.load(as: UInt32.self) }
        bleWriteFailures = data.subdata(in: 24..<28).withUnsafeBytes { $0.load(as: UInt32.self) }
        maxLoopTime = data.subdata(in: 28..<32).withUnsafeBytes { $0.load(as: UInt32.self) }
        reserved = (data[32], data[33], data[34], data[35])
    }
    
    // Computed properties for analysis
    var fifoFillPercentage: Double {
        return fifoCurrentSize > 0 ? Double(fifoCurrentSize) / Double(fifoTotalSamples) * 100.0 : 0.0
    }
    
    var bleEfficiency: Double {
        let totalWrites = fifoTotalSamples + bleWriteFailures
        return totalWrites > 0 ? Double(fifoTotalSamples) / Double(totalWrites) * 100.0 : 100.0
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
    case 17: return "FIFO Memory Allocation Failed"
    case 18: return "FIFO Not Initialized"
    case 19: return "FIFO Buffer Overflow"
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
    CBUUID(string: "fedcba98-7654-3210-fedc-ba9876543210"), // Statistics (FIFO)
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
    peripheral.setNotifyValue(true, for: fifoStatsCharacteristic)
    peripheral.setNotifyValue(true, for: ledCharacteristic)
    peripheral.setNotifyValue(true, for: batteryLevelCharacteristic)
    peripheral.setNotifyValue(true, for: stepCountCharacteristic)
    
    // Diagnostic notifications
    peripheral.setNotifyValue(true, for: errorCodeCharacteristic)
    peripheral.setNotifyValue(true, for: systemStatusCharacteristic)
}
```

### Data Rate Considerations
- **FIFO Statistics:** Every 10 seconds
- **Fatigue:** Variable rate based on analysis
- **System Status:** Every 10 seconds
- **Error Codes:** Event-driven (immediate)
- **Battery/Steps:** Low frequency updates

**Note:** FIFO collection operates independently of BLE notifications, providing consistent training data regardless of connection status.

### Power Management Integration
```swift
func setDeviceMode(_ mode: LEDMode) {
    switch mode {
    case .amber:
        // Standby mode - battery monitoring only
        disableHighFrequencyNotifications()
        
    case .pulseRed, .pulseGreen, .pulseBlue, .solidRed, .solidGreen, .solidBlue:
        // Active mode - full data collection and BLE monitoring
        enableAllNotifications()
        // FIFO collection starts automatically
        
    case .off:
        // Low power mode - minimal activity
        disableAllNotifications()
    }
}
```

---

## Performance Analysis

### Expected Performance Metrics
- **FIFO Collection:** 66Hz default (configurable 1-200Hz)
- **BLE Write Success:** >99% success rate for control commands
- **Loop Time:** <25ms for healthy operation  
- **Memory Usage:** ~1.9MB for 5min @ 66Hz collection
- **Battery Life:** 8-12 hours in active mode (improved without BLE streaming)

### Health Indicators
- **Good Performance:** FIFO collection rate >95% of target, system load <50%
- **Degraded Performance:** Collection rate 80-95%, system load 50-80%
- **Poor Performance:** Collection rate <80%, system load >80%

### Troubleshooting
- **High disconnect rate:** Check RSSI levels and environmental interference
- **FIFO overflow:** Reduce collection frequency or increase buffer size
- **High error count:** Hardware issues or memory allocation problems
- **High loop time:** System overload or blocking operations

---

## FIFO-Based Training Workflow

### 1. Configuration Phase
```swift
// Configure FIFO for 10 minutes at 50Hz collection
configureFIFO(minutes: 10, frequencyHz: 50, peripheral: peripheral, characteristic: fifoConfigChar)

// Monitor configuration acknowledgment
func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if characteristic.uuid == fifoStatsCharUUID {
        guard let stats = FIFOStatistics(from: characteristic.value!) else { return }
        print("FIFO configured: \(stats.maxSamples) samples, \(stats.memoryUsedKB)KB")
    }
}
```

### 2. Data Collection Phase
```swift
// Start collection by activating device
setLEDMode(.pulseGreen, peripheral: peripheral, characteristic: ledChar)

// Monitor collection progress
func monitorCollection() {
    // Statistics updates every 10 seconds
    if let stats = currentFIFOStats {
        print("Collection: \(stats.currentSize)/\(stats.maxSamples) (\(stats.fillPercentage)%)")
        print("Rate: \(stats.collectionRate)Hz, Overflow: \(stats.overflowCount)")
        
        if stats.fillPercentage > 90 {
            print("FIFO nearly full - prepare for data export")
        }
    }
}
```

### 3. Data Export Phase
```swift
// Switch to amber mode for safe data export
setLEDMode(.amber, peripheral: peripheral, characteristic: ledChar)

// Wait for mode change confirmation, then trigger dump
DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
    requestFIFODump(peripheral: peripheral, characteristic: fifoDumpChar)
    print("FIFO dump requested - monitor Serial output")
}
```

### 4. Training Data Processing
The exported CSV data is ready for TensorFlow preprocessing:

```python
import pandas as pd
import numpy as np

# Load exported FIFO data
data = pd.read_csv('fifo_dump.csv')

# Convert timestamp to relative time
data['time_sec'] = (data['Timestamp'] - data['Timestamp'].iloc[0]) / 1000.0

# Create feature windows for model training
def create_windows(df, window_size=100, overlap=50):
    windows = []
    for i in range(0, len(df) - window_size, window_size - overlap):
        window = df.iloc[i:i+window_size]
        windows.append(window[['AccelX', 'AccelY', 'AccelZ', 'GyroX', 'GyroY', 'GyroZ']].values)
    return np.array(windows)

# Prepare for TensorFlow training
feature_windows = create_windows(data)
print(f"Generated {len(feature_windows)} training windows")
```

---

### Flash Memory Optimization
- **Step count persistence** (saved every 50 steps)
- **FIFO configuration persistence** (survives power cycles)
- **Reduced write cycles** for extended device lifetime
- **Graceful degradation** on flash failures

### FIFO Memory Management
- **Dynamic allocation** based on configuration
- **Circular buffer operation** with automatic overflow handling
- **Memory efficiency** optimized for training data collection
- **Real-time monitoring** of memory usage and collection rates

---

*For detailed FIFO training workflow and TensorFlow integration, see the companion document: [StingRay_FIFO_Training_Guide.md](./StingRay_FIFO_Training_Guide.md)*