import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';

import { useBle, DevicePosition } from '../ble/BleProvider';
import { LEDControlMode } from '../ble/useLEDControl';
import { useTheme } from '../theme/ThemeContext';
import { useControl, ControlState } from '../ble/useControl';
import { useBattery } from '../ble/useBattery';
import { useStatistics } from '../ble/useStatistics';
import { PowerStateButton } from './PowerStateCycler';
import { useSession } from '../session/SessionProvider';

import { Settings, Lightbulb, Lock, Unlock, Trash } from 'lucide-react-native';
import FootIcon from './FootIcon';

interface DeviceSettingsPanelProps {
	enabled?: boolean; // Flag to enable/disable settings (for session state)
}

const POSITION_LABELS = {
	leftFoot: 'Left Foot',
	rightFoot: 'Right Foot',
	racket: 'Racket',
};

const POSITION_COLORS = {
	leftFoot: '#007AFF', // Blue
	rightFoot: '#007AFF', //'#FF9500',  // Orange
	racket: '#007AFF', //'#34C759'      // Green
};

const LED_MODE_OPTIONS = [
	{ value: LEDControlMode.AMBER, label: 'Standby', shortLabel: 'AMB', color: '#FFA500' },
	{ value: LEDControlMode.SOLID_RED, label: 'Collecting', shortLabel: 'S-R', color: '#EF4444' },
	{ value: LEDControlMode.SOLID_GREEN, label: 'Collecting', shortLabel: 'S-G', color: '#10B981' },
	{ value: LEDControlMode.SOLID_BLUE, label: 'Collecting', shortLabel: 'S-B', color: '#3B82F6' },
];

// Shared button styles - matching PowerStateCycler component
const CONTROL_BUTTON_STYLES = {
	size: 44,
	borderRadius: 6,
	borderWidth: 2,
	iconSize: 24,
	disabledOpacity: 0.4,
	pressedOpacity: 0.7,
	pressedScale: 0.95,
};

// Shared layout constants
const LAYOUT_CONSTANTS = {
	deviceBoxHeight: 230,
	watermarkOpacity: 0.4,
	watermarkSize: 140,
	headerHeight: 50,
	headerIconSize: 28,
};

// Compact device box component
interface DeviceBoxProps {
	position: DevicePosition;
	device: { id: string; name?: string | null; position?: DevicePosition } | null;
	ledMode: LEDControlMode;
	enabled: boolean;
	onLEDModeChange: (deviceId: string, mode: LEDControlMode) => void;
	onRemoveDevice: (deviceId: string) => void;
	onAssignDevice: (position: DevicePosition) => void;
}

const DeviceBox: React.FC<DeviceBoxProps> = ({ position, device, ledMode, enabled, onLEDModeChange, onRemoveDevice, onAssignDevice }) => {
	const { theme } = useTheme();
	const deviceId = device?.id || '';

	// Device state/battery/FIFO fill
	const [controlState, setControlState] = useState<ControlState | null>(null);
	const [batteryPct, setBatteryPct] = useState<number | null>(null);
	const [fillPct, setFillPct] = useState<number | null>(null);

	// Hooks for control state
	const {
		subscribe: subCtl,
		unsubscribe: unsubCtl,
		readState,
	} = useControl({
		deviceId,
		enabled: !!deviceId,
		onStateUpdate: (s) => setControlState(s),
	});

	useEffect(() => {
		let cancelled = false;
		if (!deviceId) {
			setControlState(null);
			return;
		}
		(async () => {
			const s = await readState();
			if (!cancelled) setControlState(s);
		})();
		subCtl();
		return () => {
			cancelled = true;
			unsubCtl();
		};
	}, [deviceId, readState, subCtl, unsubCtl]);

	// Battery percent via Battery Service
	const {
		subscribe: subBatt,
		unsubscribe: unsubBatt,
		readBatteryLevel,
	} = useBattery({
		deviceId,
		enabled: !!deviceId,
		onBatteryUpdate: (level) => setBatteryPct(level),
	});

	useEffect(() => {
		let cancelled = false;
		if (!deviceId) {
			setBatteryPct(null);
			return;
		}
		(async () => {
			const level = await readBatteryLevel();
			if (!cancelled && level !== null) setBatteryPct(level);
		})();
		subBatt();
		return () => {
			cancelled = true;
			unsubBatt();
		};
	}, [deviceId, readBatteryLevel, subBatt, unsubBatt]); // Hooks for statistics: FIFO fill percentage
	const {
		subscribe: subStats,
		unsubscribe: unsubStats,
		readStatistics: readStats,
		calculateFillPercentage,
	} = useStatistics({
		deviceId,
		enabled: !!deviceId,
		onStatisticsUpdate: (stats) => setFillPct(calculateFillPercentage(stats)),
	});

	useEffect(() => {
		let cancelled = false;
		if (!deviceId) {
			setFillPct(null);
			return;
		}
		(async () => {
			const stats = await readStats();
			if (!cancelled && stats) setFillPct(calculateFillPercentage(stats));
		})();
		subStats();
		return () => {
			cancelled = true;
			unsubStats();
		};
	}, [deviceId, readStats, subStats, unsubStats, calculateFillPercentage]);

	// Get next LED mode for step-through
	const getNextLEDMode = (currentMode: LEDControlMode): LEDControlMode => {
		const currentIndex = LED_MODE_OPTIONS.findIndex((opt) => opt.value === currentMode);
		const nextIndex = (currentIndex + 1) % LED_MODE_OPTIONS.length;
		return LED_MODE_OPTIONS[nextIndex].value;
	};

	// Allow LED changes in STANDBY and STOP (disabled in RUN and OFF)
	const canChangeLED = !!device && enabled && controlState === ControlState.STOP;

	// Allow device position changes (assign/remove) only in STOP
	const canChangePosition = !!device && enabled && controlState === ControlState.STOP;

	const handleLEDStep = () => {
		if (device && canChangeLED) {
			const nextMode = getNextLEDMode(ledMode);
			onLEDModeChange(device.id, nextMode);
		}
	};

	const currentLEDOption = LED_MODE_OPTIONS.find((opt) => opt.value === ledMode);

	// Shared button base style
	const controlButtonBaseStyle = {
		width: CONTROL_BUTTON_STYLES.size,
		height: CONTROL_BUTTON_STYLES.size,
		borderRadius: CONTROL_BUTTON_STYLES.borderRadius,
		alignItems: 'center' as const,
		justifyContent: 'center' as const,
		borderWidth: CONTROL_BUTTON_STYLES.borderWidth,
		borderColor: theme.colors.white,
	};

	return (
		<View style={{ flexDirection: 'column', gap: 10 }}>

			{/* Device */}
			<View
				style={[
					theme.viewStyles.card,
					{
						backgroundColor: 'rgba(0,0,0,0.1)',
						height: LAYOUT_CONSTANTS.deviceBoxHeight,
						borderWidth: 2,
						borderColor: device ? POSITION_COLORS[position] : theme.colors.border,
						opacity: enabled ? 1 : 0.7,
						padding: 5,
					},
				]}
			>
				{/* Position Header */}
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, height: LAYOUT_CONSTANTS.headerHeight }}>
					<Text style={[theme.textStyles.body, { fontWeight: '600', color: POSITION_COLORS[position], margin: 0 }]}>{POSITION_LABELS[position]}</Text>
					 {device ? <PowerStateButton  deviceId={deviceId} buttonSize={CONTROL_BUTTON_STYLES.size} /> : null }
				</View>

				{/* Content Area - Fixed Height to Ensure Consistent Sizing */}
				<View style={{ flex: 1, justifyContent: 'space-between' }}>
					{device ? (
						<>
							{/* Watermark */}
							<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', opacity: LAYOUT_CONSTANTS.watermarkOpacity }}>
								<FootIcon size={LAYOUT_CONSTANTS.watermarkSize} side={position === 'leftFoot' ? 'left' : 'right'} color={currentLEDOption?.color} />
							</View>

							{/* Device Info */}
							<View style={{ marginBottom: 8 }}>
								<Text style={[theme.textStyles.body, { fontWeight: '600' }]}>{device.name || 'StingRay'}</Text>
								<Text style={[theme.textStyles.body2, { color: theme.colors.muted }]}>{device.id.slice(-6)}</Text>
								<View style={{ marginTop: 6 }}>
									<View style={[theme.viewStyles.rowBetween, { marginBottom: 2 }]}>
										<Text style={theme.textStyles.body}>State:</Text>
										<Text style={[theme.textStyles.body, { fontWeight: '600' }]}>
											{controlState === null
												? '—'
												: controlState === ControlState.STANDBY
												? 'STANDBY'
												: controlState === ControlState.RUN
												? 'RUN'
												: controlState === ControlState.STOP
												? 'READY'
												: controlState === ControlState.OFF
												? 'OFF'
												: '—'}
										</Text>
									</View>
									<View style={[theme.viewStyles.rowBetween, { marginBottom: 2 }]}>
										<Text style={theme.textStyles.body}>Battery:</Text>
										<Text style={theme.textStyles.body}>{batteryPct !== null ? `${batteryPct}%` : '—'}</Text>
									</View>
									<View style={[theme.viewStyles.rowBetween]}>
										<Text style={theme.textStyles.body}>FIFO Fill:</Text>
										<Text style={theme.textStyles.body}>{fillPct !== null ? `${fillPct.toFixed(1)}%` : '—'}</Text>
									</View>
								</View>
							</View>

							{/* Control Buttons */}
							<View style={{ flexDirection: 'row', alignContent: 'center', justifyContent: 'space-between' }}>
								<Pressable
									style={({ pressed }) => [
										controlButtonBaseStyle,
										{
											backgroundColor: canChangePosition ? theme.colors.black : theme.colors.white,
										},
										!canChangeLED && { opacity: CONTROL_BUTTON_STYLES.disabledOpacity },
										pressed && canChangeLED && { 
											opacity: CONTROL_BUTTON_STYLES.pressedOpacity, 
											transform: [{ scale: CONTROL_BUTTON_STYLES.pressedScale }] 
										},
									]}
									onPress={handleLEDStep}
									disabled={!canChangeLED}
								>
									<Lightbulb 
										size={CONTROL_BUTTON_STYLES.iconSize} 
										color={canChangeLED ? currentLEDOption?.color : theme.colors.muted} 
										fill={canChangeLED ? currentLEDOption?.color : theme.colors.muted} 
									/>
								</Pressable>

								<Pressable
									style={({ pressed }) => [
										controlButtonBaseStyle,
										{
											backgroundColor: canChangePosition ? theme.colors.danger : theme.colors.muted,
										},
										!canChangePosition && { opacity: CONTROL_BUTTON_STYLES.disabledOpacity },
										pressed && canChangePosition && { 
											opacity: CONTROL_BUTTON_STYLES.pressedOpacity, 
											transform: [{ scale: CONTROL_BUTTON_STYLES.pressedScale }] 
										},
									]}
									onPress={() => canChangePosition && onRemoveDevice(device.id)}
									disabled={!canChangePosition}
								>
									<Trash size={CONTROL_BUTTON_STYLES.iconSize} color={theme.colors.white} />
								</Pressable>
							</View>
						</>
					) : (
						// Empty slot - show assign button
						<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', height: LAYOUT_CONSTANTS.deviceBoxHeight }}>
							<Pressable
								style={({ pressed }) => [
									{ borderRadius: 8 }, 
									!enabled ? { opacity: 0.5 } : { opacity: pressed ? 0.85 : 1 }, 
									{ transform: [{ scale: pressed ? 0.98 : 1 }] }
								]}
								onPress={() => enabled && onAssignDevice(position)}
								disabled={!enabled}
							>
								<FootIcon size={LAYOUT_CONSTANTS.watermarkSize} side={position === 'leftFoot' ? 'left' : 'right'} color={theme.colors.primary} />
							</Pressable>
						</View>
					)}
				</View>
				
			</View>
		</View>
	);
};

export const DeviceSettingsPanel: React.FC<DeviceSettingsPanelProps> = ({ enabled = true }) => {
	const { connected, devicesByPosition, assignDevicePosition, unassignDevicePosition } = useBle();

	const { theme } = useTheme();

	// LED control states for each device
	const [ledModes, setLedModes] = useState<Record<string, LEDControlMode>>({});

	const { isActive } = useSession()

	// Available devices that can be assigned
	//const availableDevices = Object.values(connected).filter(device => !device.position);

	// Read actual LED modes from connected devices
	const readDeviceLEDMode = useCallback(
		async (deviceId: string): Promise<LEDControlMode> => {
			try {
				const deviceEntry = connected[deviceId];
				if (!deviceEntry?.device) {
					return LEDControlMode.AMBER; // Default fallback
				}

				const device = deviceEntry.device;
				const isConnected = await device.isConnected();
				if (!isConnected) {
					return LEDControlMode.AMBER; // Default fallback
				}

				// Read the LED control characteristic
				const characteristic = await device.readCharacteristicForService(
					'19b10010-e8f2-537e-4f6c-d104768a1214', // LED_SERVICE_UUID
					'19b10010-e8f2-537e-4f6c-d104768a1215', // LED_CONTROL_CHARACTERISTIC_UUID
				);

				if (characteristic?.value) {
					// Parse LED mode from base64 (same logic as useLEDControl)
					const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
					if (characteristic.value.length < 2) return LEDControlMode.AMBER;

					const char1 = base64chars.indexOf(characteristic.value[0]);
					const char2 = base64chars.indexOf(characteristic.value[1]);
					if (char1 === -1 || char2 === -1) return LEDControlMode.AMBER;

					// eslint-disable-next-line no-bitwise
					const mode = (char1 << 2) | (char2 >> 4);

					// Validate mode is within enum range
					if (mode >= 0 && mode <= 10) {
						return mode as LEDControlMode;
					}
				}
		} catch (error) {
			// Device might not support LED control - this is normal
			if (__DEV__) console.log(`Device ${deviceId} does not support LED control or read failed:`, error);
		}			return LEDControlMode.AMBER; // Default fallback
		},
		[connected],
	);

	// Initialize LED modes by reading from connected devices
	useEffect(() => {
		const initializeLEDModes = async () => {
			const updates: Record<string, LEDControlMode> = {};

			for (const deviceId of Object.keys(connected)) {
				if (!(deviceId in ledModes)) {
					// Read actual LED mode from device
					const actualMode = await readDeviceLEDMode(deviceId);
					updates[deviceId] = actualMode;
				}
			}

			if (Object.keys(updates).length > 0) {
				setLedModes((prev) => ({ ...prev, ...updates }));
			}
		};

		initializeLEDModes();
	}, [connected, ledModes, readDeviceLEDMode]);

	// Handle LED mode change
	const handleLEDModeChange = useCallback(
		async (deviceId: string, mode: LEDControlMode) => {
			try {
				// Update local state immediately for responsive UI
				setLedModes((prev) => ({ ...prev, [deviceId]: mode }));

				// Get the connected device
				const deviceEntry = connected[deviceId];
				if (!deviceEntry?.device) {
					throw new Error('Device not connected');
				}

				const device = deviceEntry.device;

				// Check if device is still connected
				const isConnected = await device.isConnected();
				if (!isConnected) {
					throw new Error('Device is no longer connected');
				}

				// Encode the LED mode (same as useLEDControl hook)
				const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
				// eslint-disable-next-line no-bitwise
				const modeValue = mode & 0xff; // Ensure single byte
				// eslint-disable-next-line no-bitwise
				const char1 = base64chars[(modeValue >> 2) & 0x3f];
				// eslint-disable-next-line no-bitwise
				const char2 = base64chars[(modeValue << 4) & 0x30];
				const encodedMode = char1 + char2 + '==';

				// Send the command directly to the device using the same UUIDs as useLEDControl
			await device.writeCharacteristicWithResponseForService(
				'19b10010-e8f2-537e-4f6c-d104768a1214', // LED_SERVICE_UUID
				'19b10010-e8f2-537e-4f6c-d104768a1215', // LED_CONTROL_CHARACTERISTIC_UUID
				encodedMode,
			);

			if (__DEV__) console.log(`Successfully set LED mode for device ${deviceId} to ${mode}`);
		} catch (error) {
			console.warn(`Failed to set LED mode for device ${deviceId}:`, error);
				// Revert the local state on error - set back to previous value or default
				setLedModes((prev) => ({ ...prev, [deviceId]: LEDControlMode.AMBER }));
				Alert.alert('Error', `Failed to set LED mode: ${error}`);
			}
		},
		[connected],
	);

	// Handle device removal from position
	const handleRemoveDevice = useCallback(
		(deviceId: string) => {
			Alert.alert('Remove Device', 'Remove this device from its position?', [
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Remove',
					style: 'destructive',
					onPress: () => unassignDevicePosition(deviceId),
				},
			]);
		},
		[unassignDevicePosition],
	);

	// Handle device assignment to position
	const handleAssignDevice = useCallback(
		(position: DevicePosition) => {
			const allDevices = Object.values(connected);

			if (allDevices.length === 0) {
				Alert.alert('No Devices', 'No devices are connected.');
				return;
			}

			// Get available devices (not assigned to any position) and devices assigned to other positions
			const unassignedDevices = allDevices.filter((device) => !device.position);
			const assignedDevices = allDevices.filter((device) => device.position && device.position !== position);

			const allOptions = [
				...unassignedDevices.map((device) => ({
					device,
					label: `${device.name || 'StingRay'} (Unassigned)`,
					isUnassigned: true,
				})),
				...assignedDevices.map((device) => ({
					device,
					label: `${device.name || 'StingRay'} (${POSITION_LABELS[device.position!]})`,
					isUnassigned: false,
				})),
			];

			if (allOptions.length === 0) {
				Alert.alert('No Available Devices', 'All devices are already assigned to this position.');
				return;
			}

			if (allOptions.length === 1) {
				// Auto-assign the only available device
				const option = allOptions[0];
				if (!option.isUnassigned) {
					// Moving from another position - confirm swap
					Alert.alert('Move Device', `Move ${option.device.name || 'this device'} from ${POSITION_LABELS[option.device.position!]} to ${POSITION_LABELS[position]}?`, [
						{ text: 'Cancel', style: 'cancel' },
						{
							text: 'Move',
							onPress: () => assignDevicePosition(option.device.id, position, POSITION_COLORS[position]),
						},
					]);
				} else {
					assignDevicePosition(option.device.id, position, POSITION_COLORS[position]);
				}
			} else {
				// Show selection for multiple devices
				Alert.alert('Assign Device', `Select a device to assign to ${POSITION_LABELS[position]}:`, [
					...allOptions.map((option) => ({
						text: option.label,
						onPress: () => {
							if (!option.isUnassigned) {
								// Confirm move from another position
								Alert.alert('Move Device', `Move this device from ${POSITION_LABELS[option.device.position!]} to ${POSITION_LABELS[position]}?`, [
									{ text: 'Cancel', style: 'cancel' },
									{
										text: 'Move',
										onPress: () => assignDevicePosition(option.device.id, position, POSITION_COLORS[position]),
									},
								]);
							} else {
								assignDevicePosition(option.device.id, position, POSITION_COLORS[position]);
							}
						},
					})),
					{ text: 'Cancel', style: 'cancel' },
				]);
			}
		},
		[connected, assignDevicePosition],
	);

	return (
		<View style={[theme.viewStyles.panelContainer, { backgroundColor: theme.colors.white }]}>
			{/* Header */}
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, minHeight: 40 }}>
				{/* Settings icon left */}
				<View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
					<Settings size={LAYOUT_CONSTANTS.headerIconSize} color={theme.colors.primary} />
				</View>
				{/* Title center */}
				<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
					<Text style={[theme.textStyles.panelTitle, { marginBottom: 0, fontSize: theme.fontSizes.lg }]}>Device Manager</Text>
				</View>
				{/* Lock/Unlock icon right */}
				<View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
					{!isActive ? (
						<Unlock size={LAYOUT_CONSTANTS.headerIconSize} color={theme.colors.good} />
					) : (
						<Lock size={LAYOUT_CONSTANTS.headerIconSize} color={theme.colors.muted} />
					)}
				</View>
			</View>

			{/* Position Boxes - 2 on top row, 1 on bottom */}
			<View style={{ marginBottom: 16 }}>
				{/* Top Row - Left Foot and Right Foot */}
				<View style={[{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }]}>
					{(['leftFoot', 'rightFoot'] as DevicePosition[]).map((position) => {
						const device = devicesByPosition[position];
						const ledMode = device ? ledModes[device.id] || LEDControlMode.AMBER : LEDControlMode.AMBER;

						return (
							<View key={position} style={{ width: '49%' }}>
								<DeviceBox position={position} device={device || null} ledMode={ledMode} enabled={!isActive} onLEDModeChange={handleLEDModeChange} onRemoveDevice={handleRemoveDevice} onAssignDevice={handleAssignDevice} />
							</View>
						);
					})}
				</View>

				{/* Bottom Row - Racket (centered) 
				<View style={[{ flexDirection: 'row', justifyContent: 'center' }]}>
					{(() => {
						const position: DevicePosition = 'racket';
						const device = devicesByPosition[position];
						const ledMode = device ? (ledModes[device.id] || LEDControlMode.AMBER) : LEDControlMode.AMBER;

						return (
							// Same relative width as top row boxes
							<View style={{ width: '48%' }}>
								<DeviceBox
									key={position}
									position={position}
									device={device || null}
									ledMode={ledMode}
									enabled={enabled}
									onLEDModeChange={handleLEDModeChange}
									onRemoveDevice={handleRemoveDevice}
									onAssignDevice={handleAssignDevice}
								/>
							</View>
						);
					})()}
				</View> */}
			</View>
		</View>
	);
};
