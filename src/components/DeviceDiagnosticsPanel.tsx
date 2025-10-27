import React, { useState } from 'react';
import { 
	View, 
	Text, 
	ScrollView, 
	Dimensions, 
	ViewStyle,
	TextStyle
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useBle, DevicePosition } from '../ble/BleProvider';
import { 
	useStatistics, 
	useDiagnostics, 
	useBattery, 
	useStepCounter,
	useFatigue,
	ErrorCode 
} from '../ble';
import { 
	Activity, 
	Battery,
	Cpu, 
	AlertTriangle,
	CheckCircle,
	Clock,
	TrendingUp
} from 'lucide-react-native';

const { width: screenWidth } = Dimensions.get('window');
const CARD_WIDTH = screenWidth * 0.85;
const CARD_MARGIN = 30;

interface DeviceCardProps {
	deviceId: string;
	position: DevicePosition;
	deviceName?: string;
}

interface StatisticsData {
	accelerometerSamples: number;
	gyroscopeSamples: number;
	magnetometerSamples: number;
	timestamp: number;
	fifoCount: number;
	overflow: boolean;
	underflow: boolean;
	processedSamples: number;
}

interface SystemStatus {
	uptime: number;
	cpuUsage: number;
	memoryUsage: number;
	temperature: number;
	voltageSupply: number;
	errorCount: number;
	warningCount: number;
	lastResetReason: number;
	firmwareVersion: string;
	hardwareRevision: string;
	systemHealth: 'GOOD' | 'WARNING' | 'ERROR';
}

const POSITION_LABELS = {
	leftFoot: 'Left Foot',
	rightFoot: 'Right Foot',
	racket: 'Racket'
};

const POSITION_COLORS = {
	leftFoot: '#007AFF',   // Blue
	rightFoot: '#FF9500',  // Orange  
	racket: '#34C759'      // Green
};

const DeviceCard: React.FC<DeviceCardProps> = ({ deviceId, position, deviceName }) => {
	const { theme } = useTheme();
	const [statistics, setStatistics] = useState<StatisticsData | null>(null);
	const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
	const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
	const [stepCount, setStepCount] = useState<number | null>(null);
	const [fatigueLevel, setFatigueLevel] = useState<number | null>(null);
	const [lastError, setLastError] = useState<{ code: ErrorCode; description: string } | null>(null);

	// Initialize service hooks
	useStatistics({
		deviceId,
		onStatisticsUpdate: setStatistics,
		enabled: true
	});

	useDiagnostics({
		deviceId,
		onSystemStatusUpdate: setSystemStatus,
		onErrorUpdate: (code, description) => setLastError({ code, description }),
		enabled: true
	});

	useBattery({
		deviceId,
		onBatteryUpdate: setBatteryLevel,
		enabled: true
	});

	useStepCounter({
		deviceId,
		onStepCountUpdate: setStepCount,
		enabled: true
	});

	useFatigue({
		deviceId,
		onFatigueUpdate: setFatigueLevel,
		autoSubscribe: true
	});

	const positionColor = POSITION_COLORS[position];
	const positionLabel = POSITION_LABELS[position];

	// Format uptime in human-readable format
	const formatUptime = (seconds: number): string => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		return `${hours}h ${minutes}m ${secs}s`;
	};

	// Get health status color
	const getHealthColor = (health: string): string => {
		switch (health) {
			case 'GOOD': return '#22C55E';
			case 'WARNING': return '#F59E0B';
			case 'ERROR': return '#EF4444';
			default: return '#9CA3AF';
		}
	};

	const cardStyles: ViewStyle = {
		width: CARD_WIDTH,
		backgroundColor: theme.colors.background,
		borderRadius: 16,
		padding: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
		borderWidth: 2,
		borderColor: positionColor,
	};

	const headerStyles: ViewStyle = {
		backgroundColor: positionColor + '15',
		borderRadius: 12,
		padding: 16,
		marginBottom: 20,
		alignItems: 'center',
	};

	const titleStyles: TextStyle = {
		fontSize: 18,
		fontWeight: 'bold',
		color: positionColor,
		marginBottom: 4,
	};

	const deviceNameStyles: TextStyle = {
		fontSize: 14,
		color: theme.colors.text,
		opacity: 0.8,
	};

	const sectionStyles: ViewStyle = {
		marginBottom: 16,
		padding: 12,
		backgroundColor: theme.colors.dgrey,
		borderRadius: 8,
	};

	const sectionTitleStyles: TextStyle = {
		fontSize: 14,
		fontWeight: '600',
		color: theme.colors.text,
		marginBottom: 8,
		flexDirection: 'row',
		alignItems: 'center',
	};

	const metricRowStyles: ViewStyle = {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 4,
	};

	const metricLabelStyles: TextStyle = {
		fontSize: 12,
		color: theme.colors.text,
		opacity: 0.7,
	};

	const metricValueStyles: TextStyle = {
		fontSize: 12,
		fontWeight: '600',
		color: theme.colors.text,
	};

	return (
		<View style={cardStyles}>
			{/* Header */}
			<View style={headerStyles}>
				<Text style={titleStyles}>{positionLabel}</Text>
				<Text style={deviceNameStyles}>{deviceName || 'Unknown Device'}</Text>
			</View>

			{/* System Health Status */}
			<View style={sectionStyles}>
				<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
					{systemStatus?.systemHealth === 'GOOD' ? (
						<CheckCircle size={16} color={getHealthColor(systemStatus.systemHealth)} />
					) : (
						<AlertTriangle size={16} color={getHealthColor(systemStatus?.systemHealth || 'UNKNOWN')} />
					)}
					<Text style={[sectionTitleStyles, { marginLeft: 8, marginBottom: 0 }]}>
						System Health
					</Text>
				</View>
				<Text style={[metricValueStyles, { 
					color: getHealthColor(systemStatus?.systemHealth || 'UNKNOWN'),
					fontSize: 14 
				}]}>
					{systemStatus?.systemHealth || 'Unknown'}
				</Text>
			</View>

			{/* Battery & Power */}
			<View style={sectionStyles}>
				<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
					<Battery size={16} color={theme.colors.primary} />
					<Text style={[sectionTitleStyles, { marginLeft: 8, marginBottom: 0 }]}>
						Power Status
					</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>Battery Level</Text>
					<Text style={metricValueStyles}>{batteryLevel !== null ? `${batteryLevel}%` : '—'}</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>Voltage Supply</Text>
					<Text style={metricValueStyles}>{systemStatus?.voltageSupply ? `${systemStatus.voltageSupply.toFixed(2)}V` : '—'}</Text>
				</View>
			</View>

			{/* Performance Metrics */}
			<View style={sectionStyles}>
				<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
					<Cpu size={16} color={theme.colors.primary} />
					<Text style={[sectionTitleStyles, { marginLeft: 8, marginBottom: 0 }]}>
						Performance
					</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>CPU Usage</Text>
					<Text style={metricValueStyles}>{systemStatus?.cpuUsage !== undefined ? `${systemStatus.cpuUsage}%` : '—'}</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>Memory Usage</Text>
					<Text style={metricValueStyles}>{systemStatus?.memoryUsage !== undefined ? `${systemStatus.memoryUsage}%` : '—'}</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>Temperature</Text>
					<Text style={metricValueStyles}>{systemStatus?.temperature !== undefined ? `${systemStatus.temperature}°C` : '—'}</Text>
				</View>
			</View>

			{/* Activity Data */}
			<View style={sectionStyles}>
				<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
					<Activity size={16} color={theme.colors.primary} />
					<Text style={[sectionTitleStyles, { marginLeft: 8, marginBottom: 0 }]}>
						Activity
					</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>Fatigue Level</Text>
					<Text style={metricValueStyles}>{fatigueLevel !== null ? `${fatigueLevel}%` : '—'}</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>Step Count</Text>
					<Text style={metricValueStyles}>{stepCount !== null ? stepCount.toLocaleString() : '—'}</Text>
				</View>
			</View>

			{/* Statistics */}
			{statistics && (
				<View style={sectionStyles}>
					<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
						<TrendingUp size={16} color={theme.colors.primary} />
						<Text style={[sectionTitleStyles, { marginLeft: 8, marginBottom: 0 }]}>
							Sensor Statistics
						</Text>
					</View>
					<View style={metricRowStyles}>
						<Text style={metricLabelStyles}>Accelerometer</Text>
						<Text style={metricValueStyles}>{statistics.accelerometerSamples.toLocaleString()}</Text>
					</View>
					<View style={metricRowStyles}>
						<Text style={metricLabelStyles}>Gyroscope</Text>
						<Text style={metricValueStyles}>{statistics.gyroscopeSamples.toLocaleString()}</Text>
					</View>
					<View style={metricRowStyles}>
						<Text style={metricLabelStyles}>FIFO Count</Text>
						<Text style={metricValueStyles}>{statistics.fifoCount}</Text>
					</View>
					{(statistics.overflow || statistics.underflow) && (
						<View style={metricRowStyles}>
							<Text style={metricLabelStyles}>FIFO Status</Text>
							<Text style={[metricValueStyles, { color: theme.colors.warn }]}>
								{statistics.overflow ? 'Overflow' : statistics.underflow ? 'Underflow' : 'OK'}
							</Text>
						</View>
					)}
				</View>
			)}

			{/* System Information */}
			<View style={sectionStyles}>
				<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
					<Clock size={16} color={theme.colors.primary} />
					<Text style={[sectionTitleStyles, { marginLeft: 8, marginBottom: 0 }]}>
						System Info
					</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>Uptime</Text>
					<Text style={metricValueStyles}>
						{systemStatus?.uptime ? formatUptime(systemStatus.uptime) : '—'}
					</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>Firmware</Text>
					<Text style={metricValueStyles}>{systemStatus?.firmwareVersion || '—'}</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>Hardware</Text>
					<Text style={metricValueStyles}>{systemStatus?.hardwareRevision || '—'}</Text>
				</View>
				<View style={metricRowStyles}>
					<Text style={metricLabelStyles}>Errors</Text>
					<Text style={[metricValueStyles, { 
						color: systemStatus?.errorCount ? theme.colors.danger : theme.colors.good 
					}]}>
						{systemStatus?.errorCount || 0}
					</Text>
				</View>
			</View>

			{/* Last Error */}
			{lastError && (
				<View style={[sectionStyles, { borderColor: theme.colors.danger, borderWidth: 1 }]}>
					<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
						<AlertTriangle size={16} color={theme.colors.danger} />
						<Text style={[sectionTitleStyles, { marginLeft: 8, marginBottom: 0, color: theme.colors.danger }]}>
							Last Error
						</Text>
					</View>
					<Text style={[metricValueStyles, { color: theme.colors.danger }]}>
						Code: {lastError.code}
					</Text>
					<Text style={[metricLabelStyles, { marginTop: 4 }]}>
						{lastError.description}
					</Text>
				</View>
			)}
		</View>
	);
};

export const DeviceDiagnosticsPanel: React.FC = () => {
	const { theme } = useTheme();
	const { devicesByPosition } = useBle();
	const [currentIndex, setCurrentIndex] = useState(0);

	// Get connected devices
	const devices = [
		{ position: 'leftFoot' as DevicePosition, device: devicesByPosition.leftFoot },
		{ position: 'rightFoot' as DevicePosition, device: devicesByPosition.rightFoot },
		{ position: 'racket' as DevicePosition, device: devicesByPosition.racket },
	].filter(item => item.device); // Only show connected devices

	// Handle scroll to update current index
	const handleScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
		const offsetX = event.nativeEvent.contentOffset.x;
		const cardSpacing = CARD_WIDTH + CARD_MARGIN;
		const index = Math.round(offsetX / cardSpacing);
		setCurrentIndex(Math.max(0, Math.min(index, devices.length - 1)));
	};

	if (devices.length === 0) {
		return (
			<View style={[theme.viewStyles.panelContainer, { minHeight: 200, justifyContent: 'center' }]}>
				<Text style={[theme.textStyles.placeholderText, { textAlign: 'center', color: theme.colors.text }]}>
					No devices connected
				</Text>
				<Text style={[theme.textStyles.placeholderSubText, { textAlign: 'center', color: theme.colors.muted }]}>
					Connect your StingRay devices to view diagnostics
				</Text>
			</View>
		);
	}

	return (
		<View style={theme.viewStyles.panelContainer}>
			{/* Header */}
			<View style={theme.viewStyles.panelTitle}>
				<Text style={theme.textStyles.panelTitle}>Device Diagnostics</Text>
			</View>

			{/* Horizontal Scrolling Cards */}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				onScroll={handleScroll}
				scrollEventThrottle={16}
				snapToInterval={CARD_WIDTH + CARD_MARGIN}
				snapToAlignment="center"
				decelerationRate="fast"
				contentContainerStyle={{
					paddingHorizontal: 0,
					justifyContent: devices.length === 1 ? 'center' : 'flex-start',
					alignItems: 'center',
				}}
				style={{ flexGrow: 1 }}
			>
				{devices.map((item, _index) => (
					<View
						key={`${item.position}-${item.device?.id}`}
						style={{
							marginHorizontal: devices.length === 1 ? 0 : CARD_MARGIN / 2,
						}}
					>
						<DeviceCard
							deviceId={item.device!.id}
							position={item.position}
							deviceName={item.device?.name || undefined}
						/>
					</View>
				))}
			</ScrollView>

			{/* Page Indicator */}
			{devices.length > 1 && (
				<View style={{
					flexDirection: 'row',
					justifyContent: 'center',
					alignItems: 'center',
					marginTop: 16,
					gap: 8,
				}}>
					{devices.map((_, index) => (
						<View
							key={index}
							style={{
								width: 8,
								height: 8,
								borderRadius: 4,
								backgroundColor: index === currentIndex 
									? theme.colors.primary 
									: theme.colors.border,
							}}
						/>
					))}
				</View>
			)}
		</View>
	);
};