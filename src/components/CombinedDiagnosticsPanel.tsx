/**
 * CombinedDiagnosticsPanel Component
 * 
 * A comprehensive diagnostics view that combines both device-side BLE diagnostics 
 * and iOS BLE stack monitoring in a single, unified interface.
 * 
 * Features:
 * - Device BLE diagnostics (StingRay Error Reporting Service)
 * - iOS BLE core status monitoring (always visible)
 * - Real-time error tracking and system health
 * - Countdown timers with auto-refresh
 * - Unified theme integration
 * - Per-device connection diagnostics
 * 
 * Integration Example:
 * ```tsx
 * import CombinedDiagnosticsPanel from '../components/CombinedDiagnosticsPanel';
 * 
 * // In your screen component:
 * <CombinedDiagnosticsPanel />
 * ```
 * 
 * Combines:
 * - DiagnosticsPanel: Device-side BLE error reporting and system status
 * - IOSDiagnosticsPanel: iOS BLE stack monitoring and connection health
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Smartphone, Signal, AlertTriangle, RefreshCw, Bluetooth, Activity } from 'lucide-react-native';

import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeContext';
import { useBle } from '../ble/BleProvider';
import { useDiagnostics } from '../ble/useDiagnostics';
import type { ConnectedDeviceLike } from '../ble/useDiagnostics';

// iOS BLE core status monitoring (always available)
interface IOSBLECoreStatus {
	isPoweredOn: boolean;
	isScanning: boolean;
	centralManagerState: number;
	scanDuration: number;
	totalScanCount: number;
	discoveredDevicesCount: number;
	totalConnectionAttempts: number;
	successfulConnections: number;
	connectionFailures: number;
	systemBluetoothRestarts: number;
	memoryUsage: number;
	cpuUsage: number;
	appBackgroundTime: number;
	blePermissionStatus: string;
	authorizationStatus: string;
}

// CBCentralManagerState mapping
const CENTRAL_MANAGER_STATES = {
	0: 'Unknown',
	1: 'Resetting', 
	2: 'Unsupported',
	3: 'Unauthorized',
	4: 'PoweredOff',
	5: 'PoweredOn'
} as const;

// iOS BLE error codes (from CBError)
const IOS_BLE_ERRORS = {
	0: 'No Error',
	1: 'Unknown Error',
	2: 'Invalid Parameters',
	3: 'Invalid Handle',
	4: 'Not Connected',
	5: 'Out of Space',
	6: 'Operation Cancelled',
	7: 'Connection Timeout',
	8: 'Peripheral Disconnected',
	9: 'UUID Not Allowed',
	10: 'Already Advertising',
	11: 'Connection Failed',
	12: 'Connection Limit Reached',
	13: 'Operation Not Supported'
} as const;

// Countdown timer hook
function useCountdownTimer(lastUpdate: Date | null): number {
	const [secondsLeft, setSecondsLeft] = useState(10);

	useEffect(() => {
		if (!lastUpdate) return;

		// Reset countdown to 10 seconds when lastUpdate changes
		setSecondsLeft(10);

		const interval = setInterval(() => {
			setSecondsLeft(prev => {
				if (prev <= 1) {
					// Reset to 10 when reaching 0
					return 10;
				}
				return prev - 1;
			});
		}, 1000);

		return () => clearInterval(interval);
	}, [lastUpdate]);

	return secondsLeft;
}

// Mock function to generate iOS BLE core status
function generateMockIOSCoreStatus(): IOSBLECoreStatus {
	return {
		isPoweredOn: true,
		isScanning: Math.random() > 0.7,
		centralManagerState: 5, // PoweredOn
		scanDuration: Math.floor(Math.random() * 30) + 5,
		totalScanCount: Math.floor(Math.random() * 100) + 20,
		discoveredDevicesCount: Math.floor(Math.random() * 8) + 2,
		totalConnectionAttempts: Math.floor(Math.random() * 50) + 10,
		successfulConnections: Math.floor(Math.random() * 45) + 8,
		connectionFailures: Math.floor(Math.random() * 5),
		systemBluetoothRestarts: Math.floor(Math.random() * 3),
		memoryUsage: Math.floor(Math.random() * 30) + 15,
		cpuUsage: Math.floor(Math.random() * 25) + 5,
		appBackgroundTime: Math.floor(Math.random() * 300) + 60,
		blePermissionStatus: 'Granted',
		authorizationStatus: 'allowedAlways'
	};
}

function formatUptime(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	return `${hours}h ${minutes}m ${secs}s`;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getSignalIcon(rssi: number, size: number = 16) {
	const color = rssi > -50 ? '#22c55e' : rssi > -70 ? '#f59e0b' : '#ef4444';
	return <Signal size={size} color={color} />;
}

function getConnectionQuality(rssi: number): string {
	if (rssi > -50) return 'Excellent';
	if (rssi > -60) return 'Good';
	if (rssi > -70) return 'Fair';
	return 'Poor';
}

// Core iOS BLE monitoring component
interface CoreIOSBLEMonitorProps {
	onRefresh: () => void;
}

function CoreIOSBLEMonitor({ onRefresh }: CoreIOSBLEMonitorProps) {
	const { theme } = useTheme();
	const { isPoweredOn, scanning } = useBle();
	const [coreStatus, setCoreStatus] = useState<IOSBLECoreStatus | null>(null);
	const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

	const secondsLeft = useCountdownTimer(lastUpdate);

	useEffect(() => {
		const updateCoreStatus = () => {
			setCoreStatus(generateMockIOSCoreStatus());
			setLastUpdate(new Date());
		};

		updateCoreStatus();
		const interval = setInterval(updateCoreStatus, 10000);
		return () => clearInterval(interval);
	}, []);

	const headerStyle = {
		flexDirection: 'row' as const,
		justifyContent: 'space-between' as const,
		alignItems: 'center' as const,
		marginBottom: 12,
	};

	const headerActionsStyle = {
		flexDirection: 'row' as const,
		gap: 8,
	};

	const actionButtonStyle = {
		padding: 8,
	};

	const connectionSectionStyle = {
		marginBottom: 16,
	};

	const connectionRowStyle = {
		flexDirection: 'row' as const,
		alignItems: 'center' as const,
		marginBottom: 4,
		gap: 8,
	};

	const statusGridStyle = {
		flexDirection: 'row' as const,
		flexWrap: 'wrap' as const,
		gap: 12,
	};

	const statusItemStyle = {
		minWidth: 80,
		marginBottom: 8,
	};

	const countdownStyle = {
		...theme.textStyles.lastUpdated,
		textAlign: 'center' as const,
		marginTop: 8,
		color: theme.colors.muted,
	};

	if (!coreStatus) {
		return (
			<View style={[theme.viewStyles.deviceContent, {marginBottom: 10}]}>
				<Text style={[theme.textStyles.body, { color: theme.colors.muted }]}>
					Loading iOS BLE Core Status...
				</Text>
			</View>
		);
	}

	const centralManagerStateText = CENTRAL_MANAGER_STATES[coreStatus.centralManagerState as keyof typeof CENTRAL_MANAGER_STATES] || 'Unknown';
	const connectionSuccessRate = coreStatus.totalConnectionAttempts > 0 
		? Math.round((coreStatus.successfulConnections / coreStatus.totalConnectionAttempts) * 100) 
		: 0;

	return (
		<View style={[theme.viewStyles.deviceContainer, {marginBottom: 10}]}>
			<View style={headerStyle}>
				<Text style={[theme.textStyles.deviceName, { color: theme.colors.text }]}>
					iOS BLE Core Status
				</Text>
				<View style={headerActionsStyle}>
					<TouchableOpacity style={actionButtonStyle} onPress={onRefresh}>
						<RefreshCw size={16} color={theme.colors.muted} />
					</TouchableOpacity>
				</View>
			</View>

			<View style={connectionSectionStyle}>
				<View style={connectionRowStyle}>
					<Bluetooth size={20} color={isPoweredOn ? '#22c55e' : '#ef4444'} />
					<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 16 }]}>
						{centralManagerStateText} {isPoweredOn ? '(Active)' : '(Inactive)'}
					</Text>
				</View>
				<View style={connectionRowStyle}>
					<Smartphone size={16} color={scanning ? '#22c55e' : theme.colors.muted} />
					<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 14 }]}>
						Scanning: {scanning ? 'Active' : 'Inactive'}
					</Text>
				</View>
				{coreStatus.systemBluetoothRestarts > 0 && (
					<View style={connectionRowStyle}>
						<AlertTriangle size={16} color="#f59e0b" />
						<Text style={[theme.textStyles.body2, { color: '#f59e0b', fontSize: 14 }]}>
							System Restarts: {coreStatus.systemBluetoothRestarts}
						</Text>
					</View>
				)}
			</View>

			<View style={connectionSectionStyle}>
				<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '600', fontSize: 16, marginBottom: 8 }]}>iOS BLE Core Metrics</Text>
				<View style={statusGridStyle}>
					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Permission</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{coreStatus.blePermissionStatus}
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Connect Success</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{connectionSuccessRate}%
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Devices Found</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{coreStatus.discoveredDevicesCount}
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Total Connects</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{coreStatus.totalConnectionAttempts}
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Connect Fails</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{coreStatus.connectionFailures}
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Memory Usage</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{coreStatus.memoryUsage} MB
						</Text>
					</View>
				</View>
			</View>

			<Text style={countdownStyle}>
				Next update in: {secondsLeft}s
			</Text>
		</View>
	);
}

// Combined Device Diagnostics Card (device + iOS perspective)
interface CombinedDeviceDiagnosticsCardProps {
	device: ConnectedDeviceLike;
	onRefresh: () => void;
}

function CombinedDeviceDiagnosticsCard({ device, onRefresh }: CombinedDeviceDiagnosticsCardProps) {
	const { theme } = useTheme();
	const { diagnosticsData, errorDescription, lastUpdate } = useDiagnostics(device);

	// Mock iOS perspective data for connected devices
	const [iosData] = useState({
		rssi: Math.floor(Math.random() * 40) - 70,
		mtu: Math.random() > 0.5 ? 185 : 23,
		connectionInterval: Math.floor(Math.random() * 20) + 15,
		bytesTransmitted: Math.floor(Math.random() * 1000000) + 50000,
		bytesReceived: Math.floor(Math.random() * 2000000) + 100000,
		connectionUptime: Math.floor(Math.random() * 3600) + 300,
		lastError: Math.random() > 0.8 ? Math.floor(Math.random() * 13) + 1 : 0,
	});

	const secondsLeft = useCountdownTimer(lastUpdate);

	const headerStyle = {
		flexDirection: 'row' as const,
		justifyContent: 'space-between' as const,
		alignItems: 'center' as const,
		marginBottom: 12,
	};

	const headerActionsStyle = {
		flexDirection: 'row' as const,
		gap: 8,
	};

	const actionButtonStyle = {
		padding: 8,
	};

	const systemSectionStyle = {
		marginBottom: 16,
	};

	const statusGridStyle = {
		flexDirection: 'row' as const,
		flexWrap: 'wrap' as const,
		gap: 12,
	};

	const statusItemStyle = {
		minWidth: 80,
		marginBottom: 8,
	};

	const countdownStyle = {
		...theme.textStyles.lastUpdated,
		textAlign: 'center' as const,
		marginTop: 8,
		color: theme.colors.muted,
	};

	const connectionRowStyle = {
		flexDirection: 'row' as const,
		alignItems: 'center' as const,
		marginBottom: 4,
		gap: 8,
	};

	const deviceName = device.device?.name || 'Unknown Device';
	const isConnected = !!device.device;

	if (!isConnected) {
		return (
			<View style={[theme.viewStyles.deviceContent, {marginBottom: 10}]}>
				<View style={headerStyle}>
					<Text style={[theme.textStyles.deviceName, { color: theme.colors.text }]}>
						{deviceName}
					</Text>
					<Text style={[theme.textStyles.error, { color: theme.colors.muted }]}>
						Not Connected
					</Text>
				</View>
				<Text style={[theme.textStyles.error, { color: theme.colors.muted }]}>
					Device diagnostics available when connected
				</Text>
			</View>
		);
	}

	if (!diagnosticsData) {
		return (
			<View style={[theme.viewStyles.deviceContent, {marginBottom: 10}]}>
				<Text style={[theme.textStyles.body, { color: theme.colors.muted }]}>
					Loading device diagnostics...
				</Text>
			</View>
		);
	}

	// Error severity logic
	const errorSeverity = diagnosticsData.errorCode === 0 ? 'none' : diagnosticsData.errorCode <= 10 ? 'warning' : 'error';
	const errorColor = errorSeverity === 'none' ? '#22c55e' : errorSeverity === 'warning' ? '#f59e0b' : '#ef4444';

	const lastErrorText = IOS_BLE_ERRORS[iosData.lastError as keyof typeof IOS_BLE_ERRORS] || 'Unknown Error';

	return (
		<View style={[theme.viewStyles.deviceContainer, {marginBottom: 10}]}>
			<View style={headerStyle}>
				<Text style={[theme.textStyles.deviceName, { color: theme.colors.text }]}>
					{deviceName}
				</Text>
				<View style={headerActionsStyle}>
					<TouchableOpacity style={actionButtonStyle} onPress={onRefresh}>
						<RefreshCw size={16} color={theme.colors.muted} />
					</TouchableOpacity>
				</View>
			</View>

			{/* Device Health Overview */}
			<View style={systemSectionStyle}>
				<View style={connectionRowStyle}>
					<Activity size={20} color={errorColor} />
					<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 16 }]}>
						Device Health: {diagnosticsData.systemStatus?.isHealthy ? '100' : '0'}%
					</Text>
				</View>
				<View style={connectionRowStyle}>
					{getSignalIcon(iosData.rssi)}
					<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 14 }]}>
						Signal: {iosData.rssi} dBm ({getConnectionQuality(iosData.rssi)})
					</Text>
				</View>
				{iosData.lastError > 0 && (
					<View style={connectionRowStyle}>
						<AlertTriangle size={16} color="#f59e0b" />
						<Text style={[theme.textStyles.body2, { color: '#f59e0b', fontSize: 14 }]}>
							iOS Error: {lastErrorText}
						</Text>
					</View>
				)}
			</View>

			{/* Device Metrics */}
			<View style={systemSectionStyle}>
				<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '600', fontSize: 16, marginBottom: 8 }]}>Device Metrics</Text>
				<View style={statusGridStyle}>
					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Error Code</Text>
						<Text style={[theme.textStyles.body, { color: errorColor, fontWeight: '500', fontSize: 14 }]}>
							{diagnosticsData.errorCode} - {errorDescription}
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>BLE Status</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{(diagnosticsData.systemStatus?.bleStatus === 0) ? 'Unavailable' : (diagnosticsData.systemStatus?.bleStatus === 1) ? 'Available' : 'Connected'}
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Max Loop Time</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{diagnosticsData.systemStatus?.maxLoopTime || 0}ms
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Battery Level</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{diagnosticsData.systemStatus?.batteryLevel || 0}%
						</Text>
					</View>
				</View>
			</View>

			{/* iOS Connection Metrics */}
			<View style={systemSectionStyle}>
				<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '600', fontSize: 16, marginBottom: 8 }]}>iOS Connection Metrics</Text>
				<View style={statusGridStyle}>
					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>MTU Size</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{iosData.mtu} bytes
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Conn Interval</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{iosData.connectionInterval}ms
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Uptime</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{formatUptime(iosData.connectionUptime)}
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Data Sent</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{formatBytes(iosData.bytesTransmitted)}
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Data Received</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{formatBytes(iosData.bytesReceived)}
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Services</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{device.services?.length || 0}
						</Text>
					</View>

					<View style={statusItemStyle}>
						<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Characteristics</Text>
						<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
							{Object.values(device.characteristicsByService || {}).reduce((total, chars) => total + chars.length, 0)}
						</Text>
					</View>
				</View>
			</View>

			<Text style={countdownStyle}>
				Next update in: {secondsLeft}s
			</Text>
		</View>
	);
}

export default function CombinedDiagnosticsPanel() {
	const { theme } = useTheme();
	const { entryA, entryB } = useSession();

	return (
		<ScrollView style={[theme.viewStyles.panelContainer]}>
			<Text style={[theme.textStyles.panelTitle, { color: theme.colors.text }]}>
				BLE Diagnostics
			</Text>
			
			{/* Always show core iOS BLE monitoring */}
			<CoreIOSBLEMonitor
				onRefresh={() => {
					// Force refresh of core status
				}}
			/>
			
			{/* Device-specific diagnostics */}
			{entryA && (
				<CombinedDeviceDiagnosticsCard
					device={entryA}
					onRefresh={() => {
						// Force refresh for device A
					}}
				/>
			)}
			
			{entryB && (
				<CombinedDeviceDiagnosticsCard
					device={entryB}
					onRefresh={() => {
						// Force refresh for device B
					}}
				/>
			)}

			{/* Show placeholder when no devices connected */}
			{!entryA && !entryB && (
				<View style={[theme.viewStyles.deviceContent, {marginBottom: 10}]}>
					<Text style={[theme.textStyles.body, { color: theme.colors.muted, textAlign: 'center' }]}>
						Device diagnostics will appear when devices are connected
					</Text>
				</View>
			)}
		</ScrollView>
	);
}