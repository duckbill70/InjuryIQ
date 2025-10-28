import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useBle } from '../ble/BleProvider';
import { useControl, ControlState } from '../ble/useControl';
import { useTheme } from '../theme/ThemeContext';

// Simple label mapping for ControlState
const controlStateLabel = (state: ControlState | null): string => {
  switch (state) {
    case ControlState.STANDBY:
      return 'STANDBY';
    case ControlState.RUN:
      return 'RUN';
    case ControlState.STOP:
      return 'STOP';
    case ControlState.OFF:
      return 'OFF';
    case ControlState.FIFO_RESET:
      return 'FIFO_RESET';
    default:
      return '—';
  }
};

export const ControlServicePanel: React.FC = () => {
  const { theme } = useTheme();
  const { connected } = useBle();

  const connectedDevices = Object.values(connected);
  const defaultSelected = connectedDevices.length ? connectedDevices[0].id : '';
  const [deviceId, setDeviceId] = useState<string>(defaultSelected);
  const [currentState, setCurrentState] = useState<ControlState | null>(null);

  // Recompute if connected set changes
  useEffect(() => {
    if (!deviceId) {
      const first = Object.values(connected)[0]?.id;
      if (first) setDeviceId(first);
    } else if (!connected[deviceId]) {
      // Previously selected device disconnected, switch to another if available
      const other = Object.values(connected)[0]?.id;
      setDeviceId(other || '');
    }
  }, [connected, deviceId]);

  // Selected device label (if needed in the future)
  // const selectedName = useMemo(() => {
  //   const entry = connected[deviceId];
  //   return entry?.name || (deviceId ? deviceId.slice(-6) : 'No device');
  // }, [connected, deviceId]);

  const { subscribe, unsubscribe, readState, setState, resetFifo } = useControl({
    deviceId,
    enabled: !!deviceId,
    onStateUpdate: (state) => setCurrentState(state),
  });

  // Initial read of state when device selection changes
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!deviceId) {
        setCurrentState(null);
        return;
      }
      const s = await readState();
      if (!cancelled) setCurrentState(s);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [deviceId, readState]);

  // Auto-subscribe lifecycle is handled by the hook; nothing to manage here beyond deviceId
  useEffect(() => {
    if (!deviceId) return;
    subscribe();
    return () => {
      unsubscribe();
    };
  }, [deviceId, subscribe, unsubscribe]);

  const applyState = useCallback(async (state: ControlState) => {
    if (!deviceId) return;
    const ok = await setState(state);
    if (!ok) {
      Alert.alert('Control', 'Failed to write control state (may be rejected by firmware).');
    }
  }, [deviceId, setState]);

  const onResetFifo = useCallback(async () => {
    if (!deviceId) return;
    const ok = await resetFifo();
    if (!ok) {
      Alert.alert('FIFO Reset', 'Reset request failed (allowed only in STANDBY).');
    }
  }, [deviceId, resetFifo]);

  return (
    <View style={[theme.viewStyles.panelContainer, { backgroundColor: theme.colors.white }]}> 
      {/* Header */}
      <View style={theme.viewStyles.panelTitle}>
        <Text style={theme.textStyles.panelTitle}>Control Service (Test Panel)</Text>
      </View>

      {/* Device selector (simple pills for now) */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}> 
        {connectedDevices.length === 0 ? (
          <Text style={theme.textStyles.body}>No devices connected</Text>
        ) : (
          connectedDevices.map((d) => (
            <TouchableOpacity
              key={d.id}
              onPress={() => setDeviceId(d.id)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 6,
                borderStyle: 'solid',
                borderWidth: 0.5,
                borderColor: deviceId === d.id ? theme.colors.primary : theme.colors.black,
                backgroundColor: deviceId === d.id ? theme.colors.primary : theme.colors.dgrey,
              }}
            >
              <Text style={{ color: deviceId === d.id ? theme.colors.white : theme.colors.black, fontWeight: '600' }}>
                {d.name || d.id.slice(-6)}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Current state */}
      <View style={[theme.viewStyles.rowBetween, { marginBottom: 12 }]}> 
        <Text style={theme.textStyles.body}>Current State:</Text>
        <Text style={[theme.textStyles.body, { fontWeight: '700' }]}>{controlStateLabel(currentState)}</Text>
      </View>

      {/* State buttons */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[ControlState.STANDBY, ControlState.RUN, ControlState.STOP, ControlState.OFF].map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => applyState(s)}
            disabled={!deviceId}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: theme.colors.primary,
              opacity: deviceId ? 1 : 0.5,
            }}
          >
            <Text style={theme.textStyles.buttonLabel}>{controlStateLabel(s)}</Text>
          </TouchableOpacity>
        ))}

        {/* FIFO Reset */}
        <TouchableOpacity
          onPress={onResetFifo}
          disabled={!deviceId}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 6,
            backgroundColor: theme.colors.warn,
            opacity: deviceId ? 1 : 0.5,
          }}
        >
          <Text style={theme.textStyles.buttonLabel}>FIFO RESET</Text>
        </TouchableOpacity>
      </View>

      {/* Notes */}
      <Text style={[theme.textStyles.body2, { color: theme.colors.muted, marginTop: 12 }]}>
        Firmware enforces valid transitions. STANDBY is required before OFF and FIFO Reset.
      </Text>
    </View>
  );
};

export default ControlServicePanel;
