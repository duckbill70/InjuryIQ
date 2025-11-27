import { useCallback, useEffect, useRef } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';
import { decodeBase64ToBytes, encodeSingleByte, encodeTwoBytes } from './base64';

// StingRay Command Service (from StingRay BLE Services Guide - November 14, 2025)
const CONTROL_SERVICE_UUID = '12345679-1234-5678-1234-56789abcdef0';
const COMMAND_CHARACTERISTIC_UUID = '12345679-1234-5678-1234-56789abcdef1';
const STATISTICS_CHARACTERISTIC_UUID = '12345679-1234-5678-1234-56789abcdef2';
const LOCATION_CHARACTERISTIC_UUID = '12345679-1234-5678-1234-56789abcdef3';
const SNAPSHOT_STATUS_CHARACTERISTIC_UUID = '12345679-1234-5678-1234-56789abcdef4';

/**
 * Command codes for StingRay Device (Write-only to Command characteristic)
 * 
 * Note: The Command characteristic does NOT store state - it only accepts commands.
 * To read current state, parse the Statistics characteristic's is_recording flag (byte 14).
 * 
 * Commands:
 * - STOP (0): Stop recording
 * - RUN (1): Start recording  
 * - RESET (2): Clear FIFO buffer (STOP mode only)
 * - DUMP (3): Export data to serial (STOP mode only)
 * - LOC_RED (4): Set location to RED (STOP mode only)
 * - LOC_GREEN (5): Set location to GREEN (STOP mode only)
 * - RESET_STEPS (6): Reset step counter (STOP mode only)
 * - IMU_TEST (7): Test IMU and log current data
 * - FIFO_STATS (8): Log FIFO statistics to RTT
 * - LOCATION (9): Show location color for 5s then restore (STOP mode only)
 * - SNAPSHOT (10): Capture snapshot (STOP mode only)
 * - SNAP_DELETE (11): Delete snapshot(s) - param: 0-2 or 0xFF for all (STOP mode only)
 * - SNAP_DUMP (12): Dump snapshot(s) to serial - param: 0-2 or 0xFF for all (STOP mode only)
 */
export enum ControlCommand {
  STOP = 0,
  RUN = 1,
  RESET = 2,           // FIFO reset
  DUMP = 3,            // Dump to serial
  LOC_RED = 4,
  LOC_GREEN = 5,
  RESET_STEPS = 6,
  IMU_TEST = 7,
  FIFO_STATS = 8,
  LOCATION = 9,
  SNAPSHOT = 10,
  SNAP_DELETE = 11,
  SNAP_DUMP = 12,
}

/**
 * Derived state based on Statistics characteristic is_recording flag
 */
export enum ControlState {
  STOPPED = 0,    // is_recording = 0
  RUNNING = 1,    // is_recording = 1
  UNKNOWN = 255,
}

/**
 * Sensor location values
 */
export enum SensorLocation {
  RED = 0,    // Left foot
  GREEN = 1,  // Right foot
  UNKNOWN = 255,
}

interface UseControlProps {
  deviceId: string;
  onStateUpdate?: (state: ControlState) => void;
  onStatisticsUpdate?: (stats: FIFOStatistics) => void;
  onLocationUpdate?: (location: SensorLocation) => void;
  onSnapshotStatusUpdate?: (status: SnapshotStatus) => void;
  enabled?: boolean;
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

export interface SnapshotEntry {
  id: number;
  timestamp: number; // milliseconds
  duration: number;  // milliseconds
}

export interface SnapshotStatus {
  count: number;
  snapshots: SnapshotEntry[];
}

export const useControl = ({ deviceId, onStateUpdate, onStatisticsUpdate, onLocationUpdate, onSnapshotStatusUpdate, enabled = true }: UseControlProps) => {
  const { connected } = useBle();
  const device = connected[deviceId]?.device;
  const commandSubscriptionRef = useRef<any>(null);
  const statisticsSubscriptionRef = useRef<any>(null);
  const locationSubscriptionRef = useRef<any>(null);
  const snapshotStatusSubscriptionRef = useRef<any>(null);
  
  // Use refs to keep callbacks stable and prevent subscription recreation
  const onStateUpdateRef = useRef(onStateUpdate);
  const onStatisticsUpdateRef = useRef(onStatisticsUpdate);
  const onLocationUpdateRef = useRef(onLocationUpdate);
  const onSnapshotStatusUpdateRef = useRef(onSnapshotStatusUpdate);
  
  useEffect(() => {
    onStateUpdateRef.current = onStateUpdate;
    onStatisticsUpdateRef.current = onStatisticsUpdate;
    onLocationUpdateRef.current = onLocationUpdate;
    onSnapshotStatusUpdateRef.current = onSnapshotStatusUpdate;
  }, [onStateUpdate, onStatisticsUpdate, onLocationUpdate, onSnapshotStatusUpdate]);

  // Parse Snapshot Status characteristic (ASCII string)
  // Format: "3|0:3000:45000|1:3000:90000|2:3000:135000"
  // Count | id:timestamp:duration | id:timestamp:duration | ...
  const parseSnapshotStatus = (base64Data: string): SnapshotStatus | null => {
    try {
      const bytes = decodeBase64ToBytes(base64Data);
      const text = String.fromCharCode(...bytes);
      
      const parts = text.split('|');
      if (parts.length < 1) return null;
      
      const count = parseInt(parts[0], 10);
      if (isNaN(count)) return null;
      
      const snapshots: SnapshotEntry[] = [];
      for (let i = 1; i < parts.length; i++) {
        const entry = parts[i].split(':');
        if (entry.length === 3) {
          const id = parseInt(entry[0], 10);
          const timestamp = parseInt(entry[1], 10);
          const duration = parseInt(entry[2], 10);
          if (!isNaN(id) && !isNaN(timestamp) && !isNaN(duration)) {
            snapshots.push({ id, timestamp, duration });
          }
        }
      }
      
      return { count, snapshots };
    } catch (error) {
      console.error('Failed to parse snapshot status:', error);
      return null;
    }
  };

  // Parse Statistics characteristic (16 bytes)
  const parseStatistics = (base64Data: string): FIFOStatistics | null => {
    try {
      const bytes = decodeBase64ToBytes(base64Data);

      if (bytes.length !== 16) {
        console.warn('Statistics data wrong size:', bytes.length);
        return null;
      }

      // Convert to Uint8Array for DataView
      const uint8Array = new Uint8Array(bytes);
      const view = new DataView(uint8Array.buffer);
      
      return {
        samplesStored: view.getUint16(0, true),      // bytes 0-1
        samplesDropped: view.getUint16(2, true),     // bytes 2-3
        totalCaptured: view.getUint32(4, true),      // bytes 4-7
        durationSec: view.getUint16(8, true),        // bytes 8-9
        actualRateHz: view.getUint16(10, true),      // bytes 10-11
        bufferCapacity: view.getUint16(12, true),    // bytes 12-13
        isRecording: bytes[14] !== 0,                 // byte 14
        isFull: bytes[15] !== 0,                      // byte 15
      };
    } catch (error) {
      console.error('Failed to parse statistics:', error);
      return null;
    }
  };

  // Subscribe to Command characteristic for immediate state updates after commands
  const subscribeToCommand = useCallback(async () => {
    if (!device || !enabled || commandSubscriptionRef.current) return;

    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for command subscription');
        return;
      }

      commandSubscriptionRef.current = device.monitorCharacteristicForService(
        CONTROL_SERVICE_UUID,
        COMMAND_CHARACTERISTIC_UUID,
        (error: BleError | null, characteristic: Characteristic | null) => {
          if (error) {
            if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
              if (__DEV__) console.log('Device does not expose Command characteristic notifications');
              return;
            }
            if (error.message?.includes('was disconnected') || error.message?.includes('was cancelled')) {
              commandSubscriptionRef.current = null;
              return;
            }
            console.error('Command monitoring error:', error);
            return;
          }

          if (characteristic?.value) {
            try {
              const bytes = decodeBase64ToBytes(characteristic.value);
              if (bytes.length === 1) {
                const stateValue = bytes[0];
                // Map command echo to state: 0=STOPPED, 1=RUNNING
                const state = stateValue === 1 ? ControlState.RUNNING : ControlState.STOPPED;
                if (__DEV__) console.log('[Control] Command echo, state:', state === ControlState.RUNNING ? 'RUNNING' : 'STOPPED');
                onStateUpdateRef.current?.(state);
              }
            } catch (error) {
              console.error('Failed to parse command notification:', error);
            }
          }
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Service') || error.message.includes('Characteristic')) &&
        error.message.includes('not found')
      ) {
        if (__DEV__) console.log('Device does not support Command notifications');
        return;
      }
      console.error('Failed to subscribe to Command:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, enabled]);

  // Subscribe to Location characteristic for sensor position updates
  const subscribeToLocation = useCallback(async () => {
    if (!device || !enabled || locationSubscriptionRef.current) return;

    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for location subscription');
        return;
      }

      locationSubscriptionRef.current = device.monitorCharacteristicForService(
        CONTROL_SERVICE_UUID,
        LOCATION_CHARACTERISTIC_UUID,
        (error: BleError | null, characteristic: Characteristic | null) => {
          if (error) {
            if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
              if (__DEV__) console.log('Device does not expose Location characteristic');
              return;
            }
            if (error.message?.includes('was disconnected') || error.message?.includes('was cancelled')) {
              locationSubscriptionRef.current = null;
              return;
            }
            console.error('Location monitoring error:', error);
            return;
          }

          if (characteristic?.value) {
            try {
              const bytes = decodeBase64ToBytes(characteristic.value);
              if (bytes.length === 1) {
                const locationValue = bytes[0];
                const location = locationValue === 0 ? SensorLocation.RED : 
                                locationValue === 1 ? SensorLocation.GREEN : 
                                SensorLocation.UNKNOWN;
                if (__DEV__) console.log('[Control] Location update:', location === SensorLocation.RED ? 'RED (Left)' : location === SensorLocation.GREEN ? 'GREEN (Right)' : 'UNKNOWN');
                onLocationUpdateRef.current?.(location);
              }
            } catch (err) {
              console.error('Failed to parse location notification:', err);
            }
          }
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Service') || error.message.includes('Characteristic')) &&
        error.message.includes('not found')
      ) {
        if (__DEV__) console.log('Device does not support Location characteristic');
        return;
      }
      console.error('Failed to subscribe to Location:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, enabled]);

  // Subscribe to Statistics characteristic for state updates
  // Statistics characteristic provides is_recording flag and FIFO stats
  const subscribeToStatistics = useCallback(async () => {
    if (!device || !enabled || statisticsSubscriptionRef.current) return;

    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for statistics subscription');
        return;
      }

      statisticsSubscriptionRef.current = device.monitorCharacteristicForService(
        CONTROL_SERVICE_UUID,
        STATISTICS_CHARACTERISTIC_UUID,
        (error: BleError | null, characteristic: Characteristic | null) => {
          if (error) {
            if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
              if (__DEV__) console.log('Device does not expose Statistics characteristic');
              return;
            }
            if (error.message?.includes('was disconnected') || error.message?.includes('was cancelled')) {
              statisticsSubscriptionRef.current = null;
              return;
            }
            console.error('Statistics monitoring error:', error);
            return;
          }

          if (characteristic?.value) {
            const stats = parseStatistics(characteristic.value);
            if (stats) {
              // Notify statistics callback
              onStatisticsUpdateRef.current?.(stats);
              
              // Derive state from is_recording flag (as backup to command notifications)
              const state = stats.isRecording ? ControlState.RUNNING : ControlState.STOPPED;
              onStateUpdateRef.current?.(state);
            }
          }
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Service') || error.message.includes('Characteristic')) &&
        error.message.includes('not found')
      ) {
        if (__DEV__) console.log('Device does not support Statistics service');
        return;
      }
      console.error('Failed to subscribe to Statistics:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, enabled]);

  // Subscribe to Snapshot Status characteristic for snapshot updates
  const subscribeToSnapshotStatus = useCallback(async () => {
    if (!device || !enabled || snapshotStatusSubscriptionRef.current) return;

    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for snapshot status subscription');
        return;
      }

      snapshotStatusSubscriptionRef.current = device.monitorCharacteristicForService(
        CONTROL_SERVICE_UUID,
        SNAPSHOT_STATUS_CHARACTERISTIC_UUID,
        (error: BleError | null, characteristic: Characteristic | null) => {
          if (error) {
            if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
              if (__DEV__) console.log('Device does not expose Snapshot Status characteristic');
              return;
            }
            if (error.message?.includes('was disconnected') || error.message?.includes('was cancelled')) {
              snapshotStatusSubscriptionRef.current = null;
              return;
            }
            console.error('Snapshot Status monitoring error:', error);
            return;
          }

          if (characteristic?.value) {
            const status = parseSnapshotStatus(characteristic.value);
            if (status) {
              if (__DEV__) console.log('[Control] Snapshot status update:', status);
              onSnapshotStatusUpdateRef.current?.(status);
            }
          }
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Service') || error.message.includes('Characteristic')) &&
        error.message.includes('not found')
      ) {
        if (__DEV__) console.log('Device does not support Snapshot Status characteristic');
        return;
      }
      console.error('Failed to subscribe to Snapshot Status:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, enabled]);

  const unsubscribe = useCallback(async () => {
    if (commandSubscriptionRef.current) {
      commandSubscriptionRef.current.remove();
      commandSubscriptionRef.current = null;
    }
    if (statisticsSubscriptionRef.current) {
      statisticsSubscriptionRef.current.remove();
      statisticsSubscriptionRef.current = null;
    }
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
    if (snapshotStatusSubscriptionRef.current) {
      snapshotStatusSubscriptionRef.current.remove();
      snapshotStatusSubscriptionRef.current = null;
    }
  }, []);

  // Read current statistics (includes is_recording state)
  const readStatistics = useCallback(async (): Promise<FIFOStatistics | null> => {
    if (!device) return null;
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for statistics read');
        return null;
      }
      const characteristic = await device.readCharacteristicForService(
        CONTROL_SERVICE_UUID,
        STATISTICS_CHARACTERISTIC_UUID
      );
      if (characteristic?.value) {
        return parseStatistics(characteristic.value);
      }
    } catch (error) {
      console.error('Failed to read Statistics:', error);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  // Read current sensor location
  const readLocation = useCallback(async (): Promise<SensorLocation | null> => {
    if (!device) return null;
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for location read');
        return null;
      }
      const characteristic = await device.readCharacteristicForService(
        CONTROL_SERVICE_UUID,
        LOCATION_CHARACTERISTIC_UUID
      );
      if (characteristic?.value) {
        const bytes = decodeBase64ToBytes(characteristic.value);
        if (bytes.length === 1) {
          const locationValue = bytes[0];
          return locationValue === 0 ? SensorLocation.RED : 
                 locationValue === 1 ? SensorLocation.GREEN : 
                 SensorLocation.UNKNOWN;
        }
      }
    } catch (error) {
      console.error('Failed to read Location:', error);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  // Read current snapshot status
  const readSnapshotStatus = useCallback(async (): Promise<SnapshotStatus | null> => {
    if (!device) return null;
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for snapshot status read');
        return null;
      }
      const characteristic = await device.readCharacteristicForService(
        CONTROL_SERVICE_UUID,
        SNAPSHOT_STATUS_CHARACTERISTIC_UUID
      );
      if (characteristic?.value) {
        return parseSnapshotStatus(characteristic.value);
      }
    } catch (error) {
      console.error('Failed to read Snapshot Status:', error);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  // Send command to device
  const sendCommand = useCallback(async (command: ControlCommand): Promise<boolean> => {
    if (!device) return false;
    
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        if (__DEV__) console.warn('Device not connected for command write');
        return false;
      }
      
      const encoded = encodeSingleByte(command);
      
      // Log the byte being sent
      if (__DEV__) {
        console.log(`[Control] Sending single-byte command: 0x${command.toString(16).padStart(2, '0').toUpperCase()}`);
      }
      
      // Use write with response (per BLE Services Guide - Command characteristic requires .withResponse)
      await device.writeCharacteristicWithResponseForService(
        CONTROL_SERVICE_UUID,
        COMMAND_CHARACTERISTIC_UUID,
        encoded
      );
      return true;
    } catch (error) {
      console.error('Failed to send command:', error);
      return false;
    }
  }, [device]);

  // Send two-byte command to device (for snapshot operations)
  const sendTwoByteCommand = useCallback(async (command: ControlCommand, param: number): Promise<boolean> => {
    if (!device) return false;
    
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        if (__DEV__) console.warn('Device not connected for command write');
        return false;
      }
      
      const encoded = encodeTwoBytes(command, param);
      
      // Log the bytes being sent
      if (__DEV__) {
        const bytes = decodeBase64ToBytes(encoded);
        console.log(`[Control] Sending two-byte command: 0x${command.toString(16).padStart(2, '0').toUpperCase()} 0x${param.toString(16).padStart(2, '0').toUpperCase()} (${bytes.map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(' ')})`);
      }
      
      // Use write with response (per BLE Services Guide - Command characteristic requires .withResponse)
      await device.writeCharacteristicWithResponseForService(
        CONTROL_SERVICE_UUID,
        COMMAND_CHARACTERISTIC_UUID,
        encoded
      );
      return true;
    } catch (error) {
      console.error('Failed to send two-byte command:', error);
      return false;
    }
  }, [device]);

  // Convenience command methods
  const startRecording = useCallback(() => sendCommand(ControlCommand.RUN), [sendCommand]);
  const stopRecording = useCallback(() => sendCommand(ControlCommand.STOP), [sendCommand]);
  const resetFifo = useCallback(() => sendCommand(ControlCommand.RESET), [sendCommand]);
  const dumpToSerial = useCallback(() => sendCommand(ControlCommand.DUMP), [sendCommand]);
  const setLocationRed = useCallback(() => sendCommand(ControlCommand.LOC_RED), [sendCommand]);
  const setLocationGreen = useCallback(() => sendCommand(ControlCommand.LOC_GREEN), [sendCommand]);
  const resetSteps = useCallback(() => sendCommand(ControlCommand.RESET_STEPS), [sendCommand]);
  const testImu = useCallback(() => sendCommand(ControlCommand.IMU_TEST), [sendCommand]);
  const logFifoStats = useCallback(() => sendCommand(ControlCommand.FIFO_STATS), [sendCommand]);
  const showLocation = useCallback(() => sendCommand(ControlCommand.LOCATION), [sendCommand]);
  const snapshot = useCallback(() => sendCommand(ControlCommand.SNAPSHOT), [sendCommand]);
  const deleteSnapshot = useCallback((id: number = 0xFF) => sendTwoByteCommand(ControlCommand.SNAP_DELETE, id), [sendTwoByteCommand]);
  const dumpSnapshot = useCallback((id: number = 0xFF) => sendTwoByteCommand(ControlCommand.SNAP_DUMP, id), [sendTwoByteCommand]);

  useEffect(() => {
    if (enabled && device) {
      subscribeToCommand();
      subscribeToStatistics();
      subscribeToLocation();
      subscribeToSnapshotStatus();
      return () => {
        unsubscribe();
      };
    } else {
      unsubscribe();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, device]);

  return {
    subscribe: subscribeToCommand,
    unsubscribe,
    readStatistics,
    readLocation,
    readSnapshotStatus,
    sendCommand,
    startRecording,
    stopRecording,
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
};
