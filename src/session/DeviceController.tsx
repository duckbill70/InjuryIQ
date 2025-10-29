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
  const { setState, readState } = useControl({ deviceId, enabled: true });
  const prevTargetStateRef = React.useRef<ControlState | null>(null);

  React.useEffect(() => {
    // Only run when targetState changes
    if (targetState === null || targetState === prevTargetStateRef.current) {
      return;
    }

    prevTargetStateRef.current = targetState;

    const setDeviceState = async () => {
      try {
        const currentState = await readState();

        if (currentState !== targetState) {
          const success = await setState(targetState);

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
  }, [targetState, deviceId, position, setState, readState, logDeviceStateError]);

  return null;
};
