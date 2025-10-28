import { useCallback, useEffect } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';
import { decodeSingleByte, encodeSingleByte } from './base64';

// StingRay Control Service (from StingRay BLE Services Guide)
const CONTROL_SERVICE_UUID = 'f0000001-abcd-4a0c-9a1a-1234567890ab';
const CONTROL_CHARACTERISTIC_UUID = 'f0000002-abcd-4a0c-9a1a-1234567890ab';

// Control state values documented by firmware
export enum ControlState {
  STANDBY = 0,
  RUN = 1,
  STOP = 2,
  OFF = 3,
  FIFO_RESET = 11, // Special command value, honored only when already in STANDBY
}

interface UseControlProps {
  deviceId: string;
  onStateUpdate?: (state: ControlState) => void;
  enabled?: boolean;
}

export const useControl = ({ deviceId, onStateUpdate, enabled = true }: UseControlProps) => {
  const { connected } = useBle();
  const device = connected[deviceId]?.device;

  const parseState = useCallback((base64Data: string): ControlState => {
    const value = decodeSingleByte(base64Data);
    switch (value) {
      case 0:
        return ControlState.STANDBY;
      case 1:
        return ControlState.RUN;
      case 2:
        return ControlState.STOP;
      case 3:
        return ControlState.OFF;
      case 11:
        return ControlState.FIFO_RESET;
      default:
        // Treat unknown values conservatively as STOP (neutral, non-destructive)
        return ControlState.STOP;
    }
  }, []);

  const encodeState = useCallback((state: ControlState): string => {
    return encodeSingleByte(state);
  }, []);

  // Subscribe to control state notifications
  const subscribe = useCallback(async () => {
    if (!device || !enabled) return;

    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for control subscription');
        return;
      }

      await device.monitorCharacteristicForService(
        CONTROL_SERVICE_UUID,
        CONTROL_CHARACTERISTIC_UUID,
        (error: BleError | null, characteristic: Characteristic | null) => {
          if (error) {
            if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
              console.log('Device does not expose Control characteristic');
              return;
            }
            console.error('Control monitoring error:', error);
            return;
          }

          if (characteristic?.value) {
            const state = parseState(characteristic.value);
            onStateUpdate?.(state);
          }
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Service') || error.message.includes('Characteristic')) &&
        error.message.includes('not found')
      ) {
        console.log('Device does not support Control service');
        return;
      }
      console.error('Failed to subscribe to Control service:', error);
    }
  }, [device, enabled, onStateUpdate, parseState]);

  const unsubscribe = useCallback(async () => {
    if (!device) return;
    // react-native-ble-plx disposes monitors on disconnect; nothing to do here.
  }, [device]);

  // Read current control state
  const readState = useCallback(async (): Promise<ControlState | null> => {
    if (!device) return null;
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for control state read');
        return null;
      }
      const characteristic = await device.readCharacteristicForService(
        CONTROL_SERVICE_UUID,
        CONTROL_CHARACTERISTIC_UUID
      );
      if (characteristic?.value) {
        return parseState(characteristic.value);
      }
    } catch (error) {
      console.error('Failed to read Control state:', error);
    }
    return null;
  }, [device, parseState]);

  // Write control state (firmware enforces transitions; this call may be ignored if invalid)
  const setState = useCallback(async (state: ControlState): Promise<boolean> => {
    if (!device) return false;
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.warn('Device not connected for control state write');
        return false;
      }
      const encoded = encodeState(state);
      await device.writeCharacteristicWithResponseForService(
        CONTROL_SERVICE_UUID,
        CONTROL_CHARACTERISTIC_UUID,
        encoded
      );
      return true;
    } catch (error) {
      console.error('Failed to write Control state:', error);
      return false;
    }
  }, [device, encodeState]);

  // Special helper for issuing FIFO reset command (value 11)
  const resetFifo = useCallback(async (): Promise<boolean> => {
    return setState(ControlState.FIFO_RESET);
  }, [setState]);

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
    readState,
    setState,
    resetFifo,
    parseState,
    encodeState,
    ControlState,
  };
};
