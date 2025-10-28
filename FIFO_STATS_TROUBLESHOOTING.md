# FIFO Statistics Troubleshooting Guide

## Issue: Not receiving FIFO Statistics data

### Root Cause
According to the firmware documentation (StingRay_BLE_Services_Guide.md):

> **Notification Policy:** Updates pause automatically while the control state is STANDBY or OFF to reduce power draw.

FIFO Statistics notifications (UUID: `fedcba98-7654-3210-fedc-ba9876543211`) are **suppressed** when the device Control state is:
- `STANDBY` (value 0)
- `OFF` (value 3)

### Solution Steps

1. **Check Current Control State**
   - Use the `ControlServicePanel` to view the current state
   - Look for the "Current State" display

2. **Set Device to RUN or STOP**
   - In the `ControlServicePanel`, tap the **RUN** button (value 1)
   - Alternatively, use **STOP** (value 2) - both allow FIFO stats notifications
   - Avoid STANDBY and OFF if you want live statistics

3. **Verify Device Configuration**
   - Ensure FIFO is configured (capacityMinutes and collectionFreqHz set)
   - Use the DiagnosticsPanel "Refresh" button to manually read current config
   - Default config: 5 minutes @ 66Hz

4. **Monitor Console Logs**
   Enhanced debugging has been added to `useStatistics.tsx`:
   ```
   [Statistics] Subscribing to FIFO statistics notifications...
   [Statistics] Successfully subscribed to FIFO statistics
   [Statistics] Received FIFO stats notification, length: 32
   [Statistics] Parsed FIFO stats: { currentSize: 1234, ... }
   ```

5. **Check for Service Support**
   If you see:
   ```
   [Statistics] Device does not expose FIFO statistics characteristic
   ```
   The connected device may not support this service or the firmware version is incompatible.

### Expected Behavior

**When Control State = RUN or STOP:**
- FIFO Statistics notifications every 10 seconds
- `readStatistics()` returns current values
- DiagnosticsPanel shows live data

**When Control State = STANDBY or OFF:**
- Notifications are suppressed (firmware power saving)
- `readStatistics()` may still work but data won't update
- DiagnosticsPanel shows last known values or "No FIFO statistics"

### Testing Workflow

1. Connect to device
2. Open ControlServicePanel
3. Press **RUN** button
4. Wait 10-15 seconds
5. Open DiagnosticsPanel
6. Press **Refresh** button
7. Check console for `[Statistics]` logs
8. Verify FIFO Statistics section shows data

### Control State Reference

| Value | State | FIFO Stats? | Use Case |
|-------|-------|-------------|----------|
| 0 | STANDBY | ❌ No | Low-power staging, FIFO config allowed |
| 1 | RUN | ✅ Yes | Primary data collection mode |
| 2 | STOP | ✅ Yes | Paused collection, stats still update |
| 3 | OFF | ❌ No | Deep idle, minimal activity |

### Additional Checks

**Check Service Discovery:**
```typescript
// In BleProvider.tsx, ensure Statistics service UUID is discovered:
const serviceUUIDs = [
  // ...
  CBUUID(string: "fedcba98-7654-3210-fedc-ba9876543210"), // Statistics
  // ...
]
```

**Manual Read Test:**
```typescript
// In DiagnosticsPanel, press "Refresh" button
// This calls readStatistics() directly
// Check console for errors or data
```

**Verify Characteristic Properties:**
- Service UUID: `fedcba98-7654-3210-fedc-ba9876543210`
- Characteristic UUID: `fedcba98-7654-3210-fedc-ba9876543211`
- Properties: Read, Notify
- Data: 32-byte packed struct

---

## Summary

**Most Common Fix:** Change Control state from STANDBY to RUN using the ControlServicePanel, then wait 10-15 seconds for the first notification.
