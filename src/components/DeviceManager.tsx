import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Alert, AppState, AppStateStatus, Text, Button } from 'react-native';

import { useBle, DevicePosition } from '../ble/BleProvider';
import { useTheme } from '../theme/ThemeContext';
import { useSession } from '../session/SessionProvider';
import { useControl, ControlState, SensorLocation } from '../ble/useControl';
import { useBattery } from '../ble/useBattery';
import FootIcon from './FootIcon';
import BatteryIcon from './BatteryIcon';
import ControlStateIcon from './ControlStateIcon';

import { ArrowLeftRight, Bluetooth, MapPin, RotateCcw } from 'lucide-react-native';

interface DeviceManagerProps {
	enabled?: boolean; // Flag to enable/disable settings (for session state)
}

const POSITION_LABELS = {
	leftFoot: 'Left Foot',
	rightFoot: 'Right Foot',
};

// All DeviceBox logic and JSX must be inside the DeviceBoxComponent function, not at the top level.

// TEMP: Define DeviceBoxState as any to unblock errors (replace with real type as needed)
type DeviceBoxState = any;

// Define the props for DeviceBoxComponent
interface DeviceBoxComponentProps {
	position: DevicePosition;
	device: any; // Replace 'any' with the actual device type if available
	enabled: boolean;
	onRemoveDevice: (deviceId: string) => void;
	onAssignDevice: (position: DevicePosition) => void;
	showLocationRef: React.RefObject<() => Promise<boolean>>;
	stateRef: React.RefObject<DeviceBoxState>;
	onMetricsUpdate: React.Dispatch<React.SetStateAction<DeviceBoxState | null>>;
}

const DeviceBoxComponent: React.FC<DeviceBoxComponentProps> = ({ position, device, enabled, onRemoveDevice, onAssignDevice, showLocationRef: _showLocationRef, stateRef: _stateRef, onMetricsUpdate: _onMetricsUpdate }) => {
	const isConnected = !!device;
	const { theme } = useTheme();

	// BLE state tracking
	const [batteryLevel, setBatteryLevel] = useState<number>(0);
	const [controlState, setControlState] = useState<ControlState>(ControlState.STOPPED);
	const [fifoPct, setFifoPct] = useState<number | null>(null);
	const [location, setLocation] = useState<SensorLocation>(SensorLocation.UNKNOWN);
	const [snapshotStatus, setSnapshotStatus] = useState<{ slots: boolean[] } | null>(null);

	// Use BLE hooks (only when device is connected)
	useBattery({
		deviceId: device?.id ?? '',
		onBatteryUpdate: setBatteryLevel,
		enabled: isConnected,
	});

	const controlHook = useControl({
		deviceId: device?.id ?? '',
		onStateUpdate: setControlState,
		onStatisticsUpdate: (stats) => {
			if (stats) {
				const pct = Math.round((stats.samplesStored / stats.bufferCapacity) * 100);
				setFifoPct(pct);
			}
		},
		onSnapshotStatusUpdate: setSnapshotStatus,
	});

	// Subscribe to location updates from controlHook
	useEffect(() => {
		if (controlHook?.location !== null && controlHook?.location !== undefined) {
			setLocation(controlHook.location);
		}
	}, [controlHook?.location]);

	// Update FIFO from controlHook if available
	useEffect(() => {
		if (controlHook?.fifoPct !== null && controlHook?.fifoPct !== undefined) {
			setFifoPct(controlHook.fifoPct);
		}
	}, [controlHook?.fifoPct]);

	// Determine FIFO fill color based on percentage
	const getFifoColor = (fifo: number | null) => {
		if (fifo === null || fifo === 0) return 'black';
		if (fifo === 100) return 'green';
		return 'amber';
	};

	// Determine FootIcon color based on device BLE location or connection status
	const getFootColor = () => {
		if (!isConnected) return 'gray';
		// Use BLE device location if available
		if (location === SensorLocation.RED) return theme.colors.danger; //'#FF6B6B'; // Red
		if (location === SensorLocation.GREEN) return theme.colors.deepGreen; //; // Teal/Green
		// Default to green if connected but location unknown
		return 'green';
	};

	return (
		// Device Bounding Box
		<View style={{ flexDirection: 'column', alignItems: 'stretch' }}>
			{/* Device Title */}
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
				<Text style={{ marginVertical: 15, color: 'white' }}>{isConnected ? device?.name || 'Unknown Device' : 'Not Connected'}</Text>
			</View>

			{/* Device Foot Icon */}
			<View style={{ flexDirection: position === 'leftFoot' ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
				<Pressable onPress={() => (isConnected ? onRemoveDevice(device.id) : onAssignDevice(position))} disabled={!enabled}>
					<FootIcon color={getFootColor()} size={150} side={position === 'leftFoot' ? 'left' : 'right'} />
				</Pressable>
			</View>

			{/* Device Icons */}
			<View style={{ marginVertical: 15, alignItems: 'center', justifyContent: 'space-between', flexDirection: 'row' }}>
				<BatteryIcon level={batteryLevel} color={isConnected ? theme.colors.white : theme.colors.muted} style={{ marginLeft: 5 }} />
				<ControlStateIcon state={controlState} color={isConnected ? theme.colors.white : theme.colors.muted} />
				<View
					style={{
						width: 24,
						height: 24,
						borderRadius: 12,
						borderWidth: 1.5,
						borderColor: isConnected ? theme.colors.white : theme.colors.muted,
						backgroundColor: isConnected ? getFifoColor(fifoPct) : theme.colors.black,
						justifyContent: 'center',
						alignItems: 'center',
					}}
				/>
				{/* Snapshot Status - Three vertical bars (slot 0, 1, 2) */}
				<View style={{ flexDirection: 'row', gap: 3 }}>
					{[0, 1, 2].map((slotIdx) => {
						const isSlotFull = snapshotStatus?.slots[slotIdx] ?? false;
						return (
							<View
								key={slotIdx}
								style={{
									width: 4,
									height: 16,
									borderRadius: 2,
									backgroundColor: isConnected ? (isSlotFull ? theme.colors.white : theme.colors.muted) : theme.colors.muted,
								}}
							/>
						);
					})}
				</View>
			</View>

			{/* enabled && <Button title={isConnected ? 'Remove' : 'Assign'} onPress={() => (isConnected ? onRemoveDevice(device.id) : onAssignDevice(position))} /> */}
		</View>
	);
};

// Memoize DeviceBox to prevent re-renders when props haven't changed
const DeviceBox = React.memo(DeviceBoxComponent, (prevProps, nextProps) => {
	// Re-render only if these key props change
	return (
		prevProps.position === nextProps.position &&
		prevProps.device?.id === nextProps.device?.id &&
		prevProps.enabled === nextProps.enabled &&
		prevProps.device?.name === nextProps.device?.name &&
		prevProps.device?.position === nextProps.device?.position
		// Refs and callbacks are stable, no need to compare
	);
});

DeviceBox.displayName = 'DeviceBox';

const DeviceManagerComponent: React.FC<DeviceManagerProps> = () => {
	const { connected, devicesByPosition, assignDevicePosition, unassignDevicePosition, scanning, startScan, stopScan, isPoweredOn, getConnectedDevices } = useBle();
	const { theme } = useTheme();

	const { isActive } = useSession();

	const connectedDevices = Object.values(connected);
	const connectedCount = connectedDevices.length;
	const allConnectedAssigned = connectedCount > 0 && connectedDevices.every((d) => !!d.position);
	const badgeColor = allConnectedAssigned ? theme.colors.deepGreen : theme.colors.danger;

	// Refs to store showLocation functions from each DeviceBox
	const leftShowLocationRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
	const rightShowLocationRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
	// Refs to store state from each DeviceBox
	const leftStateRef = useRef<DeviceBoxState | null>(null);
	const rightStateRef = useRef<DeviceBoxState | null>(null);
	const [_leftMetrics, setLeftMetrics] = useState<DeviceBoxState | null>(null);
	const [_rightMetrics, setRightMetrics] = useState<DeviceBoxState | null>(null);

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
			Alert.alert('Scan Failed', `Unable to start scan: ${error}`, [
				{ text: 'Retry', onPress: () => startScan({ timeoutMs: 15000, maxDevices: 3 }) },
				{ text: 'Cancel', style: 'cancel' },
			]);
			console.error('Scan error:', error);
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
			// Use getConnectedDevices() to bypass React state batching and get immediate values
			const allDevices = Object.values(getConnectedDevices());

			console.log('[DeviceManager] handleAssignDevice called for position:', position);
			console.log(
				'[DeviceManager] All devices:',
				allDevices.map((d) => ({ id: d.id.slice(-6), name: d.name, position: d.position })),
			);

			if (allDevices.length === 0) {
				Alert.alert('No Devices', 'No devices are connected.');
				return;
			}

			// Get available devices (not assigned to any position or assigned to a different position)
			const unassignedDevices = allDevices.filter((device) => !device.position);
			const assignedDevices = allDevices.filter((device) => device.position && device.position !== position);

			console.log(
				'[DeviceManager] Unassigned devices:',
				unassignedDevices.map((d) => d.id.slice(-6)),
			);
			console.log(
				'[DeviceManager] Assigned to other positions:',
				assignedDevices.map((d) => ({ id: d.id.slice(-6), pos: d.position })),
			);

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
		[getConnectedDevices, assignDevicePosition],
	);
	return (
		// Top Row - Left/Swap/Right
		<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' }}>
			{/* Left */}
			<View style={{ flex: 1 }}>
				{(() => {
					const position: DevicePosition = 'leftFoot';
					const device = devicesByPosition[position];
					return (
						<DeviceBox
							position={position}
							device={device || null}
							enabled={!isActive}
							onRemoveDevice={handleRemoveDevice}
							onAssignDevice={handleAssignDevice}
							showLocationRef={leftShowLocationRef}
							stateRef={leftStateRef}
							onMetricsUpdate={setLeftMetrics}
						/>
					);
				})()}
			</View>
			{/* Swap/Scan Button - Shows Scan when fewer than 2 devices, Swap when 2 devices present */}
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-evenly', gap: 12 }}>
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
									swapDisabled ? { opacity: 0.4 } : undefined,
									pressed && !swapDisabled ? { opacity: 0.7, transform: [{ scale: 0.95 }], shadowOpacity: 0.2 } : undefined,
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
									scanDisabled ? { opacity: 0.4 } : undefined,
									pressed && !scanDisabled ? { opacity: 0.7, transform: [{ scale: 0.95 }], shadowOpacity: 0.2 } : undefined,
									scanning && {
										shadowOpacity: 0.6,
										transform: [{ scale: pressed ? 0.95 : 1 }],
									},
								]}
							>
								<Bluetooth color={theme.colors.white} size={32} />
								{connectedCount > 0 && (
									<View
										style={{
											position: 'absolute',
											top: -6,
											right: -6,
											minWidth: 20,
											height: 20,
											borderRadius: 10,
											paddingHorizontal: 4,
											backgroundColor: badgeColor,
											borderWidth: 1,
											borderColor: theme.colors.white,
											justifyContent: 'center',
											alignItems: 'center',
										}}
									>
										<Text style={{ color: theme.colors.white, fontSize: 12, fontWeight: '700' }}>{connectedCount}</Text>
									</View>
								)}
							</Pressable>
						);
					}
				})()}

				{/* Show Location Button - always visible, triggers location color display on devices */}
				{(() => {
					const left = devicesByPosition.leftFoot;
					const right = devicesByPosition.rightFoot;
					const hasDevices = !!left || !!right;
					const locationDisabled = !hasDevices || isActive;

					const handleShowLocation = async () => {
						if (locationDisabled) return;
						// Send location command to both devices
						const promises: Promise<boolean>[] = [];
						if (left && leftShowLocationRef.current) {
							promises.push(leftShowLocationRef.current());
						}
						if (right && rightShowLocationRef.current) {
							promises.push(rightShowLocationRef.current());
						}
						if (promises.length > 0) {
							await Promise.all(promises);
						}
					};

					return (
						<Pressable
							onPress={handleShowLocation}
							disabled={locationDisabled}
							style={({ pressed }) => [
								{
									width: 60,
									height: 60,
									borderRadius: 30,
									alignItems: 'center',
									justifyContent: 'center',
									borderWidth: 2,
									borderColor: theme.colors.white,
									backgroundColor: theme.colors.deepGreen,
									shadowColor: theme.colors.deepGreen,
									shadowOffset: { width: 0, height: 2 },
									shadowOpacity: 0.3,
									shadowRadius: 3,
									elevation: 3,
									marginTop: 10,
								},
								locationDisabled ? { opacity: 0.4 } : undefined,
								pressed && !locationDisabled ? { opacity: 0.7, transform: [{ scale: 0.95 }], shadowOpacity: 0.2 } : undefined,
							]}
						>
							<MapPin color={theme.colors.white} size={24} />
						</Pressable>
					);
				})()}

				{/* Reset Position Button - clears device position assignments */}
				{(() => {
					const left = devicesByPosition.leftFoot;
					const right = devicesByPosition.rightFoot;
					const hasDevices = !!left || !!right;
					const resetDisabled = !hasDevices || isActive;

					const handleResetPositions = () => {
						if (resetDisabled) return;

						Alert.alert('Reset Device Positions', 'This will unassign all devices from their positions. Continue?', [
							{ text: 'Cancel', style: 'cancel' },
							{
								text: 'Reset',
								style: 'destructive',
								onPress: () => {
									if (left) unassignDevicePosition(left.id);
									if (right) unassignDevicePosition(right.id);
								},
							},
						]);
					};

					return (
						<Pressable
							onPress={handleResetPositions}
							disabled={resetDisabled}
							style={({ pressed }) => [
								{
									width: 60,
									height: 60,
									borderRadius: 30,
									alignItems: 'center',
									justifyContent: 'center',
									borderWidth: 2,
									borderColor: theme.colors.white,
									backgroundColor: theme.colors.warn,
									shadowColor: theme.colors.warn,
									shadowOffset: { width: 0, height: 2 },
									shadowOpacity: 0.3,
									shadowRadius: 3,
									elevation: 3,
									marginTop: 10,
								},
								resetDisabled ? { opacity: 0.4 } : undefined,
								pressed && !resetDisabled ? { opacity: 0.7, transform: [{ scale: 0.95 }], shadowOpacity: 0.2 } : undefined,
							]}
						>
							<RotateCcw color={theme.colors.white} size={24} />
						</Pressable>
					);
				})()}

				{/* Snapshot Button - triggers CMD_SNAPSHOT (10) on all RUNNING + 100% devices 
						{(() => {
							const candidates: (() => Promise<boolean>)[] = [];
							if (leftMetrics && leftMetrics.controlState === ControlState.RUNNING && leftMetrics.fifoFillPct !== null && leftMetrics.fifoFillPct >= FIFO_FULL_THRESHOLD) {
								candidates.push(leftMetrics.snapshot);
							}
							if (rightMetrics && rightMetrics.controlState === ControlState.RUNNING && rightMetrics.fifoFillPct !== null && rightMetrics.fifoFillPct >= FIFO_FULL_THRESHOLD) {
								candidates.push(rightMetrics.snapshot);
							}
							const snapshotEnabled = candidates.length > 0;
							const handleSnapshot = async () => {
								if (!snapshotEnabled) return;
								await Promise.all(candidates.map((fn) => fn()));
							};

							return (
								<Pressable
									onPress={handleSnapshot}
									disabled={!snapshotEnabled}
									style={({ pressed }) => [
										{
											width: 60,
											height: 60,
											borderRadius: 30,
											alignItems: 'center',
											justifyContent: 'center',
											borderWidth: 2,
											borderColor: theme.colors.white,
											backgroundColor: '#00BFFF',
											shadowColor: '#00BFFF',
											shadowOffset: { width: 0, height: 2 },
											shadowOpacity: 0.3,
											shadowRadius: 3,
											elevation: 3,
											marginTop: 10,
										},
										!snapshotEnabled ? { opacity: 0.4 } : undefined,
										pressed && snapshotEnabled ? { opacity: 0.7, transform: [{ scale: 0.95 }], shadowOpacity: 0.2 } : undefined,
									]}
								>
									<Camera color={theme.colors.white} size={24} />
								</Pressable>
							);
						})()} */}
			</View>
			{/* Right */}
			<View style={{ flex: 1 }}>
				{(() => {
					const position: DevicePosition = 'rightFoot';
					const device = devicesByPosition[position];
					return (
						<DeviceBox
							position={position}
							device={device || null}
							enabled={!isActive}
							onRemoveDevice={handleRemoveDevice}
							onAssignDevice={handleAssignDevice}
							showLocationRef={rightShowLocationRef}
							stateRef={rightStateRef}
							onMetricsUpdate={setRightMetrics}
						/>
					);
				})()}
			</View>
		</View>
	);
};

// Memoize DeviceManager to prevent re-renders from parent
export const DeviceManager = React.memo(DeviceManagerComponent);

DeviceManager.displayName = 'DeviceManager';
