/**
 * PowerStateCycler - Two-button power control for BLE devices
 * 
 * This component provides a toggle-style interface with separate ON/OFF buttons:
 * - ON button (green): OFF → STOP (goes through STANDBY automatically)
 * - OFF button (red): STOP → OFF (goes through STANDBY automatically)
 * - Buttons are only enabled in OFF or STOP states
 * - Active button shows white border (pressed state)
 * - Inactive buttons are dimmed
 * 
 * USAGE - Hook (custom UI):
 * ```tsx
 * import { usePowerStateCycler } from './PowerStateCycler';
 * 
 * const { currentState, turnOn, turnOff, isBusy } = usePowerStateCycler({
 *   deviceId: device.id,
 *   enabled: true,
 *   onError: (msg) => Alert.alert('Error', msg),
 * });
 * 
 * <Pressable onPress={turnOn} disabled={currentState !== ControlState.OFF}>
 *   <Text>Turn ON</Text>
 * </Pressable>
 * <Pressable onPress={turnOff} disabled={currentState !== ControlState.STOP}>
 *   <Text>Turn OFF</Text>
 * </Pressable>
 * ```
 * 
 * USAGE - Ready-to-use Two-Button Component:
 * ```tsx
 * import { PowerStateButton } from './PowerStateCycler';
 * 
 * <PowerStateButton 
 *   deviceId={device.id} 
 *   enabled={true}
 * />
 * ```
 * 
 * BEHAVIOR:
 * - ON button: only enabled when device is in OFF state
 * - OFF button: only enabled when device is in STOP state
 * - In RUN or STANDBY states, both buttons are disabled
 * - Always waits for state confirmation after each transition (polling with timeout)
 * - If state changes externally during a multi-step transition, the operation aborts
 * 
 * PROPS - usePowerStateCycler:
 * - deviceId: string - BLE device identifier
 * - enabled?: boolean - Enable/disable control (default: true)
 * - onError?: (message: string) => void - Error callback
 * - timeoutMs?: number - State confirmation timeout (default: 4000ms)
 * 
 * PROPS - PowerStateButton:
 * - deviceId: string - BLE device identifier
 * - enabled?: boolean - Enable/disable buttons (default: true)
 * - style?: ViewStyle - Additional container styling
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View, StyleProp, ViewStyle } from 'react-native';
import { Power } from 'lucide-react-native';
import { ControlState, useControl } from '../ble/useControl';
import { useTheme } from '../theme/ThemeContext';

interface UsePowerStateCyclerOptions {
  deviceId: string;
  enabled?: boolean;
  onError?: (message: string) => void;
  timeoutMs?: number;
}

interface UsePowerStateCyclerResult {
  currentState: ControlState | null;
  isBusy: boolean;
  turnOn: () => Promise<boolean>;
  turnOff: () => Promise<boolean>;
}

/**
 * Hook: Simple power state control with separate ON/OFF functions
 * - turnOn: OFF → STOP (via STANDBY)
 * - turnOff: STOP → OFF (via STANDBY)
 */
export function usePowerStateCycler(options: UsePowerStateCyclerOptions): UsePowerStateCyclerResult {
  const { deviceId, enabled = true, onError, timeoutMs = 4000 } = options;

  const [currentState, setCurrentState] = useState<ControlState | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const abortRef = useRef<{ abort: boolean }>({ abort: false });
  const stateRef = useRef<ControlState | null>(null);

  const { subscribe, unsubscribe, readState, setState } = useControl({
    deviceId,
    enabled: enabled && !!deviceId,
    onStateUpdate: (s) => {
      setCurrentState(s);
      stateRef.current = s;
    },
  });

  // Initialize and subscribe for state updates
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deviceId || !enabled) {
        setCurrentState(null);
        stateRef.current = null;
        return;
      }
      const s = await readState();
      if (!cancelled) {
        setCurrentState(s);
        stateRef.current = s;
      }
    })();
    if (deviceId && enabled) subscribe();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [deviceId, enabled, readState, subscribe, unsubscribe]);

  /**
   * Wait for a specific target state with timeout
   */
  const waitForState = useCallback(
    async (targetState: ControlState, timeout: number): Promise<boolean> => {
      const pollInterval = 100;
      const maxAttempts = Math.floor(timeout / pollInterval);
      const abortToken = abortRef.current;

      for (let i = 0; i < maxAttempts; i++) {
        if (abortToken.abort) {
          return false;
        }
        if (stateRef.current === targetState) {
          return true;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
      }
      return false;
    },
    []
  );

  /**
   * Turn ON: OFF → STOP (via STANDBY)
   */
  const turnOn = useCallback(async (): Promise<boolean> => {
    if (!enabled || isBusy || !deviceId) {
      return false;
    }

    const startState = stateRef.current;
    if (startState !== ControlState.CONTROL_OFF) {
      return false; // Only works from OFF state
    }

    // Create new abort token for this operation
    const abortToken = { abort: false };
    abortRef.current = abortToken;

    setIsBusy(true);

    try {
      // OFF → STANDBY
      await setState(ControlState.CONTROL_STANDBY);
      const standbyOk = await waitForState(ControlState.CONTROL_STANDBY, timeoutMs);
      if (!standbyOk || abortToken.abort) {
        onError?.('Failed to reach STANDBY from OFF');
        return false;
      }

      // STANDBY → STOP
      await setState(ControlState.CONTROL_STOP);
      const stopOk = await waitForState(ControlState.CONTROL_STOP, timeoutMs);
      if (!stopOk || abortToken.abort) {
        onError?.('Failed to reach STOP from STANDBY');
        return false;
      }

      return true;
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Unknown error turning on');
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [enabled, isBusy, deviceId, setState, waitForState, timeoutMs, onError]);

  /**
   * Turn OFF: STOP → OFF (via STANDBY)
   */
  const turnOff = useCallback(async (): Promise<boolean> => {
    if (!enabled || isBusy || !deviceId) {
      return false;
    }

    const startState = stateRef.current;
    if (startState !== ControlState.CONTROL_STOP) {
      return false; // Only works from STOP state
    }

    // Create new abort token for this operation
    const abortToken = { abort: false };
    abortRef.current = abortToken;

    setIsBusy(true);

    try {
      // STOP → STANDBY
      await setState(ControlState.CONTROL_STANDBY);
      const standbyOk = await waitForState(ControlState.CONTROL_STANDBY, timeoutMs);
      if (!standbyOk || abortToken.abort) {
        onError?.('Failed to reach STANDBY from STOP');
        return false;
      }

      // STANDBY → OFF
      await setState(ControlState.CONTROL_OFF);
      const offOk = await waitForState(ControlState.CONTROL_OFF, timeoutMs);
      if (!offOk || abortToken.abort) {
        onError?.('Failed to reach OFF from STANDBY');
        return false;
      }

      return true;
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Unknown error turning off');
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [enabled, isBusy, deviceId, setState, waitForState, timeoutMs, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current.abort = true;
    };
  }, []);

  return { currentState, isBusy, turnOn, turnOff };
}

// Two-button toggle component (ON/OFF)
interface PowerStateButtonProps {
  deviceId: string;
  enabled?: boolean;
  buttonSize?: number;
  style?: StyleProp<ViewStyle>;
}

export const PowerStateButton: React.FC<PowerStateButtonProps> = ({ deviceId, enabled = true, buttonSize = 36, style }) => {
  const { theme } = useTheme();
  const { currentState, isBusy, turnOn, turnOff } = usePowerStateCycler({ deviceId, enabled });

  const handleTurnOn = useCallback(async () => {
    if (isBusy) return;
    await turnOn();
  }, [turnOn, isBusy]);

  const handleTurnOff = useCallback(async () => {
    if (isBusy) return;
    await turnOff();
  }, [turnOff, isBusy]);

  // Buttons only enabled in OFF or STOP states
  const isOffState = currentState === ControlState.CONTROL_OFF;
  const isStopState = currentState === ControlState.CONTROL_STOP;
  const buttonsEnabled = isOffState || isStopState;

  // Shared button styles
  const buttonBaseStyle = {
    width: buttonSize,
    height: buttonSize,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
  };

  const iconSize = Math.round(buttonSize * 0.55); // Icon is ~55% of button size
  const disabledOpacity = 0.4;
  const pressedOpacity = 0.7;
  const pressedScale = 0.95;

  return (
    <View style={[{ flexDirection: 'row', gap: 4 }, style]}>
      {/* ON Button - Green, enabled only when OFF */}
      <Pressable
        onPress={handleTurnOn}
        disabled={!enabled || isBusy || !deviceId || !isOffState}
        style={({ pressed }) => [
          buttonBaseStyle,
          {
            backgroundColor: theme.colors.deepGreen,
            borderColor: theme.colors.white,
          },
          (!enabled || isBusy || !buttonsEnabled || !isOffState) && { opacity: disabledOpacity },
          pressed && isOffState && { opacity: pressedOpacity, transform: [{ scale: pressedScale }] },
        ]}
      >
        <Power size={iconSize} color={theme.colors.white} />
      </Pressable>

      {/* OFF Button - Red, enabled only when STOP */}
      <Pressable
        onPress={handleTurnOff}
        disabled={!enabled || isBusy || !deviceId || !isStopState}
        style={({ pressed }) => [
          buttonBaseStyle,
          {
            backgroundColor: theme.colors.danger,
            borderColor: theme.colors.white,
          },
          (!enabled || isBusy || !buttonsEnabled || !isStopState) && { opacity: disabledOpacity },
          pressed && isStopState && { opacity: pressedOpacity, transform: [{ scale: pressedScale }] },
        ]}
      >
        <Power size={iconSize} color={theme.colors.white} />
      </Pressable>
    </View>
  );
};
