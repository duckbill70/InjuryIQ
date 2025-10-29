/* eslint-disable no-bitwise */
import { useCallback, useEffect } from 'react';
import type { BleError, Characteristic } from 'react-native-ble-plx';
import { useBle } from './BleProvider';
import { decodeBase64ToBytes } from './base64';

const DIAGNOSTICS_SERVICE_UUID = '87654321-4321-8765-4321-210987654321';
const ERROR_CODE_CHARACTERISTIC_UUID = '87654321-4321-8765-4321-210987654322';
const SYSTEM_STATUS_CHARACTERISTIC_UUID = '87654321-4321-8765-4321-210987654325';

const getUint32LE = (bytes: number[], offset: number) =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

export interface SystemStatus {
  bleStatus: number;
  imuStatus: number;
  ledMode: number;
  batteryLevel: number;
  uptimeSeconds: number;
  fifoTotalSamples: number;
  fifoCurrentSize: number;
  totalErrorCount: number;
  totalDisconnectCount: number;
  bleWriteFailures: number;
  maxLoopTimeMs: number;
  reserved: [number, number, number, number];
}

export enum ErrorCode {
  ERR_NONE = 0,
  ERR_IMU_INIT_FAIL = 1,
  ERR_IMU_READ_FAIL = 2,
  ERR_BLE_INIT_FAIL = 3,
  ERR_BLE_CONN_LOST = 4,
  ERR_FLASH_WRITE_FAIL = 5,
  ERR_FLASH_READ_FAIL = 6,
  ERR_BATTERY_READ_FAIL = 7,
  ERR_LOW_BATTERY = 8,
  ERR_SYSTEM_OVERLOAD = 9,
  ERR_WATCHDOG_RESET = 10,
  ERR_SERIAL_DEBUG_ENABLED = 11,
  ERR_TENSORFLOW_DISABLED = 12,
  ERR_BLE_CONN_TIMEOUT = 13,
  ERR_BLE_RSSI_LOW = 14,
  ERR_BLE_MTU_FAIL = 15,
  ERR_BLE_WRITE_FAIL = 16,
  ERR_FIFO_ALLOC_FAIL = 17,
  ERR_FIFO_NOT_INITIALIZED = 18,
  ERR_FIFO_OVERFLOW = 19,
  ERR_UNKNOWN = 255,
}

export const getErrorDescription = (code: ErrorCode): string => {
  switch (code) {
    case ErrorCode.ERR_NONE:
      return 'No Error';
    case ErrorCode.ERR_IMU_INIT_FAIL:
      return 'IMU initialization failed';
    case ErrorCode.ERR_IMU_READ_FAIL:
      return 'IMU data read failure';
    case ErrorCode.ERR_BLE_INIT_FAIL:
      return 'BLE initialization failed';
    case ErrorCode.ERR_BLE_CONN_LOST:
      return 'BLE connection lost';
    case ErrorCode.ERR_FLASH_WRITE_FAIL:
      return 'Flash write failed';
    case ErrorCode.ERR_FLASH_READ_FAIL:
      return 'Flash read failed';
    case ErrorCode.ERR_BATTERY_READ_FAIL:
      return 'Battery read failed';
    case ErrorCode.ERR_LOW_BATTERY:
      return 'Battery critically low';
    case ErrorCode.ERR_SYSTEM_OVERLOAD:
      return 'System performance degraded';
    case ErrorCode.ERR_WATCHDOG_RESET:
      return 'Watchdog reset occurred';
    case ErrorCode.ERR_SERIAL_DEBUG_ENABLED:
      return 'Serial debug enabled';
    case ErrorCode.ERR_TENSORFLOW_DISABLED:
      return 'TensorFlow disabled';
    case ErrorCode.ERR_BLE_CONN_TIMEOUT:
      return 'BLE connection timeout';
    case ErrorCode.ERR_BLE_RSSI_LOW:
      return 'BLE signal too weak';
    case ErrorCode.ERR_BLE_MTU_FAIL:
      return 'BLE MTU negotiation failed';
    case ErrorCode.ERR_BLE_WRITE_FAIL:
      return 'BLE characteristic write failed';
    case ErrorCode.ERR_FIFO_ALLOC_FAIL:
      return 'FIFO allocation failure';
    case ErrorCode.ERR_FIFO_NOT_INITIALIZED:
      return 'FIFO not initialized';
    case ErrorCode.ERR_FIFO_OVERFLOW:
      return 'FIFO buffer overflow';
    case ErrorCode.ERR_UNKNOWN:
    default:
      return 'Unknown error';
  }
};

export const getPerformanceGrade = (status: SystemStatus): 'Excellent' | 'Good' | 'Fair' | 'Poor' => {
  if (status.maxLoopTimeMs < 20) return 'Excellent';
  if (status.maxLoopTimeMs < 50) return 'Good';
  if (status.maxLoopTimeMs < 75) return 'Fair';
  return 'Poor';
};

export const getDisconnectRatePerHour = (status: SystemStatus): number => {
  if (status.uptimeSeconds === 0) {
    return 0;
  }
  const hours = status.uptimeSeconds / 3600;
  return status.totalDisconnectCount / hours;
};

const parseSystemStatusBytes = (bytes: number[]): SystemStatus | null => {
  if (bytes.length < 36) {
    console.warn('System status payload too short:', bytes.length);
    return null;
  }

  return {
    bleStatus: bytes[0],
    imuStatus: bytes[1],
    ledMode: bytes[2],
    batteryLevel: bytes[3],
    uptimeSeconds: getUint32LE(bytes, 4),
    fifoTotalSamples: getUint32LE(bytes, 8),
    fifoCurrentSize: getUint32LE(bytes, 12),
    totalErrorCount: getUint32LE(bytes, 16),
    totalDisconnectCount: getUint32LE(bytes, 20),
    bleWriteFailures: getUint32LE(bytes, 24),
    maxLoopTimeMs: getUint32LE(bytes, 28),
    reserved: [bytes[32], bytes[33], bytes[34], bytes[35]],
  };
};

const parseErrorEntryBytes = (bytes: number[]): { code: ErrorCode; description: string } | null => {
  if (!bytes.length) {
    return null;
  }

  const code = bytes[0] as ErrorCode;
  const descriptionBytes = bytes.slice(1);
  let description = '';

  for (let i = 0; i < descriptionBytes.length; i += 1) {
    if (descriptionBytes[i] === 0) break;
    description += String.fromCharCode(descriptionBytes[i]);
  }

  return { code, description };
};

interface UseDiagnosticsProps {
  deviceId: string;
  onSystemStatusUpdate?: (status: SystemStatus) => void;
  onErrorUpdate?: (errorCode: ErrorCode, description: string) => void;
  enabled?: boolean;
}

export const useDiagnostics = ({ deviceId, onSystemStatusUpdate, onErrorUpdate, enabled = true }: UseDiagnosticsProps) => {
  const { connected } = useBle();
  const device = connected[deviceId]?.device;

  const parseSystemStatus = useCallback((base64Data: string): SystemStatus | null => {
    const bytes = decodeBase64ToBytes(base64Data);
    return parseSystemStatusBytes(bytes);
  }, []);

  const parseErrorLog = useCallback((base64Data: string): { code: ErrorCode; description: string } | null => {
    const bytes = decodeBase64ToBytes(base64Data);
    return parseErrorEntryBytes(bytes);
  }, []);

  const subscribeSystemStatus = useCallback(async () => {
    if (!device || !enabled) return;

    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for system status subscription');
        return;
      }

      await device.monitorCharacteristicForService(
        DIAGNOSTICS_SERVICE_UUID,
        SYSTEM_STATUS_CHARACTERISTIC_UUID,
        (error: BleError | null, characteristic: Characteristic | null) => {
          if (error) {
            if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
              if (__DEV__) console.log('Device does not expose diagnostics system status characteristic');
              return;
            }
            // Suppress expected disconnect/cancellation errors - device is reconnecting
            if (error.message?.includes('was disconnected') || error.message?.includes('was cancelled')) {
              if (__DEV__) console.log('[Diagnostics] Device disconnected, monitor will restart on reconnect');
              return;
            }
            console.error('System status monitoring error:', error);
            return;
          }

          if (characteristic?.value) {
            const status = parseSystemStatus(characteristic.value);
            if (status) {
              onSystemStatusUpdate?.(status);
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
        if (__DEV__) console.log('Device does not support diagnostics system status');
        return;
      }
      console.error('Failed to subscribe to system status:', error);
    }
  }, [device, enabled, onSystemStatusUpdate, parseSystemStatus]);

  const subscribeErrorCode = useCallback(async () => {
    if (!device || !enabled) return;

    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for error code subscription');
        return;
      }

      await device.monitorCharacteristicForService(
        DIAGNOSTICS_SERVICE_UUID,
        ERROR_CODE_CHARACTERISTIC_UUID,
        (error: BleError | null, characteristic: Characteristic | null) => {
          if (error) {
            if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
              if (__DEV__) console.log('Device does not expose diagnostics error characteristic');
              return;
            }
            // Suppress expected disconnect/cancellation errors - device is reconnecting
            if (error.message?.includes('was disconnected') || error.message?.includes('was cancelled')) {
              if (__DEV__) console.log('[Diagnostics] Device disconnected, monitor will restart on reconnect');
              return;
            }
            console.error('Error code monitoring error:', error);
            return;
          }

          if (characteristic?.value) {
            const entry = parseErrorLog(characteristic.value);
            if (entry) {
              onErrorUpdate?.(entry.code, entry.description || getErrorDescription(entry.code));
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
        if (__DEV__) console.log('Device does not support diagnostics error logging');
        return;
      }
      console.error('Failed to subscribe to error codes:', error);
    }
  }, [device, enabled, onErrorUpdate, parseErrorLog]);

  const subscribe = useCallback(async () => {
    await Promise.all([subscribeSystemStatus(), subscribeErrorCode()]);
  }, [subscribeSystemStatus, subscribeErrorCode]);

  const unsubscribe = useCallback(async () => {
    if (!device) return;
    // Subscriptions are disposed automatically when the device disconnects.
  }, [device]);

  const readSystemStatus = useCallback(async (): Promise<SystemStatus | null> => {
    if (!device) return null;

    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for system status read');
        return null;
      }

      const characteristic = await device.readCharacteristicForService(
        DIAGNOSTICS_SERVICE_UUID,
        SYSTEM_STATUS_CHARACTERISTIC_UUID
      );

      if (characteristic?.value) {
        return parseSystemStatus(characteristic.value);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Service') || error.message.includes('Characteristic')) &&
        error.message.includes('not found')
      ) {
        if (__DEV__) console.log('Device does not support diagnostics service');
        return null;
      }
      console.error('Failed to read system status:', error);
    }

    return null;
  }, [device, parseSystemStatus]);

  useEffect(() => {
    if (enabled && device) {
      subscribe();
      return () => {
        unsubscribe();
      };
    }
    return undefined;
  }, [enabled, device, subscribe, unsubscribe]);

  return {
    subscribe,
    unsubscribe,
    subscribeSystemStatus,
    subscribeErrorCode,
    readSystemStatus,
    parseSystemStatus,
    parseErrorLog,
    getPerformanceGrade,
    getDisconnectRatePerHour,
    getErrorDescription,
    ErrorCode,
  };
};