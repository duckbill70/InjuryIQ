import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Switch } from 'react-native';
import { Power, PowerOff } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { useControl, ControlState, type FIFOStatistics } from '../ble/useControl';
import { useBle } from '../ble/BleProvider';
import { useSession } from '../session/SessionProvider';

// Helper: minutes to ms
const minToMs = (min: number) => min * 60 * 1000;

const BUTTON_STYLES = {
  size: 60,
  iconSize: 32,
  borderRadius: 6,
  borderWidth: 2,
  disabledOpacity: 0.4,
  pressedOpacity: 0.7,
  pressedScale: 0.95,
};

const DEFAULT_INTERVALS = [1, 5, 10];

const TrainingSessionPanelComponent: React.FC = () => {
  const { theme } = useTheme();
  const { connected } = useBle();
  const { isActive: sessionActive } = useSession();
  const connectedDevices = Object.values(connected);
  // Support up to two devices (left/right)
  const leftDevice = connectedDevices[0] || null;
  const rightDevice = connectedDevices[1] || null;

  // Per-device state
  const [fifoPct, setFifoPct] = useState<Record<string, number | null>>({});
  const [deviceState, setDeviceState] = useState<Record<string, ControlState | null>>({});
  const [waitingForFifo, setWaitingForFifo] = useState<Record<string, boolean>>({});
  const [waitingForEmpty, setWaitingForEmpty] = useState<Record<string, boolean>>({});

  // Plan state
  const [intervals, setIntervals] = useState<number[]>(DEFAULT_INTERVALS);
  const [intervalEnabled, setIntervalEnabled] = useState<boolean[]>([true, true, true]);
  const [active, setActive] = useState(false); // Plan switch
  const [currentIntervalIdx, setCurrentIntervalIdx] = useState(0);
  const [timer, setTimer] = useState(0); // ms elapsed in current interval
  // Per-device state
  // (declarations moved below, only declare once)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  // const planActiveRef = useRef(false);

  // BLE control

  // Top-level useControl hooks for up to two devices
  // Always call both hooks in the same order for React rules
  const leftControl = useControl(
    leftDevice
      ? {
          deviceId: leftDevice.id,
          enabled: true,
          onStateUpdate: (state) => setDeviceState((prev) => ({ ...prev, [leftDevice.id]: state })),
          onStatisticsUpdate: (stats: FIFOStatistics) => {
            setFifoPct((prev) => ({
              ...prev,
              [leftDevice.id]: stats.bufferCapacity > 0 ? Math.round((stats.samplesStored / stats.bufferCapacity) * 100) : null,
            }));
          },
        }
      : {
          deviceId: '',
          enabled: false,
          onStateUpdate: () => {},
          onStatisticsUpdate: () => {},
        }
  );
  const rightControl = useControl(
    rightDevice
      ? {
          deviceId: rightDevice.id,
          enabled: true,
          onStateUpdate: (state) => setDeviceState((prev) => ({ ...prev, [rightDevice.id]: state })),
          onStatisticsUpdate: (stats: FIFOStatistics) => {
            setFifoPct((prev) => ({
              ...prev,
              [rightDevice.id]: stats.bufferCapacity > 0 ? Math.round((stats.samplesStored / stats.bufferCapacity) * 100) : null,
            }));
          },
        }
      : {
          deviceId: '',
          enabled: false,
          onStateUpdate: () => {},
          onStatisticsUpdate: () => {},
        }
  );
  // Controls array for logic (memoized to avoid changing identity every render)
  const controls = React.useMemo(() => {
    return [leftDevice ? leftControl : null, rightDevice ? rightControl : null].filter(Boolean);
  }, [leftDevice, rightDevice, leftControl, rightControl]);
  // Plan logic

  // Interval trigger logic
  // At each interval, for each device, check FIFO and act
  useEffect(() => {
    if (!active || connectedDevices.length === 0) return;
    if (currentIntervalIdx >= intervals.length) return;
    const intervalMs = minToMs(intervals[currentIntervalIdx]);
    if (timer < intervalMs) return;
    [leftDevice, rightDevice].forEach((device, i) => {
      if (!device) return;
      const pct = fifoPct[device.id];
      const ctl = controls[i];
      if (!ctl) return;
      if (pct === 100) {
        setWaitingForFifo((prev) => ({ ...prev, [device.id]: false }));
        setWaitingForEmpty((prev) => ({ ...prev, [device.id]: true }));
        ctl.stopAndSnapshot();
      } else {
        setWaitingForFifo((prev) => ({ ...prev, [device.id]: true }));
      }
    });
    // Intentionally keeping dependencies minimal to prevent render loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer, fifoPct, active, connectedDevices.length, currentIntervalIdx, intervals]);

  // Wait for FIFO to fill to 100% if not already
  // Wait for FIFO to fill to 100% if not already, per device
  useEffect(() => {
    if (!active || connectedDevices.length === 0) return;
    [leftDevice, rightDevice].forEach((device, i) => {
      if (!device) return;
      if (!waitingForFifo[device.id]) return;
      const pct = fifoPct[device.id];
      const ctl = controls[i];
      if (!ctl) return;
      if (pct === 100) {
        setWaitingForFifo((prev) => ({ ...prev, [device.id]: false }));
        setWaitingForEmpty((prev) => ({ ...prev, [device.id]: true }));
        ctl.stopAndSnapshot();
      }
    });
    // Intentionally keeping dependencies minimal to prevent render loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fifoPct, waitingForFifo, active, connectedDevices.length]);

  // After STOP, wait for FIFO to empty, then RUN, per device
  useEffect(() => {
    if (!active || connectedDevices.length === 0) return;
    
    let allDevicesRestarted = true;
    
    [leftDevice, rightDevice].forEach((device, i) => {
      if (!device) return;
      
      // Skip if not waiting for this device to empty
      if (!waitingForEmpty[device.id]) return;
      
      const pct = fifoPct[device.id];
      const ctl = controls[i];
      if (!ctl) return;
      
      if (pct === 0) {
        // FIFO is empty, restart recording and clear the waiting flag
        setWaitingForEmpty((prev) => {
          const next = { ...prev };
          delete next[device.id];
          return next;
        });
        ctl.startRecording();
      } else {
        // Still waiting for this device
        allDevicesRestarted = false;
      }
    });
    
    // Only advance interval if all devices that were waiting have restarted
    const anyStillWaiting = Object.values(waitingForEmpty).some(Boolean);
    if (!anyStillWaiting && allDevicesRestarted && Object.keys(waitingForEmpty).length > 0) {
      setCurrentIntervalIdx((idx) => idx + 1);
      setTimer(0);
      accumulatedTimeRef.current = 0;
    }
    // Intentionally keeping dependencies minimal to prevent render loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fifoPct, waitingForEmpty, active, connectedDevices.length]);

  // Reset plan if device list changes
  // Reset plan if device list changes
  useEffect(() => {
    setCurrentIntervalIdx(0);
    setTimer(0);
    setWaitingForFifo({});
    setWaitingForEmpty({});
    if (intervalRef.current) clearInterval(intervalRef.current);
    accumulatedTimeRef.current = 0;
  }, [connectedDevices.length]);

  // Timer increment when active (pause/resume support)
  useEffect(() => {
    // Only run timer if both plan is active AND session is active
    if (active && sessionActive) {
      // Start/Resume: capture current time and start interval
      startTimeRef.current = Date.now();
      
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const totalTime = accumulatedTimeRef.current + elapsed;
        // Round to nearest second to reduce re-renders
        const roundedTime = Math.floor(totalTime / 1000) * 1000;
        setTimer(roundedTime);
      }, 1000); // Update once per second
    } else {
      // Pause: stop the interval and accumulate the time
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        
        // Only accumulate if we were running (startTimeRef was set)
        if (startTimeRef.current > 0) {
          const elapsed = Date.now() - startTimeRef.current;
          accumulatedTimeRef.current += elapsed;
          startTimeRef.current = 0;
        }
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, sessionActive]);

  // Update paused time ref whenever timer changes and plan is paused
  // (No longer needed with new approach)
  
  // Reset plan timer when session stops (but keep active state)
  useEffect(() => {
    if (!sessionActive) {
      // Clear interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Reset timer and progress, but NOT active state
      setTimer(0);
      setCurrentIntervalIdx(0);
      setWaitingForFifo({});
      setWaitingForEmpty({});
      accumulatedTimeRef.current = 0;
      startTimeRef.current = 0;
    }
  }, [sessionActive]);

  return (
    <View style={[theme.viewStyles.panelContainer, { backgroundColor: theme.colors.black, borderWidth: 2, borderColor: theme.colors.white, marginBottom: 24, padding: 20 }]}> 
      <Text style={[theme.textStyles.panelTitle, {color: theme.colors.white}]}>ML Training Plan</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <Pressable
          onPress={() => setActive(!active)}
          disabled={connectedDevices.length === 0}
          style={({ pressed }) => [
            {
              width: BUTTON_STYLES.size,
              height: BUTTON_STYLES.size,
              borderRadius: BUTTON_STYLES.borderRadius,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: BUTTON_STYLES.borderWidth,
              borderColor: active ? theme.colors.good : theme.colors.danger,
              backgroundColor: active ? theme.colors.good : theme.colors.danger,
              opacity: connectedDevices.length === 0 ? BUTTON_STYLES.disabledOpacity : 1,
            },
            pressed && connectedDevices.length > 0 && { opacity: BUTTON_STYLES.pressedOpacity, transform: [{ scale: BUTTON_STYLES.pressedScale }] },
          ]}
        >
          {active ? (
            <Power size={BUTTON_STYLES.iconSize} color={theme.colors.white} />
          ) : (
            <PowerOff size={BUTTON_STYLES.iconSize} color={theme.colors.white} />
          )}
        </Pressable>
      </View>
      <Text style={[theme.textStyles.body, { fontWeight: '600', marginBottom: 8, color: theme.colors.white }]}>Intervals (minutes):</Text>
      <View style={{ flexDirection: 'column', marginBottom: 12 }}>
          {[0, 1, 2].map((idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={[theme.textStyles.body2, { width: 80, color: theme.colors.white }]}>Interval {idx + 1}:</Text>
              <TextInput
                style={{
                  width: 48,
                  height: 36,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: theme.colors.primary,
                  color: theme.colors.white,
                  backgroundColor: theme.colors.black,
                  textAlign: 'center',
                  fontSize: 18,
                  marginRight: 4,
                }}
                keyboardType="numeric"
                value={intervals[idx] ? intervals[idx].toString() : ''}
                onChangeText={(text) => {
                  const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
                  setIntervals((arr) => {
                    const next = [...arr];
                    next[idx] = !isNaN(n) && n > 0 ? n : 0;
                    return next;
                  });
                }}
                placeholder="min"
                placeholderTextColor={theme.colors.muted}
                maxLength={3}
              />
            <Switch
              value={intervalEnabled[idx]}
                onValueChange={(val: boolean) => setIntervalEnabled((arr) => {
                const next = [...arr];
                next[idx] = val;
                return next;
              })}
              style={{ marginLeft: 8 }}
            />
            </View>
          ))}
      </View>
      <View style={{ marginBottom: 12 }}>
        <Text style={[theme.textStyles.body2, {color: theme.colors.white}]}>Current Interval: {currentIntervalIdx + 1} / {intervals.length}</Text>
        <Text style={[theme.textStyles.body2, {color: theme.colors.white}]}>Timer: {(timer / 1000).toFixed(0)}s</Text>
        {connectedDevices.map((d) => (
          <View key={d.id} style={{ marginBottom: 2 }}>
            <Text style={[theme.textStyles.body2, {color: theme.colors.white}]}>
              {d.name || d.id.slice(-6)} — FIFO: {fifoPct[d.id] !== undefined && fifoPct[d.id] !== null ? `${fifoPct[d.id]}%` : '—'} | State: {deviceState[d.id] !== undefined && deviceState[d.id] !== null ? ControlState[deviceState[d.id]!] : '—'}
            </Text>
            {waitingForFifo[d.id] && <Text style={[theme.textStyles.body2, { color: theme.colors.warn }]}>Waiting for FIFO to fill...</Text>}
            {waitingForEmpty[d.id] && <Text style={[theme.textStyles.body2, { color: theme.colors.warn }]}>Waiting for FIFO to empty...</Text>}
          </View>
        ))}
      </View>
      <Text style={[theme.textStyles.body2, { color: theme.colors.muted }]}>The plan will automatically STOP all devices at each interval when their FIFO is full, then RUN again when FIFO is empty. The session is not stopped.</Text>
    </View>
  );
};

export const TrainingSessionPanel = React.memo(TrainingSessionPanelComponent);
export default TrainingSessionPanel;

