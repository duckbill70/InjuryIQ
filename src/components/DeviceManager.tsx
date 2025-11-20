import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Alert, AppState, AppStateStatus, Text, Vibration } from 'react-native';

import { useBle, DevicePosition } from '../ble/BleProvider';
import { useTheme } from '../theme/ThemeContext';
import { useControl, ControlState, SensorLocation } from '../ble/useControl';
import { useBattery } from '../ble/useBattery';
import { useFatigue } from '../ble/useFatigue';
import { useStepCounter } from '../ble/useStepCounter';
import { useSession } from '../session/SessionProvider';
import BatteryIcon from './BatteryIcon';
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

// Sensor location colors from Control characteristic
const SENSOR_LOCATION_COLORS = {
	RED: '#FF0000', // Left foot
	GREEN: '#00FF00', // Right foot
	UNKNOWN: '#8E8E93', // Gray for unknown/unassigned
};

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
	enabled: boolean;
	onRemoveDevice: (deviceId: string) => void;
	onAssignDevice: (position: DevicePosition) => void;
}

const DeviceBox: React.FC<DeviceBoxProps> = ({ position, device, enabled, onRemoveDevice: _onRemoveDevice, onAssignDevice }) => {
	const { theme } = useTheme();
	const deviceId = device?.id || '';
	const longPressTriggeredRef = useRef(false);
	const attemptedAutoLocationRef = useRef<string | null>(null);

	// Device state, battery, and sensor location
	const [controlState, setControlState] = useState<ControlState | null>(null);
	const [sensorLocation, setSensorLocation] = useState<SensorLocation | null>(null);
	const [_batteryPct, setBatteryPct] = useState<number | null>(null);
	const [fifoFillPct, setFifoFillPct] = useState<number | null>(null);
	// fatigue level comes directly from useFatigue hook per device
	const [stepCount, setStepCount] = useState<number | null>(null);

	// Hooks for control state and sensor location
	const {
		subscribe: subCtl,
		unsubscribe: unsubCtl,
		readStatistics,
		readLocation,
		setLocationRed,
		setLocationGreen,
	} = useControl({
		deviceId,
		enabled: !!deviceId,
		onStateUpdate: (s) => setControlState(s),
		onLocationUpdate: (loc) => setSensorLocation(loc),
		onStatisticsUpdate: (stats) => {
			if (stats.bufferCapacity > 0) {
				setFifoFillPct((stats.samplesStored / stats.bufferCapacity) * 100);
			} else {
				setFifoFillPct(null);
			}
		},
	});

	useEffect(() => {
		let cancelled = false;
		if (!deviceId) {
			setControlState(null);
			setSensorLocation(null);
			attemptedAutoLocationRef.current = null;
			return;
		}
		(async () => {
			const stats = await readStatistics();
			if (!cancelled && stats) {
				setControlState(stats.isRecording ? ControlState.RUNNING : ControlState.STOPPED);
				if (stats.bufferCapacity > 0) {
					setFifoFillPct((stats.samplesStored / stats.bufferCapacity) * 100);
				}
			}
			const loc = await readLocation();
			if (!cancelled && loc !== null) {
				setSensorLocation(loc);
			}
		})();
		subCtl();
		return () => {
			cancelled = true;
			unsubCtl();
		};
	}, [deviceId, readStatistics, readLocation, subCtl, unsubCtl]);

	// Auto-correct UNKNOWN location when assigned to a foot slot
	useEffect(() => {
		if (!deviceId || !enabled) return;
		if (sensorLocation !== null && sensorLocation !== SensorLocation.UNKNOWN) return;
		if (attemptedAutoLocationRef.current === deviceId) return;
		attemptedAutoLocationRef.current = deviceId;
		(async () => {
			const ok = position === 'leftFoot' ? await setLocationRed() : await setLocationGreen();
			if (ok) {
				setSensorLocation(position === 'leftFoot' ? SensorLocation.RED : SensorLocation.GREEN);
				// best-effort sync
				readLocation().then((loc) => {
					if (loc !== null) setSensorLocation(loc);
				}).catch(() => {});
			}
		})();
	}, [deviceId, enabled, position, sensorLocation, readLocation, setLocationRed, setLocationGreen]);

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
	}, [deviceId, readBatteryLevel, subBatt, unsubBatt]);

	// Fatigue level via Fatigue Service (read value directly from hook)
	const { level: fatigueLevel } = useFatigue({
		deviceId,
		enabled: !!deviceId,
	});

	// Step counter via Step Service
	useStepCounter({
		deviceId,
		enabled: !!deviceId,
		onStepCountUpdate: (count) => setStepCount(count),
	});

	// Reset steps when device changes (fatigueLevel comes from hook)
	useEffect(() => {
		if (!deviceId) {
			setStepCount(null);
		}
	}, [deviceId]);

	// Corner icon placement depending on foot side
	const isLeftSide = position === 'leftFoot';
	// Use a stacked overlay container to stabilize positions and prevent micro-jumps
	// Position it outside the pressable to avoid being affected by FootIcon transforms
	const overlayStackStyle = isLeftSide
		? { position: 'absolute' as const, left: 0, bottom: 8, flexDirection: 'column' as const, alignItems: 'center' as const }
		: { position: 'absolute' as const, right: 0, bottom: 8, flexDirection: 'column' as const, alignItems: 'center' as const };

	return (
		<View style={{ flexDirection: 'column', alignItems: 'center' }}>
			{/* Device */}
			<View style={{ height: LAYOUT_CONSTANTS.deviceBoxHeight, width: '100%', position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
				{device ? (
					<>
						{/* Watermark (pressable to remove device on long press) */}
						<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }} pointerEvents='box-none'>
							<Pressable
								accessibilityRole='button'
								accessibilityLabel={`Long press to remove ${position === 'leftFoot' ? 'left' : 'right'} device`}
										onPress={async () => {
											if (longPressTriggeredRef.current) {
												longPressTriggeredRef.current = false;
												return;
											}
											if (!enabled || !deviceId) return;
											const ok = position === 'leftFoot' ? await setLocationRed() : await setLocationGreen();
											if (ok) {
												Vibration.vibrate(10);
 												// Optimistically update UI, then refresh from device
 												setSensorLocation(position === 'leftFoot' ? SensorLocation.RED : SensorLocation.GREEN);
 												// Fire and forget to sync from firmware characteristic
 												readLocation().then((loc) => {
 													if (loc !== null) setSensorLocation(loc);
 												}).catch(() => {});
											} else {
												Alert.alert('Location Update Failed', 'Unable to set device color.');
											}
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
									pressed && enabled && device && { transform: [{ scale: 0.97 }] },
								]}
							>
								<FootIcon
									size={LAYOUT_CONSTANTS.watermarkSize}
									side={position === 'leftFoot' ? 'left' : 'right'}
									color={sensorLocation === SensorLocation.RED ? SENSOR_LOCATION_COLORS.RED : sensorLocation === SensorLocation.GREEN ? SENSOR_LOCATION_COLORS.GREEN : SENSOR_LOCATION_COLORS.UNKNOWN}
								/>
							</Pressable>

							{/* Stacked overlay: state (top), battery (bottom) - positioned outside Pressable */}
							<View style={overlayStackStyle} pointerEvents='none'>
								<ControlStateIcon state={controlState} style={{ marginBottom: 4 }} />
								<BatteryIcon level={_batteryPct} vertical style={{ marginBottom: 2 }} />
								{fifoFillPct !== null && (
									<Text style={{
										color: 'white',
										fontSize: 10,
										fontWeight: '600',
										textShadowColor: 'rgba(0,0,0,0.6)',
										textShadowOffset: { width: 0, height: 1 },
										textShadowRadius: 2,
									}}>{`${fifoFillPct.toFixed(0)}%`}</Text>
								)}
							</View>
						</View>
					</>
				) : (
					// Empty slot - show assign button
					<>
						<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }} pointerEvents='box-none'>
							<Pressable
								style={({ pressed }) => [{ borderRadius: 8 }, !enabled ? { opacity: 0.5 } : { opacity: pressed ? 0.85 : 1 }, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
								onPress={() => enabled && onAssignDevice(position)}
								disabled={!enabled}
							>
								<FootIcon size={LAYOUT_CONSTANTS.watermarkSize} side={position === 'leftFoot' ? 'left' : 'right'} color={theme.colors.white} />
							</Pressable>
						</View>
						{/* Placeholder stacked overlay mirrors the device-present layout */}
						<View style={overlayStackStyle} pointerEvents='none'>
							<ControlStateIcon state={null} style={{ marginBottom: 4 }} />
							<BatteryIcon level={null} vertical style={{ marginBottom: 2 }} />
							<Text style={{ color: 'white', fontSize: 10, fontWeight: '600', opacity: 0.3 }}>-</Text>
						</View>
					</>
				)}
			</View>

			{/* Fatigue Display - below device box */}
			{device ? (
				<View style={{ alignItems: 'center', marginTop: 30 }}>
					<Text
						style={{
							color: fatigueLevel !== null && fatigueLevel >= 80 ? '#FF0000' : fatigueLevel !== null && fatigueLevel >= 60 ? '#FFBA00' : fatigueLevel !== null ? '#00FF00' : theme.colors.muted,
							fontSize: 50,
							fontWeight: '700',
							textShadowColor: 'rgba(0, 0, 0, 0.75)',
							textShadowOffset: { width: 0, height: 1 },
							textShadowRadius: 3,
						}}
					>
						{fatigueLevel !== null ? `${fatigueLevel}` : ''}
					</Text>
					<Text
						style={{
							color: theme.colors.white,
							fontSize: 10,
							fontWeight: '600',
							opacity: 0.7,
							marginTop: 2,
						}}
					>
						Fatigue
					</Text>
					{/* Steps Display */}
					<Text
						style={{
							color: theme.colors.white,
							fontSize: 40,
							fontWeight: '700',
							textShadowColor: 'rgba(0, 0, 0, 0.75)',
							textShadowOffset: { width: 0, height: 1 },
							textShadowRadius: 3,
							marginTop: 8,
						}}
					>
						{stepCount !== null ? stepCount.toLocaleString() : ''}
					</Text>
					<Text
						style={{
							color: theme.colors.white,
							fontSize: 10,
							fontWeight: '600',
							opacity: 0.7,
							marginTop: 2,
						}}
					>
						Steps
					</Text>
				</View>
			) : (
				<View style={{ alignItems: 'center', marginTop: 30 }}>
					<Text
						style={{
							color: theme.colors.muted,
							fontSize: 50,
							fontWeight: '700',
							textShadowColor: 'rgba(0, 0, 0, 0.75)',
							textShadowOffset: { width: 0, height: 1 },
							textShadowRadius: 3,
						}}
					>
						0
					</Text>
					<Text
						style={{
							color: theme.colors.white,
							fontSize: 10,
							fontWeight: '600',
							opacity: 0.7,
							marginTop: 2,
						}}
					>
						Fatigue
					</Text>
					{/* Steps Placeholder */}
					<Text
						style={{
							color: theme.colors.muted,
							fontSize: 40,
							fontWeight: '700',
							textShadowColor: 'rgba(0, 0, 0, 0.75)',
							textShadowOffset: { width: 0, height: 1 },
							textShadowRadius: 3,
							marginTop: 8,
						}}
					>
						0
					</Text>
					<Text
						style={{
							color: theme.colors.white,
							fontSize: 10,
							fontWeight: '600',
							opacity: 0.7,
							marginTop: 2,
						}}
					>
						Steps
					</Text>
				</View>
			)}
		</View>
	);
};

export const DeviceManager: React.FC<DeviceManagerProps> = () => {
	const { connected, devicesByPosition, assignDevicePosition, unassignDevicePosition, scanning, startScan, stopScan, isPoweredOn } = useBle();
	const { theme } = useTheme();

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
					Alert.alert('Bluetooth Required', 'Please enable Bluetooth to scan for devices.', [{ text: 'OK', style: 'default' }]);
				}
				// If Bluetooth is now on, scanning will continue automatically
			}
		});

		return () => {
			subscription.remove();
		};
	}, [isPoweredOn, stopScan]);

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
			await assignDevicePosition(left.id, 'rightFoot');
			await assignDevicePosition(right.id, 'leftFoot');
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
			Alert.alert('Bluetooth Required', 'Bluetooth is currently disabled. Please enable Bluetooth in Settings to scan for devices.', [{ text: 'OK', style: 'default' }]);
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
							onPress: () => assignDevicePosition(option.device.id, position),
						},
					]);
				} else {
					assignDevicePosition(option.device.id, position);
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
										onPress: () => assignDevicePosition(option.device.id, position),
									},
								]);
							} else {
								assignDevicePosition(option.device.id, position);
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
		<View>
			<View style={{ marginBottom: 12 }}>
				{/* Top Row - Left/Swap/Right */}
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
					{/* Left */}
					<View style={{ flex: 1 }}>
						{(() => {
							const position: DevicePosition = 'leftFoot';
							const device = devicesByPosition[position];
							return <DeviceBox position={position} device={device || null} enabled={!isActive} onRemoveDevice={handleRemoveDevice} onAssignDevice={handleAssignDevice} />;
						})()}
					</View>

				{/* Swap/Scan Button - Shows Scan when fewer than 2 devices, Swap when 2 devices present */}
				<View style={{ width: 64, alignItems: 'center', justifyContent: 'flex-start', marginHorizontal: 8, marginTop: -100 }}>
					{(() => {
						const left = devicesByPosition.leftFoot;
						const right = devicesByPosition.rightFoot;
						const hasLeftAndRight = !!left && !!right;							if (hasLeftAndRight) {
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
							return <DeviceBox position={position} device={device || null} enabled={!isActive} onRemoveDevice={handleRemoveDevice} onAssignDevice={handleAssignDevice} />;
						})()}
					</View>
				</View>
			</View>
		</View>
	);
};
