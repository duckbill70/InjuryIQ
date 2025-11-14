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
  const { startRecording, stopRecording, readStatistics } = useControl({ 
    deviceId, 
    enabled: true,
    onStateUpdate: (state) => setCurrentState(state),
  });
  const prevTargetStateRef = React.useRef<ControlState | null>(null);

  // Initialize current state
  React.useEffect(() => {
    const init = async () => {
      const stats = await readStatistics();
      if (stats) {
        setCurrentState(stats.isRecording ? ControlState.RUNNING : ControlState.STOPPED);
      }
    };
    init();
  }, [deviceId, readStatistics]);

  React.useEffect(() => {
    // Only run when targetState changes
    if (targetState === null || targetState === prevTargetStateRef.current) {
      return;
    }

    prevTargetStateRef.current = targetState;

    const setDeviceState = async () => {
      try {
        if (currentState !== targetState) {
          let success = false;
          
          if (targetState === ControlState.RUNNING) {
            success = await startRecording();
          } else if (targetState === ControlState.STOPPED) {
            success = await stopRecording();
          }

          if (!success) {
            logDeviceStateError(
              deviceId,
              ControlState[targetState],
              currentState !== null ? ControlState[currentState] : 'UNKNOWN',
              position
            );
          } else if (currentState !== null) {
            if (__DEV__) {
              console.log(
                `[DeviceController] Device ${deviceId} transitioned from ${ControlState[currentState]} to ${ControlState[targetState]}`
              );
            }
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
