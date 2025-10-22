# Step Count Integration Guide

## Overview
This integration provides a React Native hook to read step count data from your BLE device's Running Speed and Cadence Service (UUID: 0x1814).

## Files Created
1. `src/ble/useStepCount.tsx` - The main hook for reading step count data
2. `src/components/StepCountDisplay.tsx` - Example component showing how to use the hook

## BLE Device Configuration
Your BLE device is correctly configured with:
- **Service UUID**: `1814` (Running Speed and Cadence Service)
- **Characteristic UUID**: `2A53` (RSC Measurement characteristic)
- **Properties**: Read + Notify (perfect for real-time updates)

## Hook Usage

### Basic Usage
```tsx
import { useStepCount } from '../ble/useStepCount';
import { useBle } from '../ble/BleProvider';

const MyComponent = () => {
  const { entryA } = useBle(); // Get connected device
  const { stepCount, supported, error } = useStepCount(entryA);
  
  return (
    <Text>Steps: {stepCount ?? 'Loading...'}</Text>
  );
};
```

### Advanced Usage with Options
```tsx
const stepData = useStepCount(connectedDevice, {
  subscribe: true,     // Use notifications (default: true)
  intervalMs: 30000,   // Fallback polling interval (default: 30s)
  waitMs: 5000,        // Wait time for characteristic discovery (default: 5s)
});
```

## Hook Return Values
- `stepCount: number | null` - Current step count value
- `stepData: StepCountData | null` - Full data object with timestamp
- `lastUpdated: number | null` - Timestamp of last update
- `supported: boolean` - Whether device supports step counting
- `error: string | null` - Error message if any issues occur

## Data Format
The hook expects your BLE device to send step count as a 4-byte little-endian unsigned integer. If your device uses a different format, modify the `parseStepCountData` function in `useStepCount.tsx`.

## Integration Steps

### 1. Import the Hook
Add the import to any component where you want to display step count:
```tsx
import { useStepCount } from '../ble/useStepCount';
```

### 2. Use with Your Connected Devices
```tsx
const { entryA, entryB } = useBle();
const deviceASteps = useStepCount(entryA);
const deviceBSteps = useStepCount(entryB);
```

### 3. Handle Different States
```tsx
if (!device) {
  return <Text>Device not connected</Text>;
}

if (!stepData.supported) {
  return <Text>Step counting not supported</Text>;
}

if (stepData.error) {
  return <Text>Error: {stepData.error}</Text>;
}

return <Text>Steps: {stepData.stepCount}</Text>;
```

## Features
- **Automatic reconnection**: Works with your existing device reconnection logic
- **Real-time updates**: Uses BLE notifications when available
- **Fallback polling**: Automatically falls back to polling if notifications fail
- **Error handling**: Graceful handling of connection issues and unsupported devices
- **Multi-device support**: Can monitor step count from multiple devices simultaneously

## Customization
If your BLE device sends data in a different format, modify the `parseStepCountData` function in `useStepCount.tsx`. The current implementation expects:
- 4 bytes of data
- Little-endian unsigned 32-bit integer
- Direct step count value

## Adding to Existing Screens
You can easily add step count display to any of your existing screens by:
1. Importing the hook
2. Using it with your connected devices
3. Displaying the data in your UI

Example integration into an existing screen:
```tsx
// In your existing component
import { useStepCount } from '../ble/useStepCount';

// Add this to your component
const { entryA } = useBle();
const stepData = useStepCount(entryA);

// Add this to your render method
{stepData.supported && (
  <Text>Steps: {stepData.stepCount ?? 'Loading...'}</Text>
)}
```

The integration follows the same patterns as your existing BLE hooks (`useBatteryPercent`, `useStateControl`, etc.) for consistency with your codebase.