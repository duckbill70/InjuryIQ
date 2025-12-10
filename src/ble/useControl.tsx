import { useCallback, useEffect, useState, useRef } from 'react';
import { useBle } from './BleProvider';
import { decodeBase64ToBytes, encodeSingleByte, encodeTwoBytes } from './base64';
import { useBleStore } from './bleStore';
/*
 * - FIFO_STATS (9): Log FIFO statistics to RTT
 * - LOCATION (10): Show location color for 5s then restore (STOP mode only)
 * - SNAPSHOT (11): Capture FIFO snapshot to flash (requires FIFO data, can run while recording)
 * - SNAP_DELETE (12): Delete snapshot(s) - param: 0-2 or 0xFF for all
 * - SNAP_DUMP (13): Dump snapshot(s) to serial - param: 0-2 or 0xFF for all
 */

// Local enums and interfaces
enum ControlCommand {
  STOP = 0,
  RUN = 1,
  STOP_SNAP = 2,
  RESET = 3,
  DUMP = 4,
  LOC_RED = 5,
  LOC_GREEN = 6,
  RESET_STEPS = 7,
  IMU_TEST = 8,
  FIFO_STATS = 9,
  LOCATION = 10,
  SNAPSHOT = 11,
  SNAP_DELETE = 12,
  SNAP_DUMP = 13,
}

export enum ControlState {
  STOPPED = 0,
  RUNNING = 1,
  SNAPSHOTTING = 2,    // NEW: Device is capturing snapshot
  DUMPING = 3,         // NEW: Device is dumping data
  SHOWING_LOCATION = 4, // NEW: Device is showing location LED
  UNKNOWN = 255,
}

export enum SensorLocation {
  RED = 0,
  GREEN = 1,
  UNKNOWN = 255,
}

interface UseControlProps {
  deviceId: string;
  onStateUpdate?: (state: ControlState) => void;
  onStatisticsUpdate?: (stats: FIFOStatistics) => void;
  onLocationUpdate?: (location: SensorLocation) => void;
  onSnapshotStatusUpdate?: (status: SnapshotStatus) => void;
}

export interface FIFOStatistics {
  samplesStored: number;
  samplesDropped: number;
  totalCaptured: number;
  durationSec: number;
  actualRateHz: number;
  bufferCapacity: number;
  isRecording: boolean;
  isFull: boolean;
}

export interface SnapshotStatus {
  slots: boolean[];
}

// Command Service UUIDs (from Device_BLE_Overview.md)
const COMMAND_SERVICE_UUID = '12345679-1234-5678-1234-56789abcdef0';
const COMMAND_CHARACTERISTIC_UUID = '12345679-1234-5678-1234-56789abcdef1';
const STATISTICS_CHARACTERISTIC_UUID = '12345679-1234-5678-1234-56789abcdef2';
const LOCATION_CHARACTERISTIC_UUID = '12345679-1234-5678-1234-56789abcdef3';
const SNAPSHOT_STATUS_CHARACTERISTIC_UUID = '12345679-1234-5678-1234-56789abcdef4';

// Main BLE control hook
export function useControl({
  deviceId,
  onStateUpdate,
  onStatisticsUpdate,
  onLocationUpdate: _onLocationUpdate,
  onSnapshotStatusUpdate: _onSnapshotStatusUpdate,
}: UseControlProps) {
  const { connected } = useBle();
  const device = connected[deviceId]?.device;

  const [fifoPct, setFifoPct] = useState<number | null>(null);
  const [deviceState, setDeviceState] = useState<ControlState | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<SnapshotStatus | null>(null);
  const [location, setLocation] = useState<SensorLocation | null>(null);

  // Use refs to track last notified state to avoid triggering store updates during render
  // Keep separate refs for each subscription source to avoid conflicts
  const lastNotifiedControlStateRef = useRef<ControlState | null>(null);
  const lastNotifiedStatisticStateRef = useRef<ControlState | null>(null);
  const lastNotifiedLocationRef = useRef<SensorLocation | null>(null);
  const lastNotifiedSnapshotRef = useRef<SnapshotStatus | null>(null);
  const lastNotifiedFifoPctRef = useRef<number | null>(null);

  // Parse Statistics characteristic (16 bytes)
  const parseStatistics = (base64Data: string): FIFOStatistics | null => {
    try {
      const bytes = decodeBase64ToBytes(base64Data);
      if (bytes.length !== 16) return null;
      const uint8Array = new Uint8Array(bytes);
      const view = new DataView(uint8Array.buffer);
      return {
        samplesStored: view.getUint16(0, true),
        samplesDropped: view.getUint16(2, true),
        totalCaptured: view.getUint32(4, true),
        durationSec: view.getUint16(8, true),
        actualRateHz: view.getUint16(10, true),
        bufferCapacity: view.getUint16(12, true),
        isRecording: bytes[14] !== 0,
        isFull: bytes[15] !== 0,
      };
    } catch (error) {
      console.error('Failed to parse statistics:', error);
      return null;
    }
  };

  // Subscribe to BLE notifications for this device (statistics only)
  useEffect(() => {
    if (!device) return;
    const sub = device.monitorCharacteristicForService(
      COMMAND_SERVICE_UUID,
      STATISTICS_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) return;
        if (characteristic?.value) {
          const stats = parseStatistics(characteristic.value);
          const nextPct = stats ? Math.round((stats.samplesStored / stats.bufferCapacity) * 100) : null;
          const nextState = stats ? (stats.isRecording ? ControlState.RUNNING : ControlState.STOPPED) : null;
          
          // Only update if values actually changed
          if (lastNotifiedFifoPctRef.current !== nextPct) {
            lastNotifiedFifoPctRef.current = nextPct;
            setFifoPct(nextPct);
            
            // Defer store update to avoid synchronous updates during render
            if (nextPct !== null) {
              setTimeout(() => {
                useBleStore.getState().setFifoPct(deviceId, nextPct);
              }, 0);
            }
          }
          
          if (lastNotifiedStatisticStateRef.current !== nextState && nextState !== null) {
            lastNotifiedStatisticStateRef.current = nextState;
            setDeviceState(nextState);
            
            if (stats && onStatisticsUpdate) onStatisticsUpdate(stats);
            if (onStateUpdate) onStateUpdate(nextState);
            
            // Defer store update
            setTimeout(() => {
              useBleStore.getState().setIsFull(deviceId, stats?.isFull ?? false);
            }, 0);
          } else if (stats && onStatisticsUpdate) {
            onStatisticsUpdate(stats);
          }
        }
      }
    );
    return () => { sub?.remove && sub.remove(); };
  }, [device?.id, deviceId, onStatisticsUpdate, onStateUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to Command State notifications (immediate state changes)
  useEffect(() => {
    if (!device) return;
    const sub = device.monitorCharacteristicForService(
      COMMAND_SERVICE_UUID,
      COMMAND_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) return;
        if (characteristic?.value) {
          try {
            const bytes = decodeBase64ToBytes(characteristic.value);
            if (bytes.length >= 1) {
              const stateByte = bytes[0];
              let next: ControlState;
              switch (stateByte) {
                case 0:
                  next = ControlState.STOPPED;
                  break;
                case 1:
                  next = ControlState.RUNNING;
                  break;
                case 2:
                  next = ControlState.SNAPSHOTTING;
                  break;
                case 3:
                  next = ControlState.DUMPING;
                  break;
                case 4:
                  next = ControlState.SHOWING_LOCATION;
                  break;
                default:
                  next = ControlState.UNKNOWN;
              }
              
              // Only process if state actually changed
              if (lastNotifiedControlStateRef.current !== next) {
                lastNotifiedControlStateRef.current = next;
                const stateNames = {
                  [ControlState.STOPPED]: 'STOPPED',
                  [ControlState.RUNNING]: 'RUNNING',
                  [ControlState.SNAPSHOTTING]: 'SNAPSHOTTING',
                  [ControlState.DUMPING]: 'DUMPING',
                  [ControlState.SHOWING_LOCATION]: 'SHOWING_LOCATION',
                  [ControlState.UNKNOWN]: 'UNKNOWN',
                };
                console.log(
                  `[ControlState] Device ${deviceId.slice(-6)}: ${stateNames[lastNotifiedControlStateRef.current === next ? lastNotifiedControlStateRef.current : ControlState.UNKNOWN]} → ${stateNames[next]} (byte=${stateByte})`
                );
                
                // Update local state
                setDeviceState(next);
                
                // Call callback if provided
                if (onStateUpdate) onStateUpdate(next);
                
                // Defer store update to avoid synchronous updates during render
                // Use setTimeout with 0ms to push to next event loop
                setTimeout(() => {
                  useBleStore.getState().setControlState(deviceId, next);
                }, 0);
              }
            }
          } catch {}
        }
      }
    );
    return () => { sub?.remove && sub.remove(); };
  }, [device?.id, deviceId, onStateUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to Location notifications
  useEffect(() => {
    if (!device) return;
    const sub = device.monitorCharacteristicForService(
      COMMAND_SERVICE_UUID,
      LOCATION_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) return;
        if (characteristic?.value) {
          try {
            const bytes = decodeBase64ToBytes(characteristic.value);
            if (bytes.length >= 1) {
              const loc = bytes[0] === 0 ? SensorLocation.RED : bytes[0] === 1 ? SensorLocation.GREEN : SensorLocation.UNKNOWN;
              
              // Only process if location actually changed
              if (lastNotifiedLocationRef.current !== loc) {
                lastNotifiedLocationRef.current = loc;
                setLocation(loc);
                
                // Defer store update to avoid synchronous updates during render
                setTimeout(() => {
                  useBleStore.getState().setLocation(deviceId, loc);
                }, 0);
              }
            }
          } catch {}
        }
      }
    );
    return () => { sub?.remove && sub.remove(); };
  }, [device?.id, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to Snapshot Status notifications (bitmap)
  useEffect(() => {
    if (!device) return;
    const sub = device.monitorCharacteristicForService(
      COMMAND_SERVICE_UUID,
      SNAPSHOT_STATUS_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) return;
        if (characteristic?.value) {
          try {
            const bytes = decodeBase64ToBytes(characteristic.value);
            if (bytes.length >= 1) {
              const b = bytes[0] & 0xff; // eslint-disable-line no-bitwise
              const slots = [Boolean(b & 0x01), Boolean(b & 0x02), Boolean(b & 0x04)]; // eslint-disable-line no-bitwise
              
              // Only process if snapshot status actually changed
              const newStatus = { slots };
              const same = lastNotifiedSnapshotRef.current && 
                lastNotifiedSnapshotRef.current.slots[0] === slots[0] && 
                lastNotifiedSnapshotRef.current.slots[1] === slots[1] && 
                lastNotifiedSnapshotRef.current.slots[2] === slots[2];
              
              if (!same) {
                lastNotifiedSnapshotRef.current = newStatus;
                setSnapshotStatus(newStatus);
                
                // Defer store update to avoid synchronous updates during render
                setTimeout(() => {
                  useBleStore.getState().setSnapshotStatus(deviceId, newStatus);
                }, 0);
              }
            }
          } catch {}
        }
      }
    );
    return () => { sub?.remove && sub.remove(); };
  }, [device?.id, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read current statistics
  const readStatistics = useCallback(async (): Promise<FIFOStatistics | null> => {
    if (!device) return null;
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) return null;
      const characteristic = await device.readCharacteristicForService(
        COMMAND_SERVICE_UUID,
        STATISTICS_CHARACTERISTIC_UUID
      );
      if (characteristic?.value) {
        return parseStatistics(characteristic.value);
      }
    } catch {}
    return null;
  }, [device]);

  // Immediate stats refresh helper
  const refreshStatistics = useCallback(async () => {
    const stats = await readStatistics();
    if (stats) {
      setFifoPct(Math.round((stats.samplesStored / stats.bufferCapacity) * 100));
      const next = stats.isRecording ? ControlState.RUNNING : ControlState.STOPPED;
      setDeviceState(next);
      if (onStatisticsUpdate) onStatisticsUpdate(stats);
      if (onStateUpdate) onStateUpdate(next);
    }
  }, [readStatistics, onStatisticsUpdate, onStateUpdate]);

  // Read current location
  const readLocation = useCallback(async (): Promise<SensorLocation | null> => {
    if (!device) return null;
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) return null;
      const characteristic = await device.readCharacteristicForService(
        COMMAND_SERVICE_UUID,
        LOCATION_CHARACTERISTIC_UUID
      );
      if (characteristic?.value) {
        const bytes = decodeBase64ToBytes(characteristic.value);
        if (bytes.length >= 1) {
          return bytes[0] === 0 ? SensorLocation.RED : bytes[0] === 1 ? SensorLocation.GREEN : SensorLocation.UNKNOWN;
        }
      }
    } catch {}
    return null;
  }, [device]);

  // One-time initial reads to populate UI before first notifications
  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    (async () => {
      try {
        const isConnected = await device.isConnected();
        if (!isConnected) return;

        // Read command state
        try {
          const cs = await device.readCharacteristicForService(
            COMMAND_SERVICE_UUID,
            COMMAND_CHARACTERISTIC_UUID
          );
          if (!cancelled && cs?.value) {
            const b = decodeBase64ToBytes(cs.value);
            if (b.length >= 1) {
              let next: ControlState;
              switch (b[0]) {
                case 0:
                  next = ControlState.STOPPED;
                  break;
                case 1:
                  next = ControlState.RUNNING;
                  break;
                case 2:
                  next = ControlState.SNAPSHOTTING;
                  break;
                case 3:
                  next = ControlState.DUMPING;
                  break;
                case 4:
                  next = ControlState.SHOWING_LOCATION;
                  break;
                default:
                  next = ControlState.UNKNOWN;
              }
              const stateNames = {
                [ControlState.STOPPED]: 'STOPPED',
                [ControlState.RUNNING]: 'RUNNING',
                [ControlState.SNAPSHOTTING]: 'SNAPSHOTTING',
                [ControlState.DUMPING]: 'DUMPING',
                [ControlState.SHOWING_LOCATION]: 'SHOWING_LOCATION',
                [ControlState.UNKNOWN]: 'UNKNOWN',
              };
              console.log(`[ControlState] Device ${deviceId.slice(-6)}: Initial read = ${stateNames[next]} (byte=${b[0]})`);
              setDeviceState(next);
              if (onStateUpdate) onStateUpdate(next);
            }
          }
        } catch {}

        // Read location
        try {
          const lc = await device.readCharacteristicForService(
            COMMAND_SERVICE_UUID,
            LOCATION_CHARACTERISTIC_UUID
          );
          if (!cancelled && lc?.value) {
            const b = decodeBase64ToBytes(lc.value);
            if (b.length >= 1) {
              const loc = b[0] === 0 ? SensorLocation.RED : b[0] === 1 ? SensorLocation.GREEN : SensorLocation.UNKNOWN;
              setLocation(loc);
            }
          }
        } catch {}

        // Read snapshot status
        try {
          const ss = await device.readCharacteristicForService(
            COMMAND_SERVICE_UUID,
            SNAPSHOT_STATUS_CHARACTERISTIC_UUID
          );
          if (!cancelled && ss?.value) {
            const b = decodeBase64ToBytes(ss.value);
            if (b.length >= 1) {
              const bit = b[0] & 0xff; // eslint-disable-line no-bitwise
              const slots = [Boolean(bit & 0x01), Boolean(bit & 0x02), Boolean(bit & 0x04)]; // eslint-disable-line no-bitwise
              setSnapshotStatus({ slots });
            }
          }
        } catch {}
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [device, onStateUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send command to device directly
  const sendCommand = useCallback(async (command: ControlCommand): Promise<boolean> => {
    if (!device) return false;
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) return false;

      const commandNames = {
        [ControlCommand.STOP]: 'STOP',
        [ControlCommand.RUN]: 'RUN',
        [ControlCommand.STOP_SNAP]: 'STOP_SNAP',
        [ControlCommand.RESET]: 'RESET',
        [ControlCommand.DUMP]: 'DUMP',
        [ControlCommand.LOC_RED]: 'LOC_RED',
        [ControlCommand.LOC_GREEN]: 'LOC_GREEN',
        [ControlCommand.RESET_STEPS]: 'RESET_STEPS',
        [ControlCommand.IMU_TEST]: 'IMU_TEST',
        [ControlCommand.FIFO_STATS]: 'FIFO_STATS',
        [ControlCommand.LOCATION]: 'LOCATION',
        [ControlCommand.SNAPSHOT]: 'SNAPSHOT',
        [ControlCommand.SNAP_DELETE]: 'SNAP_DELETE',
        [ControlCommand.SNAP_DUMP]: 'SNAP_DUMP',
      };

      console.log(`[ControlCommand] Device ${deviceId.slice(-6)}: Sending ${commandNames[command] ?? 'UNKNOWN'}(${command})`);

      const encoded = encodeSingleByte(command);
      await device.writeCharacteristicWithResponseForService(
        COMMAND_SERVICE_UUID,
        COMMAND_CHARACTERISTIC_UUID,
        encoded
      );

      console.log(`[ControlCommand] Device ${deviceId.slice(-6)}: ${commandNames[command] ?? 'UNKNOWN'} sent successfully`);

      // Optimistic local updates for immediate UI feedback
      switch (command) {
        case ControlCommand.RUN:
          setDeviceState(ControlState.RUNNING);
          if (onStateUpdate) onStateUpdate(ControlState.RUNNING);
          break;
        case ControlCommand.STOP:
        case ControlCommand.STOP_SNAP:
        case ControlCommand.RESET:
          setDeviceState(ControlState.STOPPED);
          if (onStateUpdate) onStateUpdate(ControlState.STOPPED);
          break;
        case ControlCommand.LOC_RED:
          setLocation(SensorLocation.RED);
          break;
        case ControlCommand.LOC_GREEN:
          setLocation(SensorLocation.GREEN);
          break;
        default:
          break;
      }
      return true;
    } catch (error) {
      const commandNames = {
        [ControlCommand.STOP]: 'STOP',
        [ControlCommand.RUN]: 'RUN',
        [ControlCommand.STOP_SNAP]: 'STOP_SNAP',
        [ControlCommand.RESET]: 'RESET',
        [ControlCommand.DUMP]: 'DUMP',
        [ControlCommand.LOC_RED]: 'LOC_RED',
        [ControlCommand.LOC_GREEN]: 'LOC_GREEN',
        [ControlCommand.RESET_STEPS]: 'RESET_STEPS',
        [ControlCommand.IMU_TEST]: 'IMU_TEST',
        [ControlCommand.FIFO_STATS]: 'FIFO_STATS',
        [ControlCommand.LOCATION]: 'LOCATION',
        [ControlCommand.SNAPSHOT]: 'SNAPSHOT',
        [ControlCommand.SNAP_DELETE]: 'SNAP_DELETE',
        [ControlCommand.SNAP_DUMP]: 'SNAP_DUMP',
      };
      console.log(`[ControlCommand] Device ${deviceId.slice(-6)}: Failed to send ${commandNames[command] ?? 'UNKNOWN'}: ${error}`);
      return false;
    }
  }, [device]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send two-byte command
  const sendTwoByteCommand = useCallback(async (command: ControlCommand, param: number): Promise<boolean> => {
    if (!device) return false;
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) return false;
      const encoded = encodeTwoBytes(command, param);
      await device.writeCharacteristicWithResponseForService(
        COMMAND_SERVICE_UUID,
        COMMAND_CHARACTERISTIC_UUID,
        encoded
      );
      return true;
    } catch {
      return false;
    }
  }, [device]);

  // Helper: refresh snapshot status immediately
  const refreshSnapshotStatus = useCallback(async () => {
    if (!device) return;
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) return;
      const ss = await device.readCharacteristicForService(
        COMMAND_SERVICE_UUID,
        SNAPSHOT_STATUS_CHARACTERISTIC_UUID
      );
      if (ss?.value) {
        const b = decodeBase64ToBytes(ss.value);
        if (b.length >= 1) {
          const bit = b[0] & 0xff; // eslint-disable-line no-bitwise
          const slots = [Boolean(bit & 0x01), Boolean(bit & 0x02), Boolean(bit & 0x04)]; // eslint-disable-line no-bitwise
          setSnapshotStatus({ slots });
        }
      }
    } catch {}
  }, [device]);

  // Short polling loop to catch delayed snapshot bitmap updates
  const pollSnapshotStatus = useCallback(async (attempts = 5, delayMs = 300) => {
    for (let i = 0; i < attempts; i++) {
      await refreshSnapshotStatus();
      await new Promise<void>((res) => setTimeout(() => res(), delayMs));
    }
  }, [refreshSnapshotStatus]);

  // Convenience command methods
  const startRecording = useCallback(async () => sendCommand(ControlCommand.RUN), [sendCommand]);
  const stopRecording = useCallback(async () => sendCommand(ControlCommand.STOP), [sendCommand]);
  const stopAndSnapshot = useCallback(async () => {
    const ok = await sendCommand(ControlCommand.STOP_SNAP);
    if (ok) {
      // Fetch snapshot status and stats after STOP_SNAP
      refreshStatistics();
      pollSnapshotStatus();
    }
    return ok;
  }, [sendCommand, refreshStatistics, pollSnapshotStatus]);
  const resetFifo = useCallback(async () => sendCommand(ControlCommand.RESET), [sendCommand]);
  const dumpToSerial = useCallback(async () => sendCommand(ControlCommand.DUMP), [sendCommand]);
  const setLocationRed = useCallback(async () => sendCommand(ControlCommand.LOC_RED), [sendCommand]);
  const setLocationGreen = useCallback(async () => sendCommand(ControlCommand.LOC_GREEN), [sendCommand]);
  const resetSteps = useCallback(async () => sendCommand(ControlCommand.RESET_STEPS), [sendCommand]);
  const testImu = useCallback(async () => sendCommand(ControlCommand.IMU_TEST), [sendCommand]);
  const logFifoStats = useCallback(async () => sendCommand(ControlCommand.FIFO_STATS), [sendCommand]);
  const showLocation = useCallback(async () => sendCommand(ControlCommand.LOCATION), [sendCommand]);
  const snapshot = useCallback(async () => {
    const ok = await sendCommand(ControlCommand.SNAPSHOT);
    if (ok) pollSnapshotStatus();
    return ok;
  }, [sendCommand, pollSnapshotStatus]);
  const deleteSnapshot = useCallback(async (id: number = 0xFF) => {
    const ok = await sendTwoByteCommand(ControlCommand.SNAP_DELETE, id);
    if (ok) pollSnapshotStatus();
    return ok;
  }, [sendTwoByteCommand, pollSnapshotStatus]);
  const dumpSnapshot = useCallback(async (id: number = 0xFF) => {
    return sendTwoByteCommand(ControlCommand.SNAP_DUMP, id);
  }, [sendTwoByteCommand]);

  return {
    fifoPct,
    deviceState,
    snapshotStatus,
    location,
    readStatistics,
    readLocation,
    sendCommand,
    startRecording,
    stopRecording,
    stopAndSnapshot,
    resetFifo,
    dumpToSerial,
    setLocationRed,
    setLocationGreen,
    resetSteps,
    testImu,
    logFifoStats,
    showLocation,
    snapshot,
    deleteSnapshot,
    dumpSnapshot,
  };
}
