/**
 * DiagnosticsPanel Component
 * 
 * A comprehensive BLE device diagnostics view that displays real-time error monitoring,
 * system health status, and diagnostic information for StingRay fitness sensors.
 * 
 * Features:
 * - Real-time error code display with color-coded severity
 * - System status monitoring (BLE, IMU, battery, LED mode, uptime)
 * - IMU performance metrics (samples sent/dropped, efficiency)
 * - BLE connectivity monitoring (disconnects, write failures)
 * - System performance metrics (max loop time)
 * - Auto-refresh every 10 seconds via BLE hooks with countdown timer
 * - Individual device refresh buttons
 * 
 * Integration Example:
 * ```tsx
 * import DiagnosticsPanel from '../components/DiagnosticsPanel';
 * 
 * // In your screen component:
 * <DiagnosticsPanel />
 * ```
 * 
 * BLE Implementation:
 * - Uses useDiagnostics hook with real BLE integration
 * - Service UUID: 87654321-4321-8765-4321-210987654321
 * - Optimized service with 2 characteristics (Error Code, System Status)
 * - Expanded 40-byte system status with BLE monitoring data
 * - Automatically polls every 10 seconds with notifications and countdown display
 * - Error clearing happens automatically when device enters LED_OFF mode
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react-native';

import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeContext';
import { useDiagnostics, type ConnectedDeviceLike } from '../ble/useDiagnostics';

// Updated error code definitions from new specification
const ERROR_CODES = {
	0: 'No Error',
	1: 'IMU Initialization Failed',
	2: 'IMU Data Read Failure',
	3: 'BLE Initialization Failed',
	4: 'BLE Connection Lost',
	5: 'Flash Write Failed',
	6: 'Flash Read Failed',
	7: 'Battery Read Failed',
	8: 'Low Battery',
	9: 'System Overload',
	10: 'Watchdog Reset',
	11: 'Serial Debug Enabled',
	12: 'TensorFlow Disabled',
	13: 'Connection Supervision Timeout',
	14: 'Signal Strength Too Low',
	15: 'MTU Negotiation Failed',
	16: 'BLE Characteristic Write Failed',
	17: 'BLE Transmission Backpressure',
	255: 'Unknown Error'
} as const;

// LED mode descriptions from new specification  
const LED_MODE_DESCRIPTIONS = {
	0: 'Standby (Amber)',
	1: 'Active (Pulsing Red)',
	2: 'Active (Pulsing Green)', 
	3: 'Active (Pulsing Blue)',
	4: 'Active (Solid Red)',
	5: 'Active (Solid Green)',
	6: 'Active (Solid Blue)',
	10: 'Low Power (Off)'
} as const;

// Updated system status interface for new 40-byte packed struct
interface SystemStatus {
	bleStatus: number;
	imuStatus: number;
	ledMode: number;
	batteryLevel: number;
	uptime: number;
	imuSamplesSent: number;
	imuSamplesDropped: number;
	totalErrorCount: number;
	totalDisconnectCount: number;
	bleWriteFailures: number;
	maxLoopTime: number;
	reserved: Uint8Array;
	imuEfficiency: number;
	isHealthy: boolean;
}

interface DeviceDiagnosticsCard {
	deviceId: string;
	deviceName: string;
	errorCode: number;
	errorDescription: string;
	systemStatus: SystemStatus | null;
	lastUpdate: Date;
	isConnected: boolean;
	supported: boolean;
	error: string | null;
}

function formatUptime(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	return `${hours}h ${minutes}m ${secs}s`;
}

function getLedModeDescription(ledMode: number): string {
	return LED_MODE_DESCRIPTIONS[ledMode as keyof typeof LED_MODE_DESCRIPTIONS] ?? `Unknown Mode (${ledMode})`;
}

// Countdown timer hook for showing next update countdown
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

function getStatusIcon(status: number, size: number = 16) {
	const color = status === 0 ? '#22c55e' : '#ef4444';
	return status === 0 ? 
		<CheckCircle size={size} color={color} /> : 
		<XCircle size={size} color={color} />;
}

function getErrorSeverity(errorCode: number): 'low' | 'medium' | 'high' {
	if (errorCode === 0) return 'low';
	if ([8, 10].includes(errorCode)) return 'high'; // Low Battery, Watchdog Reset  
	if ([1, 2, 3, 4, 5, 6, 7, 9, 13, 14, 15, 16, 17].includes(errorCode)) return 'medium'; // Init failures, communication errors, system overload, BLE connectivity issues
	return 'low'; // Debug mode, TensorFlow disabled, unknown errors
}

function getErrorColor(errorCode: number): string {
	const severity = getErrorSeverity(errorCode);
	switch (severity) {
		case 'high': return '#ef4444';
		case 'medium': return '#f59e0b';
		case 'low': return '#22c55e';
		default: return '#6b7280';
	}
}

interface DeviceDiagnosticsCardProps {
	diagnostics: DeviceDiagnosticsCard;
	onRefresh: () => void;
}

function DeviceDiagnosticsCard({ diagnostics, onRefresh }: DeviceDiagnosticsCardProps) {
	const { theme } = useTheme();

	// Countdown timer for next data update (resets when lastUpdate changes)
	const secondsLeft = useCountdownTimer(diagnostics.lastUpdate);

	// Define local styles using theme values
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

	const errorSectionStyle = {
		marginBottom: 16,
	};

	const errorCodeRowStyle = {
		flexDirection: 'row' as const,
		alignItems: 'center' as const,
		marginBottom: 4,
		gap: 8,
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

	const statusValueStyle = {
		flexDirection: 'row' as const,
		alignItems: 'center' as const,
		gap: 4,
	};

	const countdownStyle = {
		...theme.textStyles.lastUpdated,
		textAlign: 'center' as const,
		marginTop: 8,
		color: theme.colors.muted,
	};

	if (!diagnostics.supported) {
		return (
			<View style={[theme.viewStyles.deviceContent, {marginBottom: 10}]}>
				<View style={headerStyle}>
					<Text style={[theme.textStyles.deviceName, { color: theme.colors.text }]}>
						{diagnostics.deviceName}
					</Text>
					<Text style={[theme.textStyles.error, { color: theme.colors.muted }]}>
						Diagnostics Not Supported
					</Text>
				</View>
				<Text style={[theme.textStyles.error, { color: theme.colors.muted }]}>
					This device does not support diagnostics service
				</Text>
			</View>
		);
	}

	if (diagnostics.error) {
		return (
			<View style={[theme.viewStyles.deviceContent, {marginBottom: 10}]}>
				<View style={headerStyle}>
					<Text style={[theme.textStyles.deviceName, { color: theme.colors.text }]}>
						{diagnostics.deviceName}
					</Text>
					<TouchableOpacity 
						style={actionButtonStyle}
						onPress={onRefresh}
					>
						<RefreshCw size={16} color={theme.colors.muted} />
					</TouchableOpacity>
				</View>
				<Text style={[theme.textStyles.error, { color: theme.colors.danger }]}>
					{diagnostics.error}
				</Text>
			</View>
		);
	}

	const errorCodeText = ERROR_CODES[diagnostics.errorCode as keyof typeof ERROR_CODES] || `Unknown Error (${diagnostics.errorCode})`;

	return (
		<View style={[theme.viewStyles.deviceContainer, {marginBottom: 10}]}>
			{/* Header */}
			<View style={headerStyle}>
				<Text style={[theme.textStyles.deviceName, { color: theme.colors.text }]}>
					{diagnostics.deviceName}
				</Text>
				<View style={headerActionsStyle}>
					<TouchableOpacity 
						style={actionButtonStyle}
						onPress={onRefresh}
					>
						<RefreshCw size={16} color={theme.colors.muted} />
					</TouchableOpacity>
				</View>
			</View>

			{/* Current Error Status */}
			<View style={errorSectionStyle}>
				<View style={errorCodeRowStyle}>
					<AlertTriangle 
						size={20} 
						color={getErrorColor(diagnostics.errorCode)}
					/>
					<Text style={[theme.textStyles.body, { color: getErrorColor(diagnostics.errorCode), fontWeight: '500', fontSize: 16 }]}>
						{errorCodeText}
					</Text>
				</View>
				<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 14 }]}>
					Total Errors: {diagnostics.systemStatus?.totalErrorCount ?? 0}
				</Text>
			</View>

			{/* System Status */}
			{diagnostics.systemStatus && (
				<View style={systemSectionStyle}>
					<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '600', fontSize: 16, marginBottom: 8 }]}>System Status</Text>
					<View style={statusGridStyle}>
						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>BLE</Text>
							<View style={statusValueStyle}>
								{getStatusIcon(diagnostics.systemStatus.bleStatus >= 1 ? 0 : 1)}
								<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
									{diagnostics.systemStatus.bleStatus === 2 ? 'Connected' : 
									 diagnostics.systemStatus.bleStatus === 1 ? 'Available' : 'Unavailable'}
								</Text>
							</View>
						</View>

						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>IMU</Text>
							<View style={statusValueStyle}>
								{getStatusIcon(diagnostics.systemStatus.imuStatus === 1 ? 0 : 1)}
								<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
									{diagnostics.systemStatus.imuStatus === 1 ? 'Ready' : 'Failed'}
								</Text>
							</View>
						</View>

						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>LED Mode</Text>
							<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
								{getLedModeDescription(diagnostics.systemStatus.ledMode)}
							</Text>
						</View>

						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Battery</Text>
							<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
								{diagnostics.systemStatus.batteryLevel}%
							</Text>
						</View>

						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Uptime</Text>
							<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
								{formatUptime(diagnostics.systemStatus.uptime)}
							</Text>
						</View>

						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>IMU Efficiency</Text>
							<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
								{diagnostics.systemStatus.imuEfficiency.toFixed(1)}%
							</Text>
						</View>

						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Samples Sent</Text>
							<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
								{diagnostics.systemStatus.imuSamplesSent.toLocaleString()}
							</Text>
						</View>

						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Samples Dropped</Text>
							<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
								{diagnostics.systemStatus.imuSamplesDropped.toLocaleString()}
							</Text>
						</View>

						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>BLE Disconnects</Text>
							<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
								{diagnostics.systemStatus.totalDisconnectCount.toLocaleString()}
							</Text>
						</View>

						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>BLE Write Fails</Text>
							<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
								{diagnostics.systemStatus.bleWriteFailures.toLocaleString()}
							</Text>
						</View>

						<View style={statusItemStyle}>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted, fontSize: 12, marginBottom: 2 }]}>Max Loop Time</Text>
							<Text style={[theme.textStyles.body, { color: theme.colors.text, fontWeight: '500', fontSize: 14 }]}>
								{diagnostics.systemStatus.maxLoopTime}μs
							</Text>
						</View>
					</View>
				</View>
			)}

			{/* Next Update Countdown */}
			<Text style={countdownStyle}>
				Next update in: {secondsLeft}s
			</Text>
		</View>
	);
}

export default function DiagnosticsPanel() {
	const { theme } = useTheme();
	const { entryA, entryB } = useSession();

	// Use BLE diagnostics hooks for both devices
	const deviceADiagnostics = useDiagnostics(entryA as ConnectedDeviceLike, {
		subscribe: true,
		intervalMs: 10000, // 10s polling interval to match device update frequency
		waitMs: 5000
	});

	const deviceBDiagnostics = useDiagnostics(entryB as ConnectedDeviceLike, {
		subscribe: true,
		intervalMs: 10000, // 10s polling interval to match device update frequency
		waitMs: 5000
	});

	// Transform BLE hook data to component format
	const getDiagnosticsCard = (
		entry: ConnectedDeviceLike | undefined,
		diagnostics: ReturnType<typeof useDiagnostics>
	): DeviceDiagnosticsCard | null => {
		if (!entry) return null;

		return {
			deviceId: entry.id,
			deviceName: entry.device?.name || 'Unknown Device',
			errorCode: diagnostics.errorCode ?? 0,
			errorDescription: diagnostics.errorDescription ?? 'No Error',
			systemStatus: diagnostics.systemStatus,
			lastUpdate: diagnostics.lastUpdate ?? new Date(),
			isConnected: !!entry.device,
			supported: diagnostics.supported,
			error: diagnostics.error
		};
	};

	const diagnosticsA = getDiagnosticsCard(entryA, deviceADiagnostics);
	const diagnosticsB = getDiagnosticsCard(entryB, deviceBDiagnostics);

	return (
		<ScrollView style={[theme.viewStyles.panelContainer]}>
			<Text style={[theme.textStyles.panelTitle, { color: theme.colors.text }]}>
				BLE Client Diagnostics
			</Text>
			
			{diagnosticsA && (
				<DeviceDiagnosticsCard
					diagnostics={diagnosticsA}
					onRefresh={() => {
						// Hook automatically refreshes, this could trigger a manual refresh if needed
						console.log('Manual refresh requested for Device A');
					}}
				/>
			)}
			
			{diagnosticsB && (
				<DeviceDiagnosticsCard
					diagnostics={diagnosticsB}
					onRefresh={() => {
						// Hook automatically refreshes, this could trigger a manual refresh if needed
						console.log('Manual refresh requested for Device B');
					}}
				/>
			)}
		</ScrollView>
	);
}