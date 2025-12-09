# BLE Optimization Migration Plan

## Overview
This plan systematically refactors the BLE architecture for maximum performance and reliability with a 2-device setup (left foot, right foot). The implementation is organized into 4 phases with clear deliverables and testing criteria.

**Estimated Total Time**: 2-3 days focused work  
**Target Metrics**:
- <2 renders/sec during active recording
- <1s snapshot trigger from FIFO full detection
- <100ms command response latency
- Zero duplicate commands
- Auto-recovery from missed notifications

---

## Phase 1: Foundation & State Management
**Duration**: 3-4 hours  
**Goal**: Replace useState/ref patterns with Zustand; remove racket support; extend ControlState enum

### Tasks

#### 1.1 Install Zustand
```bash
npm install zustand
```

#### 1.2 Extend ControlState Enum
**File**: `src/ble/useControl.tsx`

Add transient states to match firmware 1.1 specification:

```typescript
export enum ControlState {
  STOPPED = 0,
  RUNNING = 1,
  SNAPSHOTTING = 2,    // NEW: Device is capturing snapshot
  DUMPING = 3,         // NEW: Device is dumping data
  SHOWING_LOCATION = 4, // NEW: Device is showing location LED
  UNKNOWN = 255,
}
```

#### 1.3 Create Zustand Store
**File**: `src/ble/bleStore.ts` (new file)

```typescript
import create from 'zustand';
import { Device } from 'react-native-ble-plx';

export type DevicePosition = 'leftFoot' | 'rightFoot';

interface ConnectedDevice {
  device: Device;
  position: DevicePosition | null;
}

interface BleState {
  connected: Record<string, ConnectedDevice>;
  scanning: boolean;
  
  // Actions
  setConnected: (deviceId: string, device: Device, position: DevicePosition | null) => void;
  removeDevice: (deviceId: string) => void;
  assignPosition: (deviceId: string, position: DevicePosition) => void;
  setScanning: (scanning: boolean) => void;
  
  // Selectors
  getDeviceByPosition: (position: DevicePosition) => Device | null;
  getConnectedDevices: () => ConnectedDevice[];
}

export const useBleStore = create<BleState>((set, get) => ({
  connected: {},
  scanning: false,
  
  setConnected: (deviceId, device, position) =>
    set((state) => ({
      connected: {
        ...state.connected,
        [deviceId]: { device, position },
      },
    })),
    
  removeDevice: (deviceId) =>
    set((state) => {
      const { [deviceId]: _, ...rest } = state.connected;
      return { connected: rest };
    }),
    
  assignPosition: (deviceId, position) =>
    set((state) => ({
      connected: {
        ...state.connected,
        [deviceId]: {
          ...state.connected[deviceId],
          position,
        },
      },
    })),
    
  setScanning: (scanning) => set({ scanning }),
  
  getDeviceByPosition: (position) => {
    const devices = Object.values(get().connected);
    return devices.find((d) => d.position === position)?.device ?? null;
  },
  
  getConnectedDevices: () => Object.values(get().connected),
}));
```

#### 1.4 Remove Racket Position Support
**Files to update**:
- `src/ble/BleProvider.tsx`: Remove 'racket' from DevicePosition type
- `src/ble/devicePersistence.ts`: Update type definition
- `src/components/DeviceManager.tsx`: Remove racket UI elements
- Any other files referencing 'racket' position

**Find all references**:
```bash
grep -r "racket" src/
```

#### 1.5 Migrate BleProvider to Zustand
**File**: `src/ble/BleProvider.tsx`

Replace:
- `useState` for `connected` → `useBleStore`
- `connectedRef.current` workarounds → direct store access
- `getConnectedDevices()` helper → `useBleStore.getState().getConnectedDevices()`

### Testing Checklist
- [x] Zustand installed without errors
- [ ] ControlState enum includes values 0-4 + 255
- [ ] bleStore.ts compiles without errors
- [ ] All racket references removed from codebase
- [ ] BleProvider uses Zustand (no useState for connected devices)
- [ ] Device scanning and connection still works
- [ ] Position assignment persists correctly
- [ ] No TypeScript errors in workspace

### Acceptance Criteria
✅ Zero references to 'racket' in codebase  
✅ All device state managed through Zustand store  
✅ connectedRef.current pattern eliminated  
✅ Device Manager shows only 2 positions (leftFoot, rightFoot)

---

pollSnapshotStatus(); // 5 reads × 300ms each = 1.5s

## Phase 2: Update Session Control Panel & Device Manager
**Duration**: 2-3 hours  
**Goal**: Update `SessionControlPanel` and `DeviceManager` to use Zustand and new BLE state, ensuring basic BLE usage (connect, assign, start/stop session) works. TrainingSessionPanel refactor will follow in Phase 3.

### Tasks

#### 2.1 Refactor DeviceManager
**File**: `src/components/DeviceManager.tsx`

- Use Zustand store (`useBleStore`) for device state and assignment
- Remove all references to `racket` position
- Use new ControlState enum for device state display
- Ensure device connect/disconnect, assignment, and state display work

#### 2.2 Refactor SessionControlPanel
**File**: `src/components/SessionControlPanel.tsx`

- Use Zustand and new BLE hooks for device control
- Ensure start/stop session works with new BLE state
- Remove any legacy state/ref patterns
- UI should reflect device state and allow basic session control

#### 2.3 Minimal Integration
- Ensure DeviceManager and SessionControlPanel work together for basic BLE usage
- Test connect, assign, start, stop, and disconnect flows

### Testing Checklist
- [ ] DeviceManager uses Zustand for device state
- [ ] SessionControlPanel uses Zustand and new BLE hooks
- [ ] Can connect, assign, start, and stop a session
- [ ] Device state and assignment update in UI
- [ ] No TypeScript errors

### Acceptance Criteria
✅ DeviceManager and SessionControlPanel fully functional with new BLE state  
✅ Basic BLE usage (connect, assign, start/stop) works  
✅ No references to racket or legacy state patterns

---

## Phase 2a: SessionControlPanel & DeviceManager UI/UX Improvements (Two-Device Focus)

**Goal:**
Streamline and clarify the UI for exactly two devices (leftFoot, rightFoot), improving assignment, state display, and user feedback, while keeping the existing visual style.

### Tasks

1. **Simplify Device Assignment**
  - Remove all logic and UI for a third device (“racket”).
  - Show only two device slots: leftFoot and rightFoot.
  - Make assignment explicit: drag-and-drop, tap-to-assign, or clear “Assign” buttons for each slot.

2. **Unified Device State Display**
  - For each slot, show:
    - Device name/ID (or “Not connected”)
    - Connection status (icon or color)
    - Current state (RUNNING, STOPPED, etc.) with color coding
    - Battery/FIFO if available
  - Use consistent icons/colors for state and connection.

3. **Session Control Placement**
  - Place Start/Stop session controls in a fixed, prominent location (e.g., below or between device panels).
  - Disable Start if either device is not connected or not assigned.

4. **Feedback & Error Handling**
  - Show clear feedback if a device disconnects or fails to assign.
  - Show a warning if both devices are not assigned before starting a session.

5. **Responsive Layout**
  - Ensure the panel looks good on all device sizes (side-by-side or stacked layout for two devices).
  - Use flexbox or similar for adaptive arrangement.

6. **Accessibility & Touch Targets**
  - Ensure all buttons and interactive elements are large enough for touch.
  - Add accessible labels for screen readers.

### Testing Checklist

- [ ] Only two device slots are visible and assignable.
- [ ] Device assignment and state display are clear and unambiguous.
- [ ] Start/Stop controls are always visible and only enabled when both devices are ready.
- [ ] UI adapts gracefully to different screen sizes.
- [ ] No references to “racket” or third device in code or UI.
- [ ] All error and feedback messages are clear and actionable.

### Acceptance Criteria

✅ Only leftFoot and rightFoot are supported and visible  
✅ Device assignment and state are always clear  
✅ Session controls are intuitive and robust  
✅ No regressions in look and feel

---

## Phase 3: Training Panel Event-Driven Logic
**Duration**: 2-3 hours  
**Goal**: Refactor `TrainingSessionPanel` for event-driven snapshot detection, interval validation, and advanced features (as previously described).

### Tasks

#### 3.1 Expose isFull Flag in useControl
**File**: `src/ble/useControl.tsx`

Add to return object:
```typescript
return {
  fifoPct,
  deviceState,
  snapshotStatus,
  location,
  isFull,  // NEW: Direct access to FIFO full flag
  // ... existing methods
};
```

Track `isFull` separately from `fifoPct`:
```typescript
const [isFull, setIsFull] = useState<boolean>(false);

// In parseStatistics effect:
setIsFull((prev) => (prev === stats.isFull ? prev : stats.isFull));
```

#### 3.2 Refactor Training Panel Phase Machine
**File**: `src/components/TrainingSessionPanel.tsx`

Replace polling-based FIFO detection with event-driven logic (see previous plan for details)

#### 3.3 Remove Snapshot Polling
**File**: `src/components/TrainingSessionPanel.tsx`

Replace `pollSnapshotStatus()` calls with Command State monitoring (see previous plan for details)

#### 3.4 Add Interval Validation
**File**: `src/components/TrainingSessionPanel.tsx`

Warn users about intervals < 2 minutes (see previous plan for details)

### Testing Checklist
- [ ] isFull flag exposed in useControl return
- [ ] Training panel phase transitions trigger on isFull (not fifoPct polling)
- [ ] No more setInterval polling loops in TrainingSessionPanel
- [ ] Snapshot completion detected via deviceState subscription
- [ ] pollSnapshotStatus() method removed
- [ ] Interval validation shows warnings for < 2 minute intervals
- [ ] Phase machine still completes full training cycle correctly

### Acceptance Criteria
✅ Zero setInterval/setTimeout polling loops in TrainingSessionPanel  
✅ Snapshot trigger <1s after FIFO full  
✅ Validation prevents accidentally short intervals  
✅ Command State subscription drives phase transitions

---

## Phase 3: Performance Tuning
**Duration**: 2 hours  
**Goal**: Throttle FIFO updates; conditional Stats subscription; subscription watchdog

### Tasks

#### 3.1 Throttle FIFO Percent Updates
**File**: `src/ble/useControl.tsx`

Only update UI when percent changes by ≥5%:

```typescript
const [fifoPct, setFifoPct] = useState<number | null>(null);
const lastReportedPct = useRef<number | null>(null);

// In Statistics subscription effect:
const stats = parseStatistics(characteristic.value);
if (stats) {
  const nextPct = Math.round((stats.samplesStored / stats.bufferCapacity) * 100);
  const pctBucket = Math.floor(nextPct / 5) * 5; // Round to nearest 5%
  
  if (lastReportedPct.current !== pctBucket) {
    lastReportedPct.current = pctBucket;
    setFifoPct(pctBucket);
  }
  
  // Still update isFull every time
  setIsFull((prev) => (prev === stats.isFull ? prev : stats.isFull));
}
```

#### 3.2 Conditional Statistics Subscription
**File**: `src/ble/useControl.tsx`

Only subscribe to Stats characteristic while RUNNING:

```typescript
useEffect(() => {
  if (!device || deviceState !== ControlState.RUNNING) return;
  
  const sub = device.monitorCharacteristicForService(
    COMMAND_SERVICE_UUID,
    STATISTICS_CHARACTERISTIC_UUID,
    (error, characteristic) => {
      // ... existing handler
    }
  );
  
  return () => { sub?.remove && sub.remove(); };
}, [device?.id, deviceState]); // Re-subscribe when state changes to RUNNING
```

#### 3.3 Subscription Watchdog
**File**: `src/ble/useControl.tsx`

Auto-detect and recover from missed notifications:

```typescript
const lastNotificationTime = useRef<Record<string, number>>({});

const createWatchdog = (charUuid: string, resubscribe: () => void) => {
  const timer = setInterval(() => {
    const lastTime = lastNotificationTime.current[charUuid];
    if (lastTime && Date.now() - lastTime > 10000) { // 10s silence
      console.warn(`Watchdog: No ${charUuid} notifications for 10s, resubscribing`);
      resubscribe();
    }
  }, 5000);
  return () => clearInterval(timer);
};

// Example for Stats subscription:
useEffect(() => {
  if (!device || deviceState !== ControlState.RUNNING) return;
  
  let sub: any;
  const subscribe = () => {
    sub = device.monitorCharacteristicForService(
      COMMAND_SERVICE_UUID,
      STATISTICS_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (!error) {
          lastNotificationTime.current[STATISTICS_CHARACTERISTIC_UUID] = Date.now();
          // ... existing handler
        }
      }
    );
  };
  
  subscribe();
  const cleanup = createWatchdog(STATISTICS_CHARACTERISTIC_UUID, subscribe);
  
  return () => {
    sub?.remove && sub.remove();
    cleanup();
  };
}, [device?.id, deviceState]);
```

### Testing Checklist
- [ ] FIFO percent updates in 5% increments (0, 5, 10, ..., 95, 100)
- [ ] Render count <2/sec during active recording
- [ ] Stats subscription only active when deviceState === RUNNING
- [ ] Watchdog detects 10s notification gap and resubscribes
- [ ] Manual disconnect/reconnect recovers subscriptions
- [ ] No memory leaks (cleanup functions called on unmount)

### Acceptance Criteria
✅ FIFO UI updates reduce from ~10/sec to ~2/sec  
✅ Stats subscription disabled when STOPPED (saves BLE bandwidth)  
✅ Watchdog auto-recovers from firmware notification bugs  
✅ Smooth UI with minimal re-render churn

---

## Phase 4: Robustness Improvements
**Duration**: 2-3 hours  
**Goal**: Transient state timeouts; write verification; improved error UI

### Tasks

#### 4.1 Transient State Timeout Detection
**File**: `src/ble/useControl.tsx`

Detect when device gets stuck in SNAPSHOTTING/DUMPING/SHOWING_LOCATION:

```typescript
useEffect(() => {
  if (!deviceState) return;
  
  const transientStates = [
    ControlState.SNAPSHOTTING,
    ControlState.DUMPING,
    ControlState.SHOWING_LOCATION,
  ];
  
  if (!transientStates.includes(deviceState)) return;
  
  const timeout = setTimeout(() => {
    console.error(`Device stuck in ${ControlState[deviceState]} for >30s`);
    // Optional: Auto-recovery via RESET command
    sendCommand(ControlCommand.RESET);
  }, 30000);
  
  return () => clearTimeout(timeout);
}, [deviceState, sendCommand]);
```

#### 4.2 Write Verification with Retry
**File**: `src/ble/useControl.tsx`

Verify command writes by reading back Command State:

```typescript
const sendCommandWithVerification = useCallback(async (
  command: ControlCommand,
  maxRetries = 2
): Promise<boolean> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const writeOk = await sendCommand(command);
    if (!writeOk) continue;
    
    // Wait for notification or timeout
    await new Promise((res) => setTimeout(res, 200));
    
    // Verify state matches expected
    const expectedState = command === ControlCommand.RUN 
      ? ControlState.RUNNING 
      : ControlState.STOPPED;
    
    if (deviceState === expectedState) return true;
    
    console.warn(`Command ${command} verification failed (attempt ${attempt + 1})`);
  }
  
  return false;
}, [sendCommand, deviceState]);
```

#### 4.3 Improved Error UI
**File**: `src/components/DeviceManager.tsx`

Add visual indicators for transient states and errors:

```typescript
const getStateColor = (state: ControlState | null) => {
  switch (state) {
    case ControlState.RUNNING: return 'green';
    case ControlState.STOPPED: return 'gray';
    case ControlState.SNAPSHOTTING: return 'blue';
    case ControlState.DUMPING: return 'purple';
    case ControlState.SHOWING_LOCATION: return 'orange';
    default: return 'red';
  }
};

const getStateLabel = (state: ControlState | null) => {
  if (state === null) return 'Unknown';
  return ControlState[state];
};

// In render:
<Text style={{ color: getStateColor(deviceState) }}>
  {getStateLabel(deviceState)}
</Text>
```

#### 4.4 Performance Metrics Logging
**File**: `src/ble/useControl.tsx`

Optional: Add metrics to track actual performance:

```typescript
const metrics = useRef({
  commandLatency: [] as number[],
  renderCount: 0,
  snapshotTriggerDelay: [] as number[],
});

// Track command latency:
const sendCommandWithMetrics = useCallback(async (command: ControlCommand) => {
  const start = Date.now();
  const ok = await sendCommand(command);
  const latency = Date.now() - start;
  metrics.current.commandLatency.push(latency);
  console.log(`Command ${command} latency: ${latency}ms`);
  return ok;
}, [sendCommand]);

// Track render count:
useEffect(() => {
  metrics.current.renderCount++;
});

// Log metrics every 10s:
useEffect(() => {
  const timer = setInterval(() => {
    const avgLatency = metrics.current.commandLatency.length > 0
      ? metrics.current.commandLatency.reduce((a, b) => a + b, 0) / metrics.current.commandLatency.length
      : 0;
    console.log(`Metrics: ${metrics.current.renderCount / 10} renders/sec, avg latency ${avgLatency.toFixed(0)}ms`);
    metrics.current.renderCount = 0;
    metrics.current.commandLatency = [];
  }, 10000);
  return () => clearInterval(timer);
}, []);
```

### Testing Checklist
- [ ] Transient state timeout triggers after 30s stuck
- [ ] Command verification retries up to 2 times on mismatch
- [ ] Device state color/label updates correctly for all 6 states
- [ ] Performance metrics log every 10s (optional)
- [ ] User sees clear error when command fails after retries
- [ ] Auto-recovery from stuck states works correctly

### Acceptance Criteria
✅ Stuck device auto-recovers via timeout + RESET  
✅ Command failures retry automatically (up to 2×)  
✅ UI shows distinct colors for all device states  
✅ Performance meets targets (<2 renders/sec, <100ms latency, <1s snapshot trigger)

---

## Testing Strategy

### Unit Testing
- Create mocks for `react-native-ble-plx` Device
- Test Zustand store actions in isolation
- Verify throttling logic with synthetic data
- Test watchdog timer behavior

### Integration Testing
- Full BLE connection + command flow
- Training session with 3 intervals
- Rapid command sequences (no duplicates)
- Device disconnect/reconnect during session
- FIFO full detection and snapshot trigger

### Performance Testing
- Monitor render count with React DevTools Profiler
- Measure command latency with timestamps
- Track BLE characteristic read/write counts
- Verify <1s snapshot trigger delay

### Regression Testing
- Existing functionality unchanged:
  - Device scanning and pairing
  - Position assignment and persistence
  - Basic RUN/STOP commands
  - Manual snapshot capture
  - Location LED control

---

## Rollback Plan

Each phase is independently reversible:

**Phase 1 Rollback**:
- `npm uninstall zustand`
- `git checkout src/ble/BleProvider.tsx`
- Delete `src/ble/bleStore.ts`
- Restore racket references (if needed)

**Phase 2 Rollback**:
- Restore polling loops from git history
- Remove isFull flag from useControl return
- Restore `pollSnapshotStatus()` method

**Phase 3 Rollback**:
- Remove throttling logic (restore direct setState)
- Remove watchdog timers
- Unconditional Stats subscription

**Phase 4 Rollback**:
- Remove timeout detection
- Remove verification retry logic
- Restore simple error UI

**Git Strategy**: Create branch for each phase:
- `feature/ble-opt-phase1-zustand`
- `feature/ble-opt-phase2-training`
- `feature/ble-opt-phase3-performance`
- `feature/ble-opt-phase4-robustness`

Merge to `main` only after phase testing complete.

---

## Dependencies & Prerequisites

### Before Starting
- [ ] Firmware 1.1+ confirmed on all devices
- [ ] No active production sessions in progress
- [ ] Git branch created from stable main
- [ ] Device test rig available (2× physical devices)

### External Dependencies
- `zustand` package (Phase 1)
- No other external dependencies

### Breaking Changes
- Racket position removed (update any external scripts)
- ControlState enum extended (update type guards)
- BleProvider API unchanged (internal only)

---

## Success Metrics

### Performance Targets
- **Render Rate**: <2 renders/sec during active recording
- **Command Latency**: <100ms from sendCommand() to state update
- **Snapshot Trigger**: <1s from FIFO full to snapshot completion
- **BLE Efficiency**: <10 characteristic reads per training session

### Reliability Targets
- **Zero Duplicate Commands**: Manual guard refs eliminated
- **Auto-Recovery**: Watchdog recovers from 10s notification gap
- **Transient State Handling**: Auto-reset after 30s stuck
- **Command Success Rate**: >99% with verification retry

### Code Quality Targets
- **Zero Polling Loops**: No setInterval in training logic
- **Type Safety**: Zero TypeScript errors
- **Store Centralization**: All device state in Zustand
- **Subscription Stability**: No unnecessary resubscriptions

---

## Timeline Summary

| Phase | Duration | Key Deliverable |
|-------|----------|----------------|
| 1: Foundation | 3-4h | Zustand store, ControlState enum, no racket |
| 2: Training | 2-3h | Event-driven snapshots, no polling |
| 3: Performance | 2h | Throttled FIFO, conditional subscription, watchdog |
| 4: Robustness | 2-3h | Timeout detection, verification, error UI |
| **Total** | **9-12h** | **Production-ready optimized BLE architecture** |

### Recommended Schedule
- **Day 1 AM**: Phase 1 (Foundation)
- **Day 1 PM**: Phase 2 (Training Panel)
- **Day 2 AM**: Phase 3 (Performance Tuning)
- **Day 2 PM**: Phase 4 (Robustness)
- **Day 3**: Integration testing + documentation

---

## Next Steps

1. **Confirm Plan**: Review this document and approve approach
2. **Setup Branch**: `git checkout -b feature/ble-optimization`
3. **Start Phase 1**: Install Zustand and create bleStore.ts
4. **Incremental Progress**: Complete one phase before starting next
5. **Test Each Phase**: Run checklist before proceeding
6. **Document Changes**: Update README.md with new architecture notes

**Ready to begin? Start with Phase 1, Task 1.1: Install Zustand**
