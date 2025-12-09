import React from 'react';
import { useControl, ControlState } from '../ble/useControl';
import { useSession } from './SessionProvider';

interface DeviceControllerProps {
  deviceId: string;
  targetState: ControlState | null;
  position?: string;
}

/**
 * Component to control a single device's state
 * When targetState changes, sends command to device and logs any errors
 */
export const DeviceController: React.FC<DeviceControllerProps> = ({
  deviceId,
  targetState,
  position,
}) => {
  const { logDeviceStateError } = useSession();
  const [currentState, setCurrentState] = React.useState<ControlState | null>(null);
  
  // Use stable callback ref
  const handleStateUpdate = React.useCallback((state: ControlState) => {
    if (__DEV__) {
      console.log(`[DeviceController] State update received for ${deviceId}: ${ControlState[state]}`);
    }
    setCurrentState(state);
  }, [deviceId]);
  
  const { startRecording, stopRecording, readStatistics } = useControl({ 
    deviceId, 
    enabled: true,
    onStateUpdate: handleStateUpdate,
  });
  const prevTargetStateRef = React.useRef<ControlState | null>(null);

  // Initialize current state
  React.useEffect(() => {
    const init = async () => {
      const stats = await readStatistics();
      if (stats) {
        const initialState = stats.isRecording ? ControlState.RUNNING : ControlState.STOPPED;
        if (__DEV__) {
          console.log(`[DeviceController] Initial state read for ${deviceId}: ${ControlState[initialState]}`);
        }
        setCurrentState(initialState);
      }
    };
    init();
  }, [deviceId, readStatistics]);

  React.useEffect(() => {
    // Only run when targetState changes
    if (targetState === null || targetState === prevTargetStateRef.current) {
      return;
    }

    if (__DEV__) {
      console.log(`[DeviceController] Target state changed to ${targetState !== null ? ControlState[targetState] : 'null'} for device ${deviceId}`);
    }

    prevTargetStateRef.current = targetState;

    const setDeviceState = async () => {
      try {
        if (targetState === ControlState.STOPPED) {
          if (__DEV__) console.log(`[DeviceController] Forcing stopRecording for device ${deviceId}`);
          const success = await stopRecording();
          if (!success) {
            console.warn(`[DeviceController] Stop command failed for device ${deviceId}`);
            logDeviceStateError(
              deviceId,
              ControlState[targetState],
              currentState !== null ? ControlState[currentState] : 'UNKNOWN',
              position
            );
          }
        } else if (targetState === ControlState.RUNNING && currentState !== ControlState.RUNNING) {
          if (__DEV__) console.log(`[DeviceController] Calling startRecording for device ${deviceId}`);
          const success = await startRecording();
          if (!success) {
            console.warn(`[DeviceController] Start command failed for device ${deviceId}`);
            logDeviceStateError(
              deviceId,
              ControlState[targetState],
              currentState !== null ? ControlState[currentState] : 'UNKNOWN',
              position
            );
          }
        } else {
          if (__DEV__) {
            console.log(`[DeviceController] Device ${deviceId} already in target state ${ControlState[targetState]}`);
          }
        }
      } catch (error) {
        console.error(`[DeviceController] Failed to set device ${deviceId} to ${ControlState[targetState]}:`, error);
        logDeviceStateError(deviceId, ControlState[targetState], 'ERROR', position);
      }
    };

    setDeviceState();
  }, [targetState, currentState, deviceId, position, startRecording, stopRecording, logDeviceStateError]);

  return null;
};
