# StingRay Auto-Discovery & Connection System

## 🚀 Overview

This implementation provides automatic scanning, connection, and reconnection for up to 3 StingRay devices with persistent device positioning and intelligent auto-assignment.

## ✨ Key Features

### 🔍 **Auto-Scanning**
- **Continuous Scanning**: Automatically scans every 30 seconds when not at max capacity (3 devices)
- **Initial Boot Scan**: Starts scanning 2 seconds after BLE initialization
- **Smart Timing**: 15-second scan duration to balance discovery vs. battery
- **Collision Avoidance**: Won't start new scans while existing scan is running

### 🔗 **Auto-Connection**
- **Immediate Connection**: Connects to StingRay devices as soon as they're discovered
- **Exponential Backoff**: Smart retry mechanism with 1s-30s delays for failed connections
- **Device Discovery**: Full service and characteristic discovery for each connected device
- **MTU Optimization**: Requests 185-byte MTU on Android for better performance

### 🎯 **Auto-Reconnection**
- **Persistent Monitoring**: Detects disconnections and schedules automatic reconnection attempts
- **Sticky Positioning**: Remembers device position assignments across disconnections
- **Position Restoration**: Automatically restores devices to their previous positions when reconnected
- **Persistence Storage**: Device positions saved to AsyncStorage for app restart persistence

### 📍 **Device Position Management**
- **Auto-Assignment**: Newly connected devices automatically assigned to available positions
- **Position Priority**: Assignment order: Left Foot → Right Foot → Racket
- **Sticky Positions**: Device positions persist across disconnections and app restarts
- **Conflict Resolution**: Prevents position conflicts with smart reassignment logic

## 🏗️ Architecture

### **Core Components**

#### **1. Enhanced BleProvider** (`src/ble/BleProvider.tsx`)
- Extended with persistence and auto-assignment capabilities
- Integrated cleanup and initialization routines
- Smart reconnection logic with exponential backoff
- Auto-assignment during device discovery

#### **2. Device Persistence** (`src/ble/devicePersistence.ts`)
- AsyncStorage-based position and device info persistence
- Auto-cleanup of devices not seen for 30+ days
- Device history and position tracking

#### **3. Auto-Assignment Logic** (`src/ble/deviceAutoAssignment.ts`)
- Intelligent position assignment based on discovery order and history
- Configurable assignment policies
- Position availability checking and conflict resolution

#### **4. BLE Control Panel** (`src/components/BleControlPanel.tsx`)
- Real-time BLE status monitoring
- Manual scan controls with auto-scan toggle
- Device position status display
- Connection management (disconnect, reassign)

## 🎮 User Interface

### **BLE Control Panel Features**
- ✅ **Bluetooth Status**: Shows BLE adapter state (on/off)
- ✅ **Connection Status**: Displays "2/3 Connected" with position indicators
- ✅ **Manual Scan**: Button to trigger immediate scan or stop ongoing scan
- ✅ **Auto-Scan Toggle**: Enable/disable automatic scanning
- ✅ **Device Position Status**: Visual status for Left Foot, Right Foot, Racket
- ✅ **Disconnect Controls**: Individual device disconnect buttons
- ✅ **Scan Activity**: Real-time scan progress and results
- ✅ **Last Scan Time**: Timestamp of most recent scan

## 🔧 Configuration

### **Auto-Scan Settings**
```typescript
AUTO_SCAN_INTERVAL_MS = 30000;  // 30 second intervals
SCAN_DURATION_MS = 15000;       // 15 second scan duration  
MAX_DEVICES = 3;                // Maximum 3 StingRay devices
```

### **Reconnection Settings**
```typescript
BASE_BACKOFF_MS = 1000;         // 1 second base delay
MAX_BACKOFF_MS = 30000;         // 30 second max delay
// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
```

### **Persistence Settings**
```typescript
CLEANUP_THRESHOLD = 30 days;    // Remove devices not seen for 30+ days
AUTO_RECONNECT_WINDOW = 7 days; // Auto-reconnect devices seen within 7 days
```

## 🎯 Device Position Assignment

### **Auto-Assignment Logic**
1. **Check Previous Position**: Try to restore device to its last known position
2. **Position Availability**: Verify position isn't taken by another device
3. **Priority Assignment**: Assign to first available position (L→R→T)
4. **Conflict Resolution**: Handle position conflicts gracefully
5. **Persistence**: Save assignment to storage for future sessions

### **Position Colors**
- **Left Foot**: `#FF6B6B` (Red)
- **Right Foot**: `#4ECDC4` (Teal)  
- **Racket**: `#45B7D1` (Blue)

## 📱 Usage Scenarios

### **First Time Setup**
1. User opens app → Auto-scan starts after 2 seconds
2. StingRay devices discovered → Automatic connection attempts
3. Devices connected → Auto-assigned to positions in order
4. Positions persisted for future sessions

### **Daily Usage**  
1. User opens app → Previous device positions loaded
2. Auto-scan looks for known devices → Reconnects to previous positions
3. Missing devices → Continues scanning until all positions filled
4. New devices → Auto-assigned to available positions

### **Disconnection Recovery**
1. Device disconnects → Position preserved in memory
2. Auto-reconnection scheduled → Exponential backoff retries
3. Device reconnects → Restored to original position
4. User notification → "Device reconnected - Left Foot"

## 🛠️ Integration

### **HomeScreen Integration**
```typescript
import { BleControlPanel, DeviceDiagnosticsPanel } from '../components';

// In render:
<BleControlPanel />          // Control and status
<DeviceDiagnosticsPanel />   // Device data and metrics
```

### **BLE Provider Usage**
```typescript
const { 
  scanning, 
  connected, 
  devicesByPosition,
  assignDevicePosition     // Now async for persistence
} = useBle();
```

## 🔮 Benefits

1. **Zero User Intervention**: Devices automatically connect and maintain positions
2. **Persistent Experience**: Device positions maintained across app sessions  
3. **Robust Connection**: Intelligent reconnection handles temporary disconnections
4. **User Control**: Manual override capabilities when needed
5. **Visual Feedback**: Clear status indicators for all BLE activities
6. **Performance Optimized**: Smart scanning intervals and connection management

The system now provides a seamless "it just works" experience for StingRay device connectivity while maintaining full user control and visibility into the BLE connection process.