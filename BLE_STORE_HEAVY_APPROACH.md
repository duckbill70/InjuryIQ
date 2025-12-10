# BLE Store Heavy Approach Implementation Guide

## Overview
The `bleStore.ts` has been completely refactored to use the **heavy approach**: all BLE state and metrics flow through a single Zustand store. This replaces the previous pattern where `BleProvider` managed state independently.

## New Store Architecture

### Data Structure
```typescript
// All metrics for a device (updated in real-time from characteristic subscriptions)
interface DeviceMetrics {
  battery: number | null;
  controlState: ControlState;      // STOPPED, RUNNING, SNAPSHOTTING, DUMPING, SHOWING_LOCATION
  fifoPct: number | null;           // 0-100, updated frequently
  isFull: boolean;                  // Quick flag for FIFO full detection
  location: SensorLocation;         // RED, GREEN, or UNKNOWN
  snapshotStatus: { slots: boolean[] } | null;  // 3 snapshot slots
}

// Complete device record
interface ConnectedDevice {
  id: string;
  name?: string;
  device: Device;                   // react-native-ble-plx Device
  position?: 'leftFoot' | 'rightFoot';
  color?: string;                   // Device color
  assignedAt?: Date;                // When assigned
  metrics: DeviceMetrics;           // All real-time data
}
```

### Store Actions (Grouped by Purpose)

**Device Lifecycle**:
- `setConnected(id, device, position?)` - Register new device (called on connect/discover)
- `removeDevice(id)` - Remove on disconnect
- `assignPosition(id, position, color?)` - Assign to left/right (auto-unassigns from other)
- `unassignPosition(id)` - Remove position assignment
- `setScanning(boolean)` - BLE scan state
- `setPoweredOn(boolean)` - Bluetooth enabled state

**Metrics Updates** (called from subscription handlers):
- `updateMetrics(id, { battery, controlState, fifoPct, ... })` - Bulk update
- `setBattery(id, level)` - Single metric convenience methods
- `setControlState(id, state)`
- `setFifoPct(id, pct)`
- `setIsFull(id, boolean)`
- `setLocation(id, location)`
- `setSnapshotStatus(id, status)`

**Selectors** (efficient read-only):
- `getDeviceByPosition(position)` - Get device assigned to left/right
- `getDeviceById(id)` - Get specific device + all metrics
- `getConnectedDevices()` - All connected devices
- `getDevicesByPosition()` - Both left/right in one call

## Integration Points

### 1. BleProvider Updates Required
In `src/ble/BleProvider.tsx`, replace all state management with store calls:

```typescript
import { useBleStore } from './bleStore';

// On device discovery
discoverAllForDevice = useCallback(async (device: Device) => {
  // ... existing discovery logic ...
  
  // Publish to store
  useBleStore.setState((state) => ({
    connected: {
      ...state.connected,
      [device.id]: {
        // New device record with metrics
      }
    }
  }));
  // OR use the action directly:
  useBleStore.getState().setConnected(device.id, device, autoAssignedPosition);
}, []);

// On disconnect
const registerDisconnectHandler = useCallback((id: string) => {
  managerRef.current.onDeviceDisconnected(id, (error, _dev) => {
    // ...
    useBleStore.getState().removeDevice(id);
  });
}, []);

// On position assignment (in assignDevicePosition)
assignDevicePosition = useCallback(async (deviceId, position, color) => {
  // ... existing persistence logic ...
  useBleStore.getState().assignPosition(deviceId, position, color);
}, []);

// On characteristic subscriptions (Battery example)
useEffect(() => {
  if (!deviceId) return;
  const sub = device.monitorCharacteristicForService(
    BATTERY_SERVICE_UUID,
    BATTERY_CHARACTERISTIC_UUID,
    (error, char) => {
      if (!error && char?.value) {
        const level = parseBattery(char.value);
        useBleStore.getState().setBattery(deviceId, level);  // ← Publish to store
      }
    }
  );
  return () => sub?.remove();
}, [deviceId, device]);
```

### 2. DeviceManager Updates
In `src/components/DeviceManager.tsx`:

```typescript
import { useBleStore } from '../ble/bleStore';

// Replace hook usage with store
const { connected, connected: allDevices } = useBleStore((state) => ({
  connected: state.connected,
  allDevices: state.getConnectedDevices(),
}));

// Or use selectors
const leftDevice = useBleStore((state) => state.getDeviceByPosition('leftFoot'));
const rightDevice = useBleStore((state) => state.getDeviceByPosition('rightFoot'));

// Access metrics directly from device
if (leftDevice?.metrics) {
  const { battery, controlState, fifoPct } = leftDevice.metrics;
  // Use these for UI
}

// Assignment
const handleAssignDevice = useCallback((deviceId, position) => {
  useBleStore.getState().assignPosition(deviceId, position);
}, []);
```

### 3. SessionControlPanel Updates
In `src/components/SessionControlPanel.tsx`:

```typescript
import { useBleStore } from '../ble/bleStore';

// Replace current bleStore selectors with the real ones
const leftDevice = useBleStore((state) => state.getDeviceByPosition('leftFoot'));
const rightDevice = useBleStore((state) => state.getDeviceByPosition('rightFoot'));

// New logic: allow 1 or 2 devices
const handleStart = () => {
  const hasDevices = !!leftDevice || !!rightDevice;
  if (!hasDevices) {
    setStartError('At least one device must be assigned before starting a session.');
    return;
  }
  
  if (!leftDevice || !rightDevice) {
    // Only one device - show warning but allow
    Alert.alert(
      'Single Device Session',
      'Only one device is assigned. Recording will continue with available device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => startSession({ sport: selectedSport }) },
      ]
    );
  } else {
    startSession({ sport: selectedSport });
  }
};

// Start button enabled if at least one device assigned
disabled={isActive || (!leftDevice && !rightDevice)}
```

### 4. SessionProvider Updates (Minor)
In `src/session/SessionProvider.tsx`:

```typescript
// Can continue using useBle() for now, or migrate to:
import { useBleStore } from '../ble/bleStore';

const { connected } = useBleStore((state) => ({
  connected: state.getConnectedDevices(),
}));

// Use connected devices for session header enrichment
const devices = headerData.devices ?? connected.map(d => ({
  id: d.id,
  name: d.name,
  position: d.position,
}));
```

## Key Benefits of Heavy Approach

1. **Single Source of Truth**: All device state, connectivity, and metrics flow through one store
2. **Cleaner Component Logic**: No mixing of `useBle()` hook + individual metric hooks
3. **Better Performance**: Zustand selectors prevent unnecessary re-renders
4. **Easier Debugging**: All state visible in Redux DevTools if enabled
5. **Real-time Updates**: Components automatically re-render when metrics update
6. **Centralized Throttling**: Can throttle FIFO updates at store level (Phase 3)

## Next Steps

1. Update `BleProvider.tsx` to publish all events to store (Task 2.1)
2. Update `DeviceManager.tsx` to read from store (Task 2.2)
3. Update `SessionControlPanel.tsx` to read from store and allow single-device sessions (Task 2.3)
4. Run integration tests: connect, assign, start session, verify metrics update
5. Verify no regressions in existing functionality
