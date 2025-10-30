import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Alert, AppState, AppStateStatus } from 'react-native';

import { useBle, DevicePosition } from '../ble/BleProvider';
import { LEDControlMode } from '../ble/useLEDControl';
import { useTheme } from '../theme/ThemeContext';
import { useControl, ControlState } from '../ble/useControl';
import { useBattery } from '../ble/useBattery';
import { useStatistics } from '../ble/useStatistics';
// import { PowerStateButton } from './PowerStateCycler';
import { useSession } from '../session/SessionProvider';
import BatteryIcon from './BatteryIcon';
import FifoFillBadge from './FifoFillBadge';
import ControlStateIcon from './ControlStateIcon';

import { ArrowLeftRight, Bluetooth } from 'lucide-react-native';
import FootIcon from './FootIcon';

interface DeviceManagerProps {
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

// Shared button styles - matching PowerStateCycler component (not used now; kept for future controls)
// const CONTROL_BUTTON_STYLES = {
// 	size: 44,
// 	borderRadius: 6,
// 	borderWidth: 2,
// 	iconSize: 24,
// 	disabledOpacity: 0.4,
// 	pressedOpacity: 0.7,
// 	pressedScale: 0.95,
// };

// Shared layout constants
const LAYOUT_CONSTANTS = {
	deviceBoxHeight: 150,
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

const DeviceBox: React.FC<DeviceBoxProps> = ({ position, device, ledMode, enabled, onLEDModeChange, onRemoveDevice: _onRemoveDevice, onAssignDevice }) => {
	const { theme } = useTheme();
	const deviceId = device?.id || '';
	const longPressTriggeredRef = useRef(false);

	// Device state/battery/FIFO fill
	const [controlState, setControlState] = useState<ControlState | null>(null);
	const [_batteryPct, setBatteryPct] = useState<number | null>(null);
	const [_fillPct, setFillPct] = useState<number | null>(null);

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
	// const canChangePosition = !!device && enabled && controlState === ControlState.STOP;

	const handleLEDStep = () => {
		if (device && canChangeLED) {
			const nextMode = getNextLEDMode(ledMode);
			onLEDModeChange(device.id, nextMode);
		}
	};

	const currentLEDOption = LED_MODE_OPTIONS.find((opt) => opt.value === ledMode);

	// Corner icon placement depending on foot side
	const isLeftSide = position === 'leftFoot';
	// Use a stacked overlay container to stabilize positions and prevent micro-jumps
	// Position it outside the pressable to avoid being affected by FootIcon transforms
	const overlayStackStyle = isLeftSide
		? { position: 'absolute' as const, left: 0, bottom: 8, flexDirection: 'column' as const }
		: { position: 'absolute' as const, right: 0, bottom: 8, flexDirection: 'column' as const, alignItems: 'flex-end' as const };

	// Shared button base style (no longer used after removing separate control button)
	// const controlButtonBaseStyle = {
	// 	width: CONTROL_BUTTON_STYLES.size,
	// 	height: CONTROL_BUTTON_STYLES.size,
	// 	borderRadius: CONTROL_BUTTON_STYLES.borderRadius,
	// 	alignItems: 'center' as const,
	// 	justifyContent: 'center' as const,
	// 	borderWidth: CONTROL_BUTTON_STYLES.borderWidth,
	// 	borderColor: theme.colors.white,
	// };

	return (
		<View style={{ flexDirection: 'column' }}>

			{/* Device */}
			<View style={{ height: LAYOUT_CONSTANTS.deviceBoxHeight, width: '100%', position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
				{device ? (
					<>
						{/* Watermark (pressable to cycle color/LED mode) */}
						<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }} pointerEvents="box-none">
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={`Toggle ${position === 'leftFoot' ? 'left' : 'right'} device color`}
								onPress={() => {
									if (longPressTriggeredRef.current) {
										longPressTriggeredRef.current = false;
										return;
									}
									handleLEDStep();
								}}
								onLongPress={() => {
									if (!enabled || !deviceId) return;
									longPressTriggeredRef.current = true;
									_onRemoveDevice(deviceId);
								}}
								delayLongPress={450}
								hitSlop={8}
								pressRetentionOffset={{ top: 8, left: 8, right: 8, bottom: 8 }}
								disabled={!enabled || !device}
								style={({ pressed }) => [
									// No base opacity when a device is present; keep fully opaque
									(!enabled || !device) && { opacity: 0.4 },
									pressed && canChangeLED && enabled && device && { transform: [{ scale: 0.97 }] },
								]}
							>
								<FootIcon 
									size={LAYOUT_CONSTANTS.watermarkSize} 
									side={position === 'leftFoot' ? 'left' : 'right'} 
									color={currentLEDOption?.color} 
								/>
							</Pressable>
						</View>
						{/* Stacked overlay: state (top), battery (middle), FIFO (bottom) - positioned outside Pressable */}
						<View style={overlayStackStyle} pointerEvents="none">
							<ControlStateIcon state={controlState} style={{ marginBottom: 6 }} />
							<BatteryIcon level={_batteryPct} style={{ marginBottom: 6 }} />
							<FifoFillBadge value={_fillPct} fontSize={12} />
						</View>

						{/* Control Buttons removed – foot watermark is now the color toggle */}
					</>
				) : (
					// Empty slot - show assign button
					<>
						<Pressable
							style={({ pressed }) => [
								{ borderRadius: 8 }, 
								!enabled ? { opacity: 0.5 } : { opacity: pressed ? 0.85 : 1 }, 
								{ transform: [{ scale: pressed ? 0.98 : 1 }] }
							]}
							onPress={() => enabled && onAssignDevice(position)}
							disabled={!enabled}
						>
							<FootIcon size={LAYOUT_CONSTANTS.watermarkSize} side={position === 'leftFoot' ? 'left' : 'right'} color={theme.colors.white} />
						</Pressable>
						{/* Placeholder stacked overlay mirrors the device-present layout */}
						<View style={overlayStackStyle} pointerEvents="none">
							<ControlStateIcon state={null} style={{ marginBottom: 6 }} />
							<BatteryIcon level={null} style={{ marginBottom: 6 }} />
							<FifoFillBadge value={null} fontSize={12} />
						</View>
					</>
				)}
			</View>
		</View>
	);
};

export const DeviceManager: React.FC<DeviceManagerProps> = () => {
	const { connected, devicesByPosition, assignDevicePosition, unassignDevicePosition, scanning, startScan, stopScan, isPoweredOn } = useBle();
	const { theme } = useTheme();

	// LED control states for each device
	const [ledModes, setLedModes] = useState<Record<string, LEDControlMode>>({});

	const { isActive } = useSession();

	// Track if we're currently scanning (for foreground re-check)
	const isScanningRef = useRef(false);

	// Update scanning ref when scanning state changes
	useEffect(() => {
		isScanningRef.current = scanning;
	}, [scanning]);

	/**
	 * Handle app state changes - re-check Bluetooth when returning to foreground during scan
	 * 
	 * This is important for the workflow where:
	 * 1. User tries to scan but Bluetooth is off
	 * 2. Alert prompts them to enable Bluetooth in Settings
	 * 3. User switches to Settings app to enable Bluetooth
	 * 4. When they return to the app, we re-check and either:
	 *    - Continue the scan if Bluetooth is now on
	 *    - Alert them again if Bluetooth is still off
	 */
	useEffect(() => {
		const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
			if (nextAppState === 'active' && isScanningRef.current) {
				// App returned to foreground while scanning
				// Re-check Bluetooth state in case user went to Settings to enable it
				if (!isPoweredOn) {
					// Bluetooth is still off, stop scan and alert user
					stopScan();
					Alert.alert(
						'Bluetooth Required',
						'Please enable Bluetooth to scan for devices.',
						[
							{ text: 'OK', style: 'default' },
						]
					);
				}
				// If Bluetooth is now on, scanning will continue automatically
			}
		});

		return () => {
			subscription.remove();
		};
	}, [isPoweredOn, stopScan]);

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

	// Swap state: prevent re-press until devices reach their new slots
	const [isSwapping, setIsSwapping] = useState(false);
	const [pendingSwap, setPendingSwap] = useState<{ leftId: string; rightId: string } | null>(null);

	// Swap devices between left and right positions, preserving existing device colors
	const handleSwapPositions = useCallback(async () => {
		if (isSwapping) return;
		const left = devicesByPosition.leftFoot;
		const right = devicesByPosition.rightFoot;
		if (!left || !right) return;
		try {
			setIsSwapping(true);
			setPendingSwap({ leftId: left.id, rightId: right.id });
			await assignDevicePosition(left.id, 'rightFoot', left.color || POSITION_COLORS.rightFoot);
			await assignDevicePosition(right.id, 'leftFoot', right.color || POSITION_COLORS.leftFoot);
		} catch (e) {
			setIsSwapping(false);
			setPendingSwap(null);
			Alert.alert('Swap Failed', 'Unable to swap device positions.');
		}
	}, [devicesByPosition.leftFoot, devicesByPosition.rightFoot, assignDevicePosition, isSwapping]);

	/**
	 * Handle scan button press
	 * - Check if Bluetooth is enabled
	 * - If not, alert user to enable it in Settings
	 * - If enabled, start scanning for devices
	 */
	const handleStartScan = useCallback(async () => {
		if (scanning) {
			// Already scanning, stop it
			stopScan();
			return;
		}

		if (!isPoweredOn) {
			// Bluetooth is off - prompt user to enable it
			Alert.alert(
				'Bluetooth Required',
				'Bluetooth is currently disabled. Please enable Bluetooth in Settings to scan for devices.',
				[
					{ text: 'OK', style: 'default' },
				]
			);
			return;
		}

		// Start scanning
		try {
			await startScan({ timeoutMs: 15000, maxDevices: 3 });
		} catch (error) {
			Alert.alert('Scan Failed', `Unable to start scan: ${error}`);
		}
	}, [scanning, isPoweredOn, startScan, stopScan]);

	// Watch devicesByPosition to detect when swap completes; then re-enable the button
	useEffect(() => {
		if (!pendingSwap) return;
		const leftNow = devicesByPosition.leftFoot;
		const rightNow = devicesByPosition.rightFoot;
		if (leftNow?.id === pendingSwap.rightId && rightNow?.id === pendingSwap.leftId) {
			setIsSwapping(false);
			setPendingSwap(null);
		}
	}, [devicesByPosition.leftFoot, devicesByPosition.rightFoot, pendingSwap]);

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
					Alert.alert(
						'Move Device',
						`Move ${option.device.name || 'this device'} from ${POSITION_LABELS[option.device.position!]} to ${POSITION_LABELS[position]}?`,
						[
							{ text: 'Cancel', style: 'cancel' },
							{
								text: 'Move',
								onPress: () => assignDevicePosition(option.device.id, position, POSITION_COLORS[position]),
							},
						]
					);
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
								Alert.alert(
									'Move Device',
									`Move this device from ${POSITION_LABELS[option.device.position!]} to ${POSITION_LABELS[position]}?`,
									[
										{ text: 'Cancel', style: 'cancel' },
										{
											text: 'Move',
											onPress: () => assignDevicePosition(option.device.id, position, POSITION_COLORS[position]),
										},
									]
								);
							} else {
								assignDevicePosition(option.device.id, position, POSITION_COLORS[position]);
							}
						},
					})),
					{ text: 'Cancel', style: 'cancel' },
				]);
			}
		},
		[connected, assignDevicePosition]
	);

	return (
		<View>
			<View style={{ marginBottom: 12 }}>
				{/* Top Row - Left/Swap/Right */}
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
					{/* Left */}
					<View style={{ flex: 1 }}>
						{(() => {
							const position: DevicePosition = 'leftFoot';
							const device = devicesByPosition[position];
							const ledMode = device ? (ledModes[device.id] || LEDControlMode.AMBER) : LEDControlMode.AMBER;
							return (
								<DeviceBox 
									position={position}
									device={device || null}
									ledMode={ledMode}
									enabled={!isActive}
									onLEDModeChange={handleLEDModeChange}
									onRemoveDevice={handleRemoveDevice}
									onAssignDevice={handleAssignDevice}
								/>
							);
						})()}
					</View>

					{/* Swap/Scan Button - Shows Scan when fewer than 2 devices, Swap when 2 devices present */}
					<View style={{ width: 64, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }}>
						{(() => {
							const left = devicesByPosition.leftFoot;
							const right = devicesByPosition.rightFoot;
							const hasLeftAndRight = !!left && !!right;
							
							if (hasLeftAndRight) {
								// Show swap button when both devices are present
								const swapDisabled = isActive || isSwapping;
								return (
									<Pressable
										onPress={handleSwapPositions}
										disabled={swapDisabled}
										style={({ pressed }) => [
											{
												width: 60,
												height: 60,
												borderRadius: 30,
												alignItems: 'center',
												justifyContent: 'center',
												borderWidth: 2,
												borderColor: theme.colors.white,
												backgroundColor: theme.colors.primary,
												shadowColor: theme.colors.primary,
												shadowOffset: { width: 0, height: 3 },
												shadowOpacity: 0.4,
												shadowRadius: 4,
												elevation: 4,
											},
											swapDisabled && { opacity: 0.4 },
											pressed && !swapDisabled && { opacity: 0.7, transform: [{ scale: 0.95 }], shadowOpacity: 0.2 },
										]}
									>
										<ArrowLeftRight color={theme.colors.white} size={32} />
									</Pressable>
								);
							} else {
								// Show scan button when fewer than 2 devices
								const scanDisabled = isActive;
								return (
									<Pressable
										onPress={handleStartScan}
										disabled={scanDisabled}
										style={({ pressed }) => [
											{
												width: 60,
												height: 60,
												borderRadius: 30,
												alignItems: 'center',
												justifyContent: 'center',
												borderWidth: 2,
												borderColor: theme.colors.white,
												backgroundColor: scanning ? theme.colors.warn : theme.colors.primary,
												shadowColor: scanning ? theme.colors.warn : theme.colors.primary,
												shadowOffset: { width: 0, height: 3 },
												shadowOpacity: 0.4,
												shadowRadius: 4,
												elevation: 4,
											},
											scanDisabled && { opacity: 0.4 },
											pressed && !scanDisabled && { opacity: 0.7, transform: [{ scale: 0.95 }], shadowOpacity: 0.2 },
											scanning && { 
												shadowOpacity: 0.6,
												transform: [{ scale: pressed ? 0.95 : 1 }],
											},
										]}
									>
										<Bluetooth color={theme.colors.white} size={32} />
									</Pressable>
								);
							}
						})()}
					</View>

					{/* Right */}
					<View style={{ flex: 1 }}>
						{(() => {
							const position: DevicePosition = 'rightFoot';
							const device = devicesByPosition[position];
							const ledMode = device ? (ledModes[device.id] || LEDControlMode.AMBER) : LEDControlMode.AMBER;
							return (
								<DeviceBox 
									position={position}
									device={device || null}
									ledMode={ledMode}
									enabled={!isActive}
									onLEDModeChange={handleLEDModeChange}
									onRemoveDevice={handleRemoveDevice}
									onAssignDevice={handleAssignDevice}
								/>
							);
						})()}
					</View>
				</View>
			</View>
		</View>
	);
};
