import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useBle } from '../ble/BleProvider';
import { useControl, ControlState, SensorLocation, type FIFOStatistics, type SnapshotStatus } from '../ble/useControl';
import { useBattery } from '../ble/useBattery';
import { useTheme } from '../theme/ThemeContext';

// Simple label mapping for ControlState
const controlStateLabel = (state: ControlState | null): string => {
  switch (state) {
    case ControlState.RUNNING:
      return 'RUNNING';
    case ControlState.STOPPED:
      return 'STOPPED';
    case ControlState.UNKNOWN:
      return 'UNKNOWN';
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
  const [statistics, setStatistics] = useState<FIFOStatistics | null>(null);
  const [sensorLocation, setSensorLocation] = useState<SensorLocation | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<SnapshotStatus | null>(null);

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

  const { 
    readStatistics,
    readLocation,
    startRecording,
    stopRecording,
    resetFifo,
    dumpToSerial,
    setLocationRed,
    setLocationGreen,
    resetSteps,
    testImu,
    logFifoStats,
    deleteSnapshot,
    dumpSnapshot,
  } = useControl({
    deviceId,
    onStateUpdate: (state) => setCurrentState(state),
    onStatisticsUpdate: (stats) => setStatistics(stats),
    onLocationUpdate: (location) => setSensorLocation(location),
    onSnapshotStatusUpdate: (status) => setSnapshotStatus(status),
  });

  const { readBatteryLevel } = useBattery({
    deviceId,
    enabled: !!deviceId,
    onBatteryUpdate: (level) => setBatteryLevel(level),
  });

  // Read initial statistics when device changes
  useEffect(() => {
    if (!deviceId) {
      setCurrentState(null);
      setStatistics(null);
      setSensorLocation(null);
      setBatteryLevel(null);
      setSnapshotStatus(null);
      return;
    }

    const cancelled = false;

    const init = async () => {
      const stats = await readStatistics();
      if (!cancelled && stats) {
        setStatistics(stats);
        setCurrentState(stats.isRecording ? ControlState.RUNNING : ControlState.STOPPED);
      }
      
      const location = await readLocation();
      if (!cancelled && location !== null) {
        setSensorLocation(location);
      }

      const battery = await readBatteryLevel();
      if (!cancelled && battery !== null) {
        setBatteryLevel(battery);
      }
    };

    init();
  }, [deviceId, readStatistics, readLocation, readBatteryLevel]);

  const handleCommand = useCallback(async (commandFn: () => Promise<boolean>, commandName: string) => {
    if (!deviceId) return;
    const ok = await commandFn();
    if (!ok) {
      Alert.alert('Command Failed', `Failed to send ${commandName} command.`);
    }
  }, [deviceId]);

  const onStartRecording = useCallback(() => handleCommand(startRecording, 'START'), [handleCommand, startRecording]);
  const onStopRecording = useCallback(() => handleCommand(stopRecording, 'STOP'), [handleCommand, stopRecording]);
  const onResetFifo = useCallback(() => handleCommand(resetFifo, 'FIFO RESET'), [handleCommand, resetFifo]);
  const onDumpToSerial = useCallback(() => handleCommand(dumpToSerial, 'DUMP'), [handleCommand, dumpToSerial]);
  const onSetLocationRed = useCallback(() => handleCommand(setLocationRed, 'Location RED'), [handleCommand, setLocationRed]);
  const onSetLocationGreen = useCallback(() => handleCommand(setLocationGreen, 'Location GREEN'), [handleCommand, setLocationGreen]);
  const onResetSteps = useCallback(() => handleCommand(resetSteps, 'Reset Steps'), [handleCommand, resetSteps]);
  const onTestImu = useCallback(() => handleCommand(testImu, 'IMU Test'), [handleCommand, testImu]);
  const onLogFifoStats = useCallback(() => handleCommand(logFifoStats, 'FIFO Stats'), [handleCommand, logFifoStats]);
  const onDeleteAllSnapshots = useCallback(() => handleCommand(() => deleteSnapshot(0xFF), 'Delete All Snapshots'), [handleCommand, deleteSnapshot]);
  const onDumpAllSnapshots = useCallback(() => handleCommand(() => dumpSnapshot(0xFF), 'Dump All Snapshots'), [handleCommand, dumpSnapshot]);
  const onDeleteSnapshot = useCallback((id: number) => handleCommand(() => deleteSnapshot(id), `Delete Snapshot ${id}`), [handleCommand, deleteSnapshot]);
  const onDumpSnapshot = useCallback((id: number) => handleCommand(() => dumpSnapshot(id), `Dump Snapshot ${id}`), [handleCommand, dumpSnapshot]);

  // Shared styles extracted for stability
  const styles = useMemo(() => StyleSheet.create({
    pill: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderStyle: 'solid',
      borderWidth: 0.5,
    },
    actionBtn: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    slotRow: {
      borderRadius: 6,
      padding: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 1,
    },
    circleBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }), []);

  // Memoize snapshot slots list to avoid re-creating elements each render
  const snapshotSlots = useMemo(() => (snapshotStatus?.slots || [false, false, false]).map((occupied, idx) => ({ idx, occupied })), [snapshotStatus]);

  return (
    <View style={[theme.viewStyles.panelContainer, { backgroundColor: theme.colors.white }]}> 
      {/* Floating Location Indicator */}
      {sensorLocation !== null && sensorLocation !== SensorLocation.UNKNOWN && (
        <View style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1000,
        }}>
          <View style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: sensorLocation === SensorLocation.RED ? '#FF0000' : '#00FF00',
            borderWidth: 2,
            borderColor: theme.colors.white,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 3,
            elevation: 5,
          }} />
          <Text style={{
            fontSize: 10,
            color: theme.colors.muted,
            marginTop: 4,
            textAlign: 'center',
            fontWeight: '600',
          }}>
            {sensorLocation === SensorLocation.RED ? 'L' : 'R'}
          </Text>
        </View>
      )}
      
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
              style={[
                styles.pill,
                {
                  borderColor: deviceId === d.id ? theme.colors.primary : theme.colors.black,
                  backgroundColor: deviceId === d.id ? theme.colors.primary : theme.colors.dgrey,
                },
              ]}
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

      {/* Battery Level */}
      <View style={[theme.viewStyles.rowBetween, { marginBottom: 12 }]}>
        <Text style={theme.textStyles.body}>Battery:</Text>
        <Text style={[theme.textStyles.body, { fontWeight: '700' }]}>
          {batteryLevel !== null ? `${batteryLevel}%` : '—'}
        </Text>
      </View>

      {/* FIFO Statistics */}
      {statistics && (
        <View style={{ backgroundColor: theme.colors.dgrey, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <Text style={[theme.textStyles.body, { fontWeight: '600', marginBottom: 8 }]}>FIFO Statistics</Text>
          <View style={{ gap: 4 }}>
            <View style={theme.viewStyles.rowBetween}>
              <Text style={theme.textStyles.body2}>Samples:</Text>
              <Text style={theme.textStyles.body2}>{statistics.samplesStored} / {statistics.bufferCapacity}</Text>
            </View>
            <View style={theme.viewStyles.rowBetween}>
              <Text style={theme.textStyles.body2}>Fill:</Text>
              <Text style={theme.textStyles.body2}>
                {statistics.bufferCapacity > 0 
                  ? `${((statistics.samplesStored / statistics.bufferCapacity) * 100).toFixed(1)}%`
                  : '0%'}
              </Text>
            </View>
            <View style={theme.viewStyles.rowBetween}>
              <Text style={theme.textStyles.body2}>Duration:</Text>
              <Text style={theme.textStyles.body2}>{statistics.durationSec}s</Text>
            </View>
            <View style={theme.viewStyles.rowBetween}>
              <Text style={theme.textStyles.body2}>Rate:</Text>
              <Text style={theme.textStyles.body2}>{statistics.actualRateHz} Hz</Text>
            </View>
            <View style={theme.viewStyles.rowBetween}>
              <Text style={theme.textStyles.body2}>Dropped:</Text>
              <Text style={[theme.textStyles.body2, statistics.samplesDropped > 0 && { color: theme.colors.danger }]}>
                {statistics.samplesDropped}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Snapshot Status (slots 0-2 via bitflags) */}
      {snapshotStatus && (
        <View style={{ backgroundColor: theme.colors.dgrey, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <Text style={[theme.textStyles.body, { fontWeight: '600', marginBottom: 8 }]}>Snapshot Status ({snapshotSlots.filter(s => s.occupied).length} snapshot{snapshotSlots.filter(s => s.occupied).length !== 1 ? 's' : ''})</Text>
          <View style={{ gap: 6 }}>
            {snapshotSlots.map(({ occupied, idx }) => (
              <View key={idx} style={[
                styles.slotRow,
                {
                  backgroundColor: occupied ? theme.colors.white : theme.colors.dgrey,
                  opacity: occupied ? 1 : 0.5,
                  borderColor: theme.colors.muted,
                },
              ]}>
                <View>
                  <Text style={[theme.textStyles.body2, { fontWeight: '600' }]}>Snapshot #{idx}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => onDumpSnapshot(idx)}
                    disabled={!deviceId || currentState !== ControlState.STOPPED || !occupied}
                    style={[
                      styles.circleBtn,
                      {
                        backgroundColor: theme.colors.primary,
                        opacity: (!deviceId || currentState !== ControlState.STOPPED || !occupied) ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 16, color: theme.colors.white }}>📥</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onDeleteSnapshot(idx)}
                    disabled={!deviceId || currentState !== ControlState.STOPPED || !occupied}
                    style={[
                      styles.circleBtn,
                      {
                        backgroundColor: theme.colors.danger,
                        opacity: (!deviceId || currentState !== ControlState.STOPPED || !occupied) ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 16, color: theme.colors.white }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Snapshot Commands (STOP mode only) */}
      {snapshotStatus && snapshotSlots.filter(s => s.occupied).length > 0 && (
        <>
          <Text style={[theme.textStyles.body, { fontWeight: '600', marginBottom: 8 }]}>Snapshot Commands (STOP mode only)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={onDeleteAllSnapshots}
              disabled={!deviceId || currentState !== ControlState.STOPPED}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: theme.colors.danger,
                  opacity: (!deviceId || currentState !== ControlState.STOPPED) ? 0.5 : 1,
                },
              ]}
            >
              <Text style={theme.textStyles.buttonLabel}>DELETE ALL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onDumpAllSnapshots}
              disabled={!deviceId || currentState !== ControlState.STOPPED}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: (!deviceId || currentState !== ControlState.STOPPED) ? 0.5 : 1,
                },
              ]}
            >
              <Text style={theme.textStyles.buttonLabel}>DUMP ALL TO SERIAL</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Recording Control */}
      <Text style={[theme.textStyles.body, { fontWeight: '600', marginBottom: 8 }]}>Recording Control</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={onStartRecording}
          disabled={!deviceId || currentState === ControlState.RUNNING}
          style={[
            styles.actionBtn,
            {
              backgroundColor: theme.colors.good,
              opacity: (!deviceId || currentState === ControlState.RUNNING) ? 0.5 : 1,
            },
          ]}
        >
          <Text style={theme.textStyles.buttonLabel}>RUN</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onStopRecording}
          disabled={!deviceId || currentState === ControlState.STOPPED}
          style={[
            styles.actionBtn,
            {
              backgroundColor: theme.colors.danger,
              opacity: (!deviceId || currentState === ControlState.STOPPED) ? 0.5 : 1,
            },
          ]}
        >
          <Text style={theme.textStyles.buttonLabel}>STOP</Text>
        </TouchableOpacity>
      </View>

      {/* FIFO & Data Commands (STOP mode only) */}
      <Text style={[theme.textStyles.body, { fontWeight: '600', marginBottom: 8 }]}>FIFO & Data (STOP mode only)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={onResetFifo}
          disabled={!deviceId || currentState !== ControlState.STOPPED}
          style={[
            styles.actionBtn,
            {
              backgroundColor: theme.colors.warn,
              opacity: (!deviceId || currentState !== ControlState.STOPPED) ? 0.5 : 1,
            },
          ]}
        >
          <Text style={theme.textStyles.buttonLabel}>RESET FIFO</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onDumpToSerial}
          disabled={!deviceId || currentState !== ControlState.STOPPED}
          style={[
            styles.actionBtn,
            {
              backgroundColor: theme.colors.primary,
              opacity: (!deviceId || currentState !== ControlState.STOPPED) ? 0.5 : 1,
            },
          ]}
        >
          <Text style={theme.textStyles.buttonLabel}>DUMP TO SERIAL</Text>
        </TouchableOpacity>
      </View>

      {/* Location Commands (STOP mode only) */}
      <Text style={[theme.textStyles.body, { fontWeight: '600', marginBottom: 8 }]}>Location (STOP mode only)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={onSetLocationRed}
          disabled={!deviceId || currentState !== ControlState.STOPPED}
          style={[
            styles.actionBtn,
            {
              backgroundColor: '#FF0000',
              opacity: (!deviceId || currentState !== ControlState.STOPPED) ? 0.5 : 1,
            },
          ]}
        >
          <Text style={theme.textStyles.buttonLabel}>RED</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSetLocationGreen}
          disabled={!deviceId || currentState !== ControlState.STOPPED}
          style={[
            styles.actionBtn,
            {
              backgroundColor: '#00FF00',
              opacity: (!deviceId || currentState !== ControlState.STOPPED) ? 0.5 : 1,
            },
          ]}
        >
          <Text style={theme.textStyles.buttonLabel}>GREEN</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onResetSteps}
          disabled={!deviceId || currentState !== ControlState.STOPPED}
          style={[
            styles.actionBtn,
            {
              backgroundColor: theme.colors.muted,
              opacity: (!deviceId || currentState !== ControlState.STOPPED) ? 0.5 : 1,
            },
          ]}
        >
          <Text style={theme.textStyles.buttonLabel}>RESET STEPS</Text>
        </TouchableOpacity>
      </View>

      {/* Diagnostic Commands */}
      <Text style={[theme.textStyles.body, { fontWeight: '600', marginBottom: 8 }]}>Diagnostics</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={onTestImu}
          disabled={!deviceId}
          style={[
            styles.actionBtn,
            {
              backgroundColor: theme.colors.primary,
              opacity: !deviceId ? 0.5 : 1,
            },
          ]}
        >
          <Text style={theme.textStyles.buttonLabel}>IMU TEST</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onLogFifoStats}
          disabled={!deviceId}
          style={[
            styles.actionBtn,
            {
              backgroundColor: theme.colors.primary,
              opacity: !deviceId ? 0.5 : 1,
            },
          ]}
        >
          <Text style={theme.textStyles.buttonLabel}>FIFO STATS</Text>
        </TouchableOpacity>
      </View>

      {/* Notes */}
      <Text style={[theme.textStyles.body2, { color: theme.colors.muted, marginTop: 12 }]}> 
        Commands like RESET, DUMP, Location, and Reset Steps can only be sent when device is STOPPED.
        Statistics update every 1 second while recording.
      </Text>
    </View>
  );
};

export default ControlServicePanel;
