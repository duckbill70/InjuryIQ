import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useBle } from '../ble/BleProvider';
import { useDiagnostics, ErrorCode, SystemStatus } from '../ble/useDiagnostics';
import { useStatistics, FIFOStatistics, FIFOConfiguration, FIFOTuning } from '../ble/useStatistics';
import { useTheme } from '../theme/ThemeContext';
import { Activity, AlertCircle, Database, Settings } from 'lucide-react-native';

// Helper to format bytes to KB/MB
const formatBytes = (kb: number): string => {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

// Helper to format uptime
const formatUptime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}h ${mins}m ${secs}s`;
};

export const DiagnosticsPanel: React.FC = () => {
  const { theme } = useTheme();
  const { connected } = useBle();

  const connectedDevices = Object.values(connected);
  const defaultSelected = connectedDevices.length ? connectedDevices[0].id : '';
  const [deviceId, setDeviceId] = useState<string>(defaultSelected);

  // Diagnostics state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [errorDesc, setErrorDesc] = useState<string>('');

  // Statistics state
  const [fifoStats, setFifoStats] = useState<FIFOStatistics | null>(null);
  const [fifoConfig, setFifoConfig] = useState<FIFOConfiguration | null>(null);
  const [fifoTuning, setFifoTuning] = useState<FIFOTuning | null>(null);

  // Recompute if connected set changes
  useEffect(() => {
    if (!deviceId) {
      const first = Object.values(connected)[0]?.id;
      if (first) setDeviceId(first);
    } else if (!connected[deviceId]) {
      const other = Object.values(connected)[0]?.id;
      setDeviceId(other || '');
    }
  }, [connected, deviceId]);

  // Hook into diagnostics service
  const {
    subscribe: subscribeDiag,
    unsubscribe: unsubscribeDiag,
    readSystemStatus,
  } = useDiagnostics({
    deviceId,
    enabled: !!deviceId,
    onSystemStatusUpdate: (status) => setSystemStatus(status),
    onErrorUpdate: (code, desc) => {
      setErrorCode(code);
      setErrorDesc(desc);
    },
  });

  // Hook into statistics service
  const {
    subscribe: subscribeStats,
    unsubscribe: unsubscribeStats,
    readStatistics,
    readConfiguration,
    readTuning,
    requestFifoDump,
    calculateFillPercentage,
    calculateOverflowRate,
    calculateEstimatedRemainingMinutes,
  } = useStatistics({
    deviceId,
    enabled: !!deviceId,
    onStatisticsUpdate: (stats) => setFifoStats(stats),
  });

  // Initial read when device changes
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!deviceId) {
        setSystemStatus(null);
        setErrorCode(null);
        setErrorDesc('');
        setFifoStats(null);
        setFifoConfig(null);
        setFifoTuning(null);
        return;
      }

      // Read diagnostics
      const sysStatus = await readSystemStatus();
      if (!cancelled && sysStatus) setSystemStatus(sysStatus);

      // Read statistics
      const stats = await readStatistics();
      if (!cancelled && stats) setFifoStats(stats);

      const config = await readConfiguration();
      if (!cancelled && config) setFifoConfig(config);

      const tuning = await readTuning();
      if (!cancelled && tuning) setFifoTuning(tuning);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [deviceId, readSystemStatus, readStatistics, readConfiguration, readTuning]);

  // Auto-subscribe lifecycle
  useEffect(() => {
    if (!deviceId) return;
    subscribeDiag();
    subscribeStats();
    return () => {
      unsubscribeDiag();
      unsubscribeStats();
    };
  }, [deviceId, subscribeDiag, subscribeStats, unsubscribeDiag, unsubscribeStats]);

  // Action handlers
  const handleRefresh = useCallback(async () => {
    if (!deviceId) return;
    const sysStatus = await readSystemStatus();
    if (sysStatus) setSystemStatus(sysStatus);

    const stats = await readStatistics();
    if (stats) setFifoStats(stats);

    const config = await readConfiguration();
    if (config) setFifoConfig(config);

    const tuning = await readTuning();
    if (tuning) setFifoTuning(tuning);
  }, [deviceId, readSystemStatus, readStatistics, readConfiguration, readTuning]);

  const handleDumpFifo = useCallback(async () => {
    if (!deviceId) return;
    const ok = await requestFifoDump();
    if (ok) {
      console.log('FIFO dump requested - check Serial output');
    } else {
      console.warn('FIFO dump request failed (must be in STANDBY)');
    }
  }, [deviceId, requestFifoDump]);

  // Computed values from FIFO stats
  const fillPct = fifoStats ? calculateFillPercentage(fifoStats) : 0;
  const overflowPct = fifoStats ? calculateOverflowRate(fifoStats) : 0;
  const remainingMins = fifoStats ? calculateEstimatedRemainingMinutes(fifoStats) : 0;

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={[theme.viewStyles.panelContainer, { backgroundColor: theme.colors.white }]}>
        {/* Header */}
        <View style={theme.viewStyles.panelTitle}>
          <Text style={theme.textStyles.panelTitle}>Diagnostics & Statistics Panel</Text>
        </View>

        {/* Device selector */}
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

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={!deviceId}
            style={{
              flex: 1,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: theme.colors.primary,
              opacity: deviceId ? 1 : 0.5,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={16} color={theme.colors.white} />
            <Text style={[theme.textStyles.buttonLabel, { marginLeft: 4 }]}>Refresh</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDumpFifo}
            disabled={!deviceId}
            style={{
              flex: 1,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: theme.colors.warn,
              opacity: deviceId ? 1 : 0.5,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Database size={16} color={theme.colors.white} />
            <Text style={[theme.textStyles.buttonLabel, { marginLeft: 4 }]}>Dump FIFO</Text>
          </TouchableOpacity>
        </View>

        {/* === DIAGNOSTICS SECTION === */}
        <View style={{ marginBottom: 16, padding: 10, backgroundColor: theme.colors.dgrey, borderRadius: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <AlertCircle size={18} color={theme.colors.primary} />
            <Text style={[theme.textStyles.body, { fontWeight: '700', marginLeft: 6 }]}>Diagnostics Service</Text>
          </View>

          {/* Error Code */}
          <View style={[theme.viewStyles.rowBetween, { marginBottom: 6 }]}>
            <Text style={theme.textStyles.body}>Error Code:</Text>
            <Text style={[theme.textStyles.body, { fontWeight: '600', color: errorCode === ErrorCode.ERR_NONE ? theme.colors.good : theme.colors.danger }]}>
              {errorCode !== null ? errorCode : '—'}
            </Text>
          </View>

          {errorDesc && (
            <Text style={[theme.textStyles.body2, { color: theme.colors.muted, marginBottom: 8 }]}>
              {errorDesc}
            </Text>
          )}

          {/* System Status */}
          {systemStatus && (
            <>
              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>BLE Status:</Text>
                <Text style={theme.textStyles.body2}>{systemStatus.bleStatus === 2 ? 'Connected' : systemStatus.bleStatus === 1 ? 'Available' : 'Unavailable'}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>IMU Status:</Text>
                <Text style={theme.textStyles.body2}>{systemStatus.imuStatus === 1 ? 'Ready' : 'Failed'}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>LED Mode:</Text>
                <Text style={theme.textStyles.body2}>{systemStatus.ledMode}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Battery:</Text>
                <Text style={theme.textStyles.body2}>{systemStatus.batteryLevel}%</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Uptime:</Text>
                <Text style={theme.textStyles.body2}>{formatUptime(systemStatus.uptimeSeconds)}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Total Errors:</Text>
                <Text style={theme.textStyles.body2}>{systemStatus.totalErrorCount}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Disconnects:</Text>
                <Text style={theme.textStyles.body2}>{systemStatus.totalDisconnectCount}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>BLE Write Failures:</Text>
                <Text style={theme.textStyles.body2}>{systemStatus.bleWriteFailures}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Max Loop Time:</Text>
                <Text style={theme.textStyles.body2}>{systemStatus.maxLoopTimeMs} ms</Text>
              </View>
            </>
          )}

          {!systemStatus && deviceId && (
            <Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontStyle: 'italic' }]}>
              No system status data (R)
            </Text>
          )}

          <Text style={[theme.textStyles.xsmall, { color: theme.colors.muted, marginTop: 6 }]}>
            Characteristics: Error Code (R/N), System Status (R/N)
          </Text>
        </View>

        {/* === STATISTICS SECTION === */}
        <View style={{ marginBottom: 16, padding: 10, backgroundColor: theme.colors.dgrey, borderRadius: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Database size={18} color={theme.colors.primary} />
            <Text style={[theme.textStyles.body, { fontWeight: '700', marginLeft: 6 }]}>Statistics Service (FIFO)</Text>
          </View>

          {/* Important Notice */}
          <View style={{ backgroundColor: theme.colors.warn, padding: 8, borderRadius: 6, marginBottom: 8 }}>
            <Text style={[theme.textStyles.body2, { color: theme.colors.white, fontWeight: '600' }]}>
              ⚠️ FIFO Stats only update when Control state is RUN or STOP
            </Text>
            <Text style={[theme.textStyles.xsmall, { color: theme.colors.white, marginTop: 2 }]}>
              Notifications are suppressed in STANDBY/OFF modes. Use Control panel to set device to RUN.
            </Text>
          </View>

          {/* FIFO Statistics */}
          {fifoStats && (
            <>
              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Current Size:</Text>
                <Text style={theme.textStyles.body2}>{fifoStats.currentSize} samples</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Max Samples:</Text>
                <Text style={theme.textStyles.body2}>{fifoStats.maxSamples}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Fill Percentage:</Text>
                <Text style={[theme.textStyles.body2, { fontWeight: '600', color: fillPct > 90 ? theme.colors.danger : fillPct > 70 ? theme.colors.warn : theme.colors.good }]}>
                  {fillPct.toFixed(1)}%
                </Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Total Samples:</Text>
                <Text style={theme.textStyles.body2}>{fifoStats.totalSamples}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Overflow Count:</Text>
                <Text style={[theme.textStyles.body2, { color: fifoStats.overflowCount > 0 ? theme.colors.warn : theme.colors.text }]}>
                  {fifoStats.overflowCount} ({overflowPct.toFixed(1)}%)
                </Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Collection Rate:</Text>
                <Text style={theme.textStyles.body2}>{fifoStats.collectionRate} Hz</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Memory Used:</Text>
                <Text style={theme.textStyles.body2}>{formatBytes(fifoStats.memoryUsedKB)}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>System Load:</Text>
                <Text style={[theme.textStyles.body2, { color: fifoStats.systemLoadPercent > 80 ? theme.colors.danger : fifoStats.systemLoadPercent > 60 ? theme.colors.warn : theme.colors.good }]}>
                  {fifoStats.systemLoadPercent}%
                </Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Est. Remaining:</Text>
                <Text style={theme.textStyles.body2}>{remainingMins.toFixed(1)} min</Text>
              </View>
            </>
          )}

          {!fifoStats && deviceId && (
            <Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontStyle: 'italic' }]}>
              No FIFO statistics (R/N)
            </Text>
          )}

          <Text style={[theme.textStyles.xsmall, { color: theme.colors.muted, marginTop: 8 }]}>
            Characteristics: FIFO Stats (R/N)
          </Text>
        </View>

        {/* === FIFO CONFIGURATION === */}
        <View style={{ marginBottom: 16, padding: 10, backgroundColor: theme.colors.dgrey, borderRadius: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Settings size={18} color={theme.colors.primary} />
            <Text style={[theme.textStyles.body, { fontWeight: '700', marginLeft: 6 }]}>FIFO Configuration</Text>
          </View>

          {fifoConfig && (
            <>
              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Capacity (minutes):</Text>
                <Text style={theme.textStyles.body2}>{fifoConfig.capacityMinutes}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Collection Freq (Hz):</Text>
                <Text style={theme.textStyles.body2}>{fifoConfig.collectionFreqHz}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Timer Interval (ms):</Text>
                <Text style={theme.textStyles.body2}>{fifoConfig.timerIntervalMs === 0 ? 'Auto' : fifoConfig.timerIntervalMs}</Text>
              </View>
            </>
          )}

          {!fifoConfig && deviceId && (
            <Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontStyle: 'italic' }]}>
              No FIFO config (R/W)
            </Text>
          )}

          <Text style={[theme.textStyles.xsmall, { color: theme.colors.muted, marginTop: 8 }]}>
            Characteristics: FIFO Config (R/W), FIFO Dump Request (W)
          </Text>
        </View>

        {/* === FIFO TUNING === */}
        <View style={{ marginBottom: 16, padding: 10, backgroundColor: theme.colors.dgrey, borderRadius: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Settings size={18} color={theme.colors.primary} />
            <Text style={[theme.textStyles.body, { fontWeight: '700', marginLeft: 6 }]}>FIFO Tuning</Text>
          </View>

          {fifoTuning && (
            <>
              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Debug Level:</Text>
                <Text style={theme.textStyles.body2}>{fifoTuning.debugLevel}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Auto Optimize:</Text>
                <Text style={theme.textStyles.body2}>{fifoTuning.autoOptimize ? 'On' : 'Off'}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Compression Mode:</Text>
                <Text style={theme.textStyles.body2}>{fifoTuning.compressionMode}</Text>
              </View>

              <View style={[theme.viewStyles.rowBetween, { marginBottom: 4 }]}>
                <Text style={theme.textStyles.body2}>Reserved:</Text>
                <Text style={theme.textStyles.body2}>{fifoTuning.reserved}</Text>
              </View>
            </>
          )}

          {!fifoTuning && deviceId && (
            <Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontStyle: 'italic' }]}>
              No FIFO tuning data (R/W)
            </Text>
          )}

          <Text style={[theme.textStyles.xsmall, { color: theme.colors.muted, marginTop: 8 }]}>
            Characteristics: FIFO Tuning (R/W)
          </Text>
        </View>

        {/* Summary note */}
        <Text style={[theme.textStyles.body2, { color: theme.colors.muted, marginTop: 8 }]}>
          R = Read, W = Write, N = Notify. Use Refresh to manually read all characteristics.
        </Text>
      </View>
    </ScrollView>
  );
};

export default DiagnosticsPanel;
