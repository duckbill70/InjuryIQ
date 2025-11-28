import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Switch, StyleSheet } from 'react-native';
import { Power, ArrowDown } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { useControl, ControlState, type FIFOStatistics } from '../ble/useControl';
import { useBle } from '../ble/BleProvider';
import { useSession } from '../session/SessionProvider';

// Helper: minutes to ms
const minToMs = (min: number) => min * 60 * 1000;
  // Helper: format ms to mm:ss
  const formatMsToMmSs = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${mm}:${ss}`;
  };

const BUTTON_STYLES = {
  size: 60,
  iconSize: 28,
  borderRadius: 6,
  borderWidth: 2,
  disabledOpacity: 0.4,
  pressedOpacity: 0.7,
  pressedScale: 0.95,
};

const styles = StyleSheet.create({
  squareButton: {
    height: BUTTON_STYLES.size,
    width: BUTTON_STYLES.size,
    borderRadius: BUTTON_STYLES.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BUTTON_STYLES.borderWidth,
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});

const DEFAULT_INTERVALS = [1, 5, 10];

const TrainingSessionPanelComponent: React.FC = () => {
  const { theme } = useTheme();
  const { connected, devicesByPosition } = useBle();
  const { isActive: sessionActive } = useSession();
  const connectedDevices = Object.values(connected);
  // Use explicit device positions from BLE context
  const leftDevice = devicesByPosition.leftFoot || null;
  const rightDevice = devicesByPosition.rightFoot || null;

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
  // Explicit phase gating the plan lifecycle
  const [phase, setPhase] = useState<'idle' | 'interval' | 'waiting-fifo' | 'waiting-empty'>('idle');
  // Per-device state
  // (declarations moved below, only declare once)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  // const planActiveRef = useRef(false);

  // BLE control

  // Memoized callbacks for left device to prevent useControl recreation
  const onLeftStateUpdate = useCallback((state: ControlState) => {
    if (leftDevice) {
      setDeviceState((prev) => ({ ...prev, [leftDevice.id]: state }));
    }
  }, [leftDevice]);

  const onLeftStatisticsUpdate = useCallback((stats: FIFOStatistics) => {
    if (leftDevice) {
      setFifoPct((prev) => ({
        ...prev,
        [leftDevice.id]: stats.bufferCapacity > 0 ? Math.round((stats.samplesStored / stats.bufferCapacity) * 100) : null,
      }));
    }
  }, [leftDevice]);

  // Memoized callbacks for right device to prevent useControl recreation
  const onRightStateUpdate = useCallback((state: ControlState) => {
    if (rightDevice) {
      setDeviceState((prev) => ({ ...prev, [rightDevice.id]: state }));
    }
  }, [rightDevice]);

  const onRightStatisticsUpdate = useCallback((stats: FIFOStatistics) => {
    if (rightDevice) {
      setFifoPct((prev) => ({
        ...prev,
        [rightDevice.id]: stats.bufferCapacity > 0 ? Math.round((stats.samplesStored / stats.bufferCapacity) * 100) : null,
      }));
    }
  }, [rightDevice]);

  // Memoized config objects for useControl hooks
  const leftControlConfig = useMemo(() => {
    return leftDevice
      ? {
          deviceId: leftDevice.id,
          enabled: true,
          onStateUpdate: onLeftStateUpdate,
          onStatisticsUpdate: onLeftStatisticsUpdate,
        }
      : {
          deviceId: '',
          enabled: false,
          onStateUpdate: () => {},
          onStatisticsUpdate: () => {},
        };
  }, [leftDevice, onLeftStateUpdate, onLeftStatisticsUpdate]);

  const rightControlConfig = useMemo(() => {
    return rightDevice
      ? {
          deviceId: rightDevice.id,
          enabled: true,
          onStateUpdate: onRightStateUpdate,
          onStatisticsUpdate: onRightStatisticsUpdate,
        }
      : {
          deviceId: '',
          enabled: false,
          onStateUpdate: () => {},
          onStatisticsUpdate: () => {},
        };
  }, [rightDevice, onRightStateUpdate, onRightStatisticsUpdate]);

  // Top-level useControl hooks for up to two devices
  // Always call both hooks in the same order for React rules
  const leftControl = useControl(leftControlConfig);
  const rightControl = useControl(rightControlConfig);

  // Stable ref for controls to avoid depending on hook instances in effects
  const controlsRef = useRef<Array<{
    deleteSnapshot?: (slot: number) => Promise<void>;
    dumpSnapshot?: (slot: number) => Promise<void>;
    stopAndSnapshot?: () => Promise<boolean> | void;
    startRecording?: () => Promise<boolean> | void;
    readStatistics?: () => Promise<FIFOStatistics | null>;
  } | null>>([null, null]);

  // Update the ref each render without triggering effect deps
  controlsRef.current[0] = leftDevice ? (leftControl as unknown as typeof controlsRef.current[number]) : null;
  controlsRef.current[1] = rightDevice ? (rightControl as unknown as typeof controlsRef.current[number]) : null;

  // Read initial statistics to derive STOP/RUN state on first load
  useEffect(() => {
    const readInitialLeft = async () => {
      if (!leftDevice) return;
      try {
        const stats = await leftControl.readStatistics();
        if (stats) {
          setDeviceState((prev) => ({
            ...prev,
            [leftDevice.id]: stats.isRecording ? ControlState.RUNNING : ControlState.STOPPED,
          }));
        }
      } catch {}
    };
    const readInitialRight = async () => {
      if (!rightDevice) return;
      try {
        const stats = await rightControl.readStatistics();
        if (stats) {
          setDeviceState((prev) => ({
            ...prev,
            [rightDevice.id]: stats.isRecording ? ControlState.RUNNING : ControlState.STOPPED,
          }));
        }
      } catch {}
    };
    readInitialLeft();
    readInitialRight();
  }, [leftDevice, rightDevice, leftControl, rightControl]);
  // One-off snapshot delete at session start when training is enabled
  const prevSessionActiveRef = useRef<boolean>(sessionActive);
  useEffect(() => {
    const wasActive = prevSessionActiveRef.current;
    // Session just transitioned from stopped -> started
    if (!wasActive && sessionActive) {
      if (active) {
        const controlsList = controlsRef.current;
        for (const ctl of controlsList) {
          if (ctl && typeof ctl.deleteSnapshot === 'function') {
            ctl.deleteSnapshot(0xFF).catch(() => {});
          }
        }
      }
    }
    prevSessionActiveRef.current = sessionActive;
  }, [sessionActive, active]);
  // Plan logic

  // Phase ensure we enter 'interval' when needed
  useEffect(() => {
    if (!active || !sessionActive || connectedDevices.length === 0) return;
    if (currentIntervalIdx >= intervals.length) return;
    if (phase === 'idle') setPhase('interval');
  }, [active, sessionActive, phase, currentIntervalIdx, intervals.length, connectedDevices.length]);

  // Interval timing gate
  useEffect(() => {
    if (phase !== 'interval') return;
    if (!active || !sessionActive || connectedDevices.length === 0) return;
    if (currentIntervalIdx >= intervals.length) return;

    const enabled = intervalEnabled[currentIntervalIdx];
    const minutes = intervals[currentIntervalIdx];
    if (!enabled || minutes <= 0) {
      // Skip disabled interval
      setCurrentIntervalIdx((idx) => idx + 1);
      setTimer(0);
      accumulatedTimeRef.current = 0;
      setPhase('idle');
      return;
    }
    const intervalMs = minToMs(minutes);
    if (timer < intervalMs) return; // Not elapsed yet

    // Interval elapsed: set wait-for-fifo flags for all connected devices
    [leftDevice, rightDevice].forEach((device) => {
      if (!device) return;
      setWaitingForFifo((prev) => ({ ...prev, [device.id]: true }));
    });
    setPhase('waiting-fifo');
  }, [phase, timer, active, sessionActive, currentIntervalIdx, intervals, intervalEnabled, connectedDevices.length, leftDevice, rightDevice]);

  // Waiting for FIFO fill phase
  useEffect(() => {
    if (phase !== 'waiting-fifo') return;
    if (!active || connectedDevices.length === 0) return;
    let allFilled = true;
    [leftDevice, rightDevice].forEach((device, i) => {
      if (!device) return;
      if (!waitingForFifo[device.id]) { allFilled = false; return; }
      const pct = fifoPct[device.id];
      const ctl = controlsRef.current[i];
      if (!ctl) { allFilled = false; return; }
      if (pct !== 100) allFilled = false;
    });
    if (!allFilled) return;
    // Snapshot each ready device exactly once
    [leftDevice, rightDevice].forEach((device, i) => {
      if (!device) return;
      if (!waitingForFifo[device.id]) return;
      const ctl = controlsRef.current[i];
      if (!ctl) return;
      setWaitingForFifo((prev) => ({ ...prev, [device.id]: false }));
      setWaitingForEmpty((prev) => ({ ...prev, [device.id]: true }));
      if (typeof ctl.stopAndSnapshot === 'function') {
        ctl.stopAndSnapshot();
      }
    });
    setPhase('waiting-empty');
  }, [phase, fifoPct, waitingForFifo, active, connectedDevices.length, leftDevice, rightDevice]);

  // After STOP, wait for FIFO to empty, then RUN, per device (waiting-empty phase)
  useEffect(() => {
    if (phase !== 'waiting-empty') return;
    if (!active || connectedDevices.length === 0) return;
    let allEmptied = true;
    [leftDevice, rightDevice].forEach((device, i) => {
      if (!device) return;
      if (!waitingForEmpty[device.id]) return; // Not required to empty
      const pct = fifoPct[device.id];
      const ctl = controlsRef.current[i];
      if (!ctl) { allEmptied = false; return; }
      if (pct === 0) {
        setWaitingForEmpty((prev) => {
          const next = { ...prev };
          delete next[device.id];
          return next;
        });
        if (typeof ctl.startRecording === 'function') {
          ctl.startRecording();
        }
      } else {
        allEmptied = false;
      }
    });
    if (!allEmptied) return;
    // Advance to next interval
    setCurrentIntervalIdx((idx) => idx + 1);
    setTimer(0);
    accumulatedTimeRef.current = 0;
    setPhase('idle');
  }, [phase, fifoPct, waitingForEmpty, active, connectedDevices.length, leftDevice, rightDevice]);

  // Reset plan if device list changes
  // Reset plan if device list changes
  useEffect(() => {
    setCurrentIntervalIdx(0);
    setTimer(0);
    setWaitingForFifo({});
    setWaitingForEmpty({});
    if (intervalRef.current) clearInterval(intervalRef.current);
    accumulatedTimeRef.current = 0;
    setPhase(active && sessionActive && connectedDevices.length > 0 ? 'interval' : 'idle');
  }, [connectedDevices.length, active, sessionActive]);

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
      setPhase('idle');
    }
  }, [sessionActive]);

  // Child to isolate timer re-renders
  const TimerText = useMemo(() => React.memo(({ value }: { value: number }) => {
    const { theme } = useTheme();
    return <Text style={[theme.textStyles.body2, {color: theme.colors.white}]}>Timer: {formatMsToMmSs(value)}</Text>;
  }), []);

  return (
    <View style={[theme.viewStyles.panelContainer, { backgroundColor: theme.colors.black, borderWidth: 1, borderColor: theme.colors.white, marginBottom: 24, padding: 20 }]}> 
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

            <Power size={BUTTON_STYLES.iconSize} color={theme.colors.white} />

        </Pressable>
        {/* Dump All Snapshots buttons per device (available only when session is NOT running) */}
        {/* Always render per-device buttons; show disabled style when device missing or session active */}
        <Pressable
          onPress={() => {
            const ctl = leftControl as unknown as { dumpSnapshot?: (slot: number) => Promise<void> };
            if (ctl && typeof ctl.dumpSnapshot === 'function') {
              ctl.dumpSnapshot(0xFF).catch(() => {});
            }
          }}
          disabled={
            sessionActive || !leftDevice || deviceState[leftDevice.id] !== ControlState.STOPPED
          }
          style={({ pressed }) => [
            {
              marginLeft: 12,
              paddingHorizontal: 12,
              borderColor: theme.colors.primary,
              backgroundColor: theme.colors.primary,
              opacity: (sessionActive || !leftDevice || deviceState[leftDevice.id] !== ControlState.STOPPED) ? BUTTON_STYLES.disabledOpacity : 1,
            },
            styles.squareButton,
            pressed && !sessionActive && leftDevice && { opacity: BUTTON_STYLES.pressedOpacity, transform: [{ scale: BUTTON_STYLES.pressedScale }] },
          ]}
        >
          <ArrowDown size={BUTTON_STYLES.iconSize} color={theme.colors.white} />
          <View style={[styles.dot, { backgroundColor: leftDevice?.color || theme.colors.teal, opacity: leftDevice ? 1 : BUTTON_STYLES.disabledOpacity }]} />
        </Pressable>
        <Pressable
          onPress={() => {
            const ctl = rightControl as unknown as { dumpSnapshot?: (slot: number) => Promise<void> };
            if (ctl && typeof ctl.dumpSnapshot === 'function') {
              ctl.dumpSnapshot(0xFF).catch(() => {});
            }
          }}
          disabled={
            sessionActive || !rightDevice || deviceState[rightDevice.id] !== ControlState.STOPPED
          }
          style={({ pressed }) => [
            {
              marginLeft: 12,
              paddingHorizontal: 12,
              borderColor: theme.colors.primary,
              backgroundColor: theme.colors.primary,
              opacity: (sessionActive || !rightDevice || deviceState[rightDevice.id] !== ControlState.STOPPED) ? BUTTON_STYLES.disabledOpacity : 1,
            },
            styles.squareButton,
            pressed && !sessionActive && rightDevice && { opacity: BUTTON_STYLES.pressedOpacity, transform: [{ scale: BUTTON_STYLES.pressedScale }] },
          ]}
        >
          <ArrowDown size={BUTTON_STYLES.iconSize} color={theme.colors.white} />
          <View style={[styles.dot, { backgroundColor: rightDevice?.color || theme.colors.mid, opacity: rightDevice ? 1 : BUTTON_STYLES.disabledOpacity }]} />
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
        <Text style={[theme.textStyles.body2, {color: theme.colors.white}]}>Phase: {phase}</Text>
        <TimerText value={timer} />
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

