# PowerModeToggle Component

A reusable React Native component for toggling between `StateMode.Amber` (active) and `StateMode.Off` (low power) with built-in confirmation dialogs.

## Features

- **Visual Toggle**: Shows amber "Active" button or gray "Low Power" button based on current state
- **Confirmation Dialog**: When switching from Amber to Off, shows a confirmation dialog warning about low power mode and stats reset
- **Status Indicator**: Small colored dot and descriptive text showing current device state
- **Disabled State**: Can be disabled during recording or when device doesn't support state control
- **Stats Integration**: Optional callback to reset device statistics when entering low power mode

## Usage

### Basic Usage

```tsx
import PowerModeToggle from './components/PowerModeToggle';
import { useStateControl } from './ble/useStateControl';

function MyComponent() {
  const stateControl = useStateControl(myDevice);
  
  return (
    <PowerModeToggle
      currentMode={stateControl.value}
      onModeChange={async (mode) => {
        await stateControl.setStateMode(mode);
      }}
      deviceName="My Device"
    />
  );
}
```

### With Session Integration

```tsx
import PowerModeToggle from './components/PowerModeToggle';
import { useSession } from './session/SessionProvider';

function DeviceControlPanel() {
  const { entryA, stateA, a } = useSession();
  
  return (
    <PowerModeToggle
      currentMode={stateA.value}
      onModeChange={async (mode) => {
        await stateA.setStateMode(mode);
      }}
      disabled={!stateA.supported || recording}
      deviceName={entryA?.device.name || 'Device A'}
      onStatsReset={() => {
        a?.resetStats?.();
      }}
    />
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `currentMode` | `number \| null \| undefined` | Yes | Current StateMode value from useStateControl |
| `onModeChange` | `(mode: StateMode) => Promise<void> \| void` | Yes | Callback when mode should change |
| `disabled` | `boolean` | No | Whether the toggle is disabled (default: false) |
| `deviceName` | `string` | No | Device name for confirmation dialog (default: "Device") |
| `onStatsReset` | `() => void` | No | Optional callback when stats should be reset |

## Behavior

### Amber to Off (Low Power)
- Shows confirmation dialog: "Switch to Low Power Mode?"
- Warns about low power mode and stats reset
- Calls `onStatsReset()` callback if provided
- Only proceeds if user confirms

### Off to Amber (Active)
- No confirmation needed
- Immediately switches to amber/active mode
- Device returns to normal operation

## Integration Examples

### In SessionStatusPanel
Add power control alongside existing device status:

```tsx
// Add to existing SessionStatusPanel
<PowerModeToggle
  currentMode={stateA.value}
  onModeChange={async (mode) => await stateA.setStateMode(mode)}
  deviceName={entryA?.device.name}
  onStatsReset={() => a?.resetStats?.()}
/>
```

### As Standalone Panel
Use the provided `DevicePowerPanel` component for a complete power control interface.

## Styling

The component uses the app's theme system and will automatically match your app's styling:
- Uses `theme.viewStyles.actionButton` for the main button
- Uses `theme.textStyles.buttonLabel` for button text
- Uses `theme.colors.muted` for disabled states
- Amber color: `#FFB300`
- Off/Gray color: `#9CA3AF`