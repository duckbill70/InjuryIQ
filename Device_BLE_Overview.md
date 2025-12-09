## BLE Command List

The following commands are sent by writing the command code (and optional parameter) to the Command State characteristic. The device responds with notifications on state change and, for some commands, with additional result/status notifications. Some commands are only allowed when not recording (STOP state).

| Command Name | Code | How to Use (Write Value) | Description                                                                                                    |
| ------------ | ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| STOP         | 0    | 0                        | Stop recording. Clears FIFO buffer. Notifies state change.                                                     |
| RUN          | 1    | 1                        | Start recording (step counting, data collection). FIFO is cleared and started fresh. Notifies state change.    |
| STOP_SNAP    | 2    | 2                        | Stop recording and capture a snapshot (if FIFO has data), then clear FIFO. Notifies state change.              |
| RESET        | 3    | 3                        | Reset device state and clear FIFO. Not allowed while recording. Notifies state change and stats.               |
| DUMP         | 4    | 4                        | Dump FIFO buffer to serial (for diagnostics). Not allowed while recording. Notifies state change.              |
| LOC_RED      | 5    | 5                        | Set device location to RED (for LED/indicator). Not allowed while recording. Notifies state and location.      |
| LOC_GREEN    | 6    | 6                        | Set device location to GREEN. Not allowed while recording. Notifies state and location.                        |
| RESET_STEPS  | 7    | 7                        | Reset the step counter. Not allowed while recording. Notifies state.                                           |
| IMU_TEST     | 8    | 8                        | Read and log current IMU data (for diagnostics). Not allowed while recording. Notifies state.                  |
| FIFO_STATS   | 9    | 9                        | Log FIFO buffer statistics to RTT (debug). Notifies state.                                                     |
| LOCATION     | 10   | 10                       | Show current location color for 5 seconds, then restore. Not allowed while recording. Notifies state.          |
| SNAPSHOT     | 11   | 11                       | Capture FIFO snapshot to flash (requires FIFO to be full). Can be used while recording. Notifies state.        |
| SNAP_DELETE  | 12   | 12 + param (index/0xFF)  | Delete snapshot(s). Param: 0-2 for slot, 0xFF for all. Not allowed while recording. Notifies state and result. |
| SNAP_DUMP    | 13   | 13 + param (index/0xFF)  | Dump snapshot(s) to serial. Param: 0-2 for slot, 0xFF for all. Not allowed while recording. Notifies state.    |

# Device BLE Overview and Command Reference

## Document Version

-   **Version:** 1.0
-   **Date:** 1 December 2025
-   **Firmware:** Zephyr RTOS on nRF52840
-   **Change Log:**
    -   v1.0: Initial documentation with full BLE protocol, state machine, and memory layout

## Device Overview

This device runs Zephyr RTOS on nRF52840 and exposes several BLE GATT services for use by a companion iOS app. It supports step counting, fatigue monitoring, snapshot management, runtime statistics, and command control. All communication is via BLE characteristics, using notifications and writes.

### Hardware Specifications

-   **Platform:** nRF52840 (ARM Cortex-M4)
-   **Flash Memory:** 1 MB total
    -   Application: 424 KB
    -   Storage (NVS + Snapshots): 396 KB
    -   SoftDevice (BLE Stack): 156 KB
    -   Bootloader: 48 KB
-   **RAM:** 256 KB
-   **BLE:** Bluetooth 5.0
-   **IMU:** LSM6DSL (Accelerometer + Gyroscope)

## Memory Layout

### Flash Partitions (1 MB Total)

```
Address Range       Size      Partition       Purpose
─────────────────────────────────────────────────────────────────
0x00000 - 0x27000   156 KB    SoftDevice      Nordic BLE stack
0x27000 - 0x91000   424 KB    Application     Firmware code
0x91000 - 0xF4000   396 KB    Storage         NVS + Snapshots
0xF4000 - 0x100000   48 KB    Bootloader      UF2 bootloader
```

### Storage Partition Layout (396 KB)

The storage partition uses NVS (Non-Volatile Storage) for:

-   **Snapshot Metadata:** 3 slots × ~100 bytes = ~300 bytes
-   **Snapshot Data:** 3 snapshots × 96 KB each = 288 KB
    -   Each snapshot holds 3000 samples (60 seconds @ 50 Hz)
    -   Sample size: 32 bytes (position, timestamp, 6-axis IMU data)
-   **NVS Overhead:** ~108 KB (wear-leveling, metadata)

### RAM Usage

-   **FIFO Buffer:** 96 KB (3000 samples × 32 bytes)
-   **BLE Stack:** ~20 KB
-   **Application:** ~30 KB
-   **Free:** ~110 KB

## Device State Machine

The device operates in distinct states controlled by BLE commands:

```
                         ┌─────────────┐
                         │   POWER-ON  │
                         └──────┬──────┘
                                │
                                ▼
                         ┌─────────────┐
                 ┌───────│    STOP     │◄──────────┐
                 │       │   (IDLE)    │           │
                 │       │   State=0   │           │
                 │       └──────┬──────┘           │
                 │              │                  │
                 │   CMD_RUN    │                  │
                 │              ▼                  │
                 │       ┌─────────────┐           │
                 │       │     RUN     │           │
                 │       │ (RECORDING) │           │
                 │       │   State=1   │           │
                 │       └──────┬──────┘           │
                 │              │                  │
     CMD_STOP    │              │ CMD_SNAPSHOT     │
     ────────────┤              │  (if FIFO full)  │
                 │              ▼                  │
                 │       ┌──────────────┐          │
                 │       │ SNAPSHOTTING │          │
                 │       │  (Async op)  │──────────┤
                 │       │   State=2    │  Auto    │
                 │       └──────────────┘          │
                 │                                 │
     CMD_DUMP    │       ┌──────────────┐          │
     ────────────┼──────>│   DUMPING    │          │
                 │       │ (Serial out) │──────────┤
                 │       │   State=3    │  Auto    │
                 │       └──────────────┘          │
                 │                                 │
 CMD_LOCATION    │       ┌──────────────┐          │
     ────────────┼──────>│   SHOWING    │          │
                 │       │  LOCATION    │──────────┤
                 │       │ (5 seconds)  │  Auto    │
                 │       │   State=4    │          │
                 │       └──────────────┘          │
                 │                                 │
                 └─────────────────────────────────┘
```

### State Descriptions

| State                | Value | Description                           | Allowed Commands                                                                                        | Transition  |
| -------------------- | ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| **STOP (IDLE)**      | 0     | Device ready, not recording           | RUN, RESET, DUMP, LOC_RED, LOC_GREEN, RESET_STEPS, IMU_TEST, SNAPSHOT, SNAP_DELETE, SNAP_DUMP, LOCATION | Manual      |
| **RUN (RECORDING)**  | 1     | Actively recording IMU data to FIFO   | STOP, STOP_SNAP, SNAPSHOT                                                                               | Manual      |
| **SNAPSHOTTING**     | 2     | Saving snapshot to flash (background) | (None - blocked until complete)                                                                         | Auto → STOP |
| **DUMPING**          | 3     | Dumping data to serial                | (None - blocked until complete)                                                                         | Auto → STOP |
| **SHOWING_LOCATION** | 4     | Displaying location color (5 seconds) | (None - blocked until complete)                                                                         | Auto → STOP |

### State Transition Rules

-   **STOP → RUN:** FIFO is cleared and recording starts fresh
-   **RUN → STOP:** Recording stops, FIFO is cleared (data discarded)
-   **RUN → SNAPSHOTTING:** Via CMD_SNAPSHOT while recording
-   **STOP → SNAPSHOTTING:** Via CMD_SNAPSHOT or CMD_STOP_SNAP
-   **SNAPSHOTTING → STOP:** Automatic when snapshot write completes (~1-2 seconds)
-   **STOP → DUMPING:** Via CMD_DUMP
-   **DUMPING → STOP:** Automatic when serial dump completes (varies with FIFO size)
-   **STOP → SHOWING_LOCATION:** Via CMD_LOCATION
-   **SHOWING_LOCATION → STOP:** Automatic after 5 seconds

### Command Restrictions by State

-   Most configuration commands (RESET, DUMP, location changes, etc.) are **only allowed in STOP state**
-   RUN/STOP commands work in RUN or STOP state
-   SNAPSHOT can be used while recording (captures current buffer state)
-   Transient states (SNAPSHOTTING, DUMPING, SHOWING_LOCATION) block all commands until they auto-transition back to STOP

## BLE Services and Characteristics Summary

### Quick Reference Table

| Service      | Characteristic  | UUID            | Type              | Access  | Notification Interval   |
| ------------ | --------------- | --------------- | ----------------- | ------- | ----------------------- |
| Step Counter | Step Count      | 0x2A53          | uint32            | R, N    | 2 seconds               |
| Fatigue      | Fatigue Level   | 12345678...def1 | uint8             | R, N    | 1 second                |
| Command      | Command State   | 12345679...def1 | uint8             | R, W, N | On change               |
| Command      | Stats           | 12345679...def2 | struct (16 bytes) | R, N    | 1 second (if recording) |
| Command      | Location        | 12345679...def3 | uint8             | R, N    | On change               |
| Command      | Snapshot Status | 12345679...def4 | uint8 (bitmap)    | R, N    | 5 seconds (if changed)  |

### Command State Values

| Value | State            | Meaning                            |
| ----- | ---------------- | ---------------------------------- |
| 0     | STOP             | Idle/stopped, ready for commands   |
| 1     | RUN              | Recording IMU data to FIFO         |
| 2     | SNAPSHOTTING     | Saving snapshot to flash (1-2 sec) |
| 3     | DUMPING          | Dumping data to serial (varies)    |
| 4     | SHOWING_LOCATION | Displaying location color (5 sec)  |

## BLE Services and Characteristics

### 1. Step Counter Service

-   **Service UUID:** 0x1814 (Standard Running Speed and Cadence)
-   **Characteristic:** Step Count
    -   **UUID:** 0x2A53
    -   **Type:** uint32 (cumulative step count, little-endian)
    -   **Access:** Read, Notify
    -   **Notification:** Every 2 seconds (or on change)
    -   **How:** iOS subscribes to notifications; device sends updated step count. iOS can also read current value.

### 2. Fatigue Monitoring Service

-   **Service UUID:** 12345678-1234-5678-1234-56789abcdef0
-   **Characteristic:** Fatigue Level
    -   **UUID:** 12345678-1234-5678-1234-56789abcdef1
    -   **Type:** uint8 (percentage, 0–100)
    -   **Access:** Read, Notify
    -   **Notification:** Every 1 second
    -   **How:** iOS subscribes to notifications; device sends current fatigue level. iOS can also read current value.

### 3. Command Service

-   **Service UUID:** 12345679-1234-5678-1234-56789abcdef0
-   **Characteristics:**
    -   **Command State**
        -   **UUID:** 12345679-1234-5678-1234-56789abcdef1
        -   **Type:** uint8 (0=STOP, 1=RUN)
        -   **Access:** Read, Write, Notify
        -   **Notification:** Immediately on state change
        -   **How:** iOS writes to change state (RUN/STOP), subscribes for notifications. Device notifies on state change.
    -   **Stats**
        -   **UUID:** 12345679-1234-5678-1234-56789abcdef2
        -   **Type:** struct (see below)
        -   **Access:** Read, Notify
        -   **Notification:** Every 1 second (if recording)
        -   **How:** iOS subscribes for periodic stats updates. Device sends struct with:
            -   `uint16_t samples_stored`
            -   `uint16_t samples_dropped`
            -   `uint32_t total_captured`
            -   `uint16_t duration_sec`
            -   `uint16_t actual_rate_hz`
            -   `uint16_t buffer_capacity`
            -   `uint8_t is_recording`
            -   `uint8_t is_full`
    -   **Location**
        -   **UUID:** 12345679-1234-5678-1234-56789abcdef3
        -   **Type:** uint8 (0=RED, 1=GREEN)
        -   **Access:** Read, Notify
        -   **Notification:** On change
        -   **How:** iOS subscribes for location updates; device notifies on change.
    -   **Snapshot Status**
        -   **UUID:** 12345679-1234-5678-1234-56789abcdef4
        -   **Type:** uint8 (bitmap: bit 0=slot 0, bit 1=slot 1, bit 2=slot 2)
        -   **Access:** Read, Notify
        -   **Notification:** Every 5 seconds (only if changed)
        -   **How:** iOS subscribes for status; device notifies if snapshot slot status changes.

## BLE Commands

Commands are sent by writing to the Command State characteristic. The device responds with notifications as described above.

### Supported Commands (Write to Command State)

-   **RUN**: Start main operation (step counting, data collection)
-   **STOP**: Stop main operation
-   **SNAPSHOT n**: Take a snapshot in slot n (n = 0, 1, 2)
-   **DELETE n**: Delete snapshot in slot n
-   **RESET**: Reset device or clear all data

### Command Handling

-   Commands are processed immediately on write
-   State changes (RUN/STOP) trigger immediate notification
-   Snapshot status is updated and notified on the next 5-second interval

## Notification Timing Summary

-   **Step Count:** Every 2 seconds
-   **Fatigue Level:** Every 1 second
-   **Stats:** Every 1 second (if recording)
-   **Snapshot Status:** Every 5 seconds (if changed)
-   **Command State:** Immediately on change
-   **Location:** On change

## Example BLE Payloads

### Step Count Notification

```
Hex: 0A 00 00 00
Interpretation: 10 steps (uint32, little-endian)
```

### Fatigue Level Notification

```
Hex: 4B
Interpretation: 75% fatigue (uint8, 0-100)
```

### Command State Notification

```
Hex: 00 → STOP (idle)
Hex: 01 → RUN (recording)
Hex: 02 → SNAPSHOTTING (saving to flash)
Hex: 03 → DUMPING (serial output)
Hex: 04 → SHOWING_LOCATION (display for 5 sec)
```

### Stats Notification (16 bytes)

```
Hex: DC 0B 00 00 00 00 1E 00 00 00 32 00 B8 0B 01 00
Fields (in order):
- samples_stored: 0x0BDC = 3036 samples (uint16)
- samples_dropped: 0x0000 = 0 (uint16)
- total_captured: 0x00001E00 = 7680 samples (uint32)
- duration_sec: 0x0032 = 50 seconds (uint16)
- actual_rate_hz: 0x00B8 = 184 Hz (uint16)
- buffer_capacity: 0x0BB8 = 3000 samples (uint16)
- is_recording: 0x01 = true (uint8)
- is_full: 0x00 = false (uint8)
```

### Snapshot Status Notification

```
Hex: 05
Interpretation: Bitmap 0b00000101 = slots 0 and 2 occupied, slot 1 empty
```

### Command Write Examples

```
Write 0x01 to Command State → Start recording (RUN)
Write 0x00 to Command State → Stop recording (STOP)
Write 0x0B to Command State → Capture snapshot (SNAPSHOT)
Write 0x0C 0x00 to Command State → Delete snapshot 0 (SNAP_DELETE + param)
Write 0x0C 0xFF to Command State → Delete all snapshots (SNAP_DELETE + 0xFF)
```

## Error Handling and Responses

### Write Operation Errors

When a command is not allowed, the device returns a BLE GATT error:

-   **BT_ATT_ERR_WRITE_NOT_PERMITTED:** Command not allowed in current state
-   **BT_ATT_ERR_INVALID_ATTRIBUTE_LEN:** Missing required parameter (e.g., SNAP_DELETE without index)
-   **BT_ATT_ERR_INVALID_OFFSET:** Invalid write offset

### Error Scenarios

| Scenario                               | Error Response       | Resolution                          |
| -------------------------------------- | -------------------- | ----------------------------------- |
| RUN command while snapshot in progress | Write rejected       | Wait for snapshot to complete       |
| RESET while recording                  | Write rejected       | Send STOP first                     |
| SNAPSHOT when FIFO not full            | Write rejected       | Wait for FIFO to fill (check stats) |
| SNAP_DELETE without parameter          | Invalid length error | Include index byte (0-2 or 0xFF)    |

### Success Responses

-   **State change commands:** Immediate notification on Command State characteristic
-   **SNAP_DELETE:** String notification "OK" or "ERROR" on Command State
-   **Stats updates:** Automatic notification after RESET or STOP

## iOS Integration Guide

### 1. Discovering Services and Characteristics

```swift
// Service UUIDs
let stepServiceUUID = CBUUID(string: "1814")
let fatigueServiceUUID = CBUUID(string: "12345678-1234-5678-1234-56789ABCDEF0")
let commandServiceUUID = CBUUID(string: "12345679-1234-5678-1234-56789ABCDEF0")

// Characteristic UUIDs
let stepCountUUID = CBUUID(string: "2A53")
let fatigueLevelUUID = CBUUID(string: "12345678-1234-5678-1234-56789ABCDEF1")
let commandStateUUID = CBUUID(string: "12345679-1234-5678-1234-56789ABCDEF1")
let statsUUID = CBUUID(string: "12345679-1234-5678-1234-56789ABCDEF2")
let locationUUID = CBUUID(string: "12345679-1234-5678-1234-56789ABCDEF3")
let snapshotStatusUUID = CBUUID(string: "12345679-1234-5678-1234-56789ABCDEF4")
```

### 2. Subscribing to Notifications

```swift
// Enable notifications for a characteristic
peripheral.setNotifyValue(true, for: characteristic)

// Handle notifications in delegate
func peripheral(_ peripheral: CBPeripheral,
                didUpdateValueFor characteristic: CBCharacteristic,
                error: Error?) {
    guard let data = characteristic.value else { return }

    switch characteristic.uuid {
    case stepCountUUID:
        let stepCount = data.withUnsafeBytes { $0.load(as: UInt32.self) }
        print("Steps: \(stepCount)")

    case fatigueLevelUUID:
        let fatigue = data[0]  // uint8
        print("Fatigue: \(fatigue)%")

    case commandStateUUID:
        let state = data[0]  // uint8
        switch state {
        case 0: print("State: STOP (Idle)")
        case 1: print("State: RUN (Recording)")
        case 2: print("State: SNAPSHOTTING (Saving...)")
        case 3: print("State: DUMPING (Serial output...)")
        case 4: print("State: SHOWING_LOCATION (Display for 5s)")
        default: print("State: Unknown (\(state))")
        }

    case snapshotStatusUUID:
        let bitmap = data[0]
        let slot0 = (bitmap & 0x01) != 0
        let slot1 = (bitmap & 0x02) != 0
        let slot2 = (bitmap & 0x04) != 0
        print("Snapshots: Slot0=\(slot0), Slot1=\(slot1), Slot2=\(slot2)")

    // ... handle other characteristics
    }
}
```

### 3. Sending Commands

```swift
// Start recording
let runCommand = Data([0x01])
peripheral.writeValue(runCommand, for: commandStateCharacteristic, type: .withResponse)

// Stop recording
let stopCommand = Data([0x00])
peripheral.writeValue(stopCommand, for: commandStateCharacteristic, type: .withResponse)

// Delete snapshot 0
let deleteCommand = Data([0x0C, 0x00])  // CMD_SNAP_DELETE + index
peripheral.writeValue(deleteCommand, for: commandStateCharacteristic, type: .withResponse)

// Delete all snapshots
let deleteAllCommand = Data([0x0C, 0xFF])  // CMD_SNAP_DELETE + 0xFF
peripheral.writeValue(deleteAllCommand, for: commandStateCharacteristic, type: .withResponse)
```

### 4. Parsing Stats Notification

```swift
func parseStats(data: Data) -> Stats {
    let samples_stored = data.withUnsafeBytes { $0.load(fromByteOffset: 0, as: UInt16.self) }
    let samples_dropped = data.withUnsafeBytes { $0.load(fromByteOffset: 2, as: UInt16.self) }
    let total_captured = data.withUnsafeBytes { $0.load(fromByteOffset: 4, as: UInt32.self) }
    let duration_sec = data.withUnsafeBytes { $0.load(fromByteOffset: 8, as: UInt16.self) }
    let actual_rate_hz = data.withUnsafeBytes { $0.load(fromByteOffset: 10, as: UInt16.self) }
    let buffer_capacity = data.withUnsafeBytes { $0.load(fromByteOffset: 12, as: UInt16.self) }
    let is_recording = data[14] != 0
    let is_full = data[15] != 0

    return Stats(samples_stored: samples_stored,
                 samples_dropped: samples_dropped,
                 total_captured: total_captured,
                 duration_sec: duration_sec,
                 actual_rate_hz: actual_rate_hz,
                 buffer_capacity: buffer_capacity,
                 is_recording: is_recording,
                 is_full: is_full)
}
```

## Data Flow: How Each Characteristic Sends/Receives Data

-   **Read:** iOS can read the current value of any readable characteristic at any time
-   **Notify:** iOS subscribes to notifications; device pushes updates at the specified interval or on change
-   **Write:** iOS writes commands to Command State; device processes and responds with notifications

## Best Practices for iOS Developers

-   Subscribe to notifications for real-time updates
-   Use write operations with response (`.withResponse`) for critical commands
-   Allow up to 5 seconds for snapshot status updates after a command
-   Command state changes are notified immediately
-   All characteristics use little-endian encoding
-   Check for BLE GATT errors when writes fail (command not allowed in current state)
-   Monitor the Stats characteristic to track FIFO fill level and recording status
-   Snapshot bitmap updates are sent only when changed (not on every 5-second interval)

## Troubleshooting

| Issue                           | Possible Cause                       | Solution                                                |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| Command write fails             | Wrong state                          | Check command state, send STOP if needed                |
| No notifications received       | Not subscribed                       | Call `setNotifyValue(true, ...)`                        |
| Snapshot status not updating    | No change in status                  | Status only notifies when bitmap changes                |
| Stats show is_full=false        | FIFO not full yet                    | Wait for buffer to fill (3000 samples @ 50 Hz = 60 sec) |
| Delayed updates (5 sec)         | Snapshot status polling              | Expected behavior; snapshot status updates every 5 sec  |
| State stuck in SNAPSHOTTING     | Snapshot taking longer than expected | Wait up to 2 seconds; check logs for errors             |
| State stuck in DUMPING          | Large buffer or slow serial          | Normal for large dumps; monitor progress in logs        |
| State stuck in SHOWING_LOCATION | LED display in progress              | Wait 5 seconds; auto-restores to STOP                   |

---

For further details or protocol extensions, please refer to the firmware documentation or contact the firmware team.
