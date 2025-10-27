import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useBle, DevicePosition } from '../ble/BleProvider';
import { LEDControlMode } from '../ble/useLEDControl';
import { useTheme } from '../theme/ThemeContext';
import { 
	Settings, 
	Lightbulb, 
	Plus,
	Lock,
	Unlock,
	Trash
} from 'lucide-react-native';

interface DeviceSettingsPanelProps {
	enabled?: boolean; // Flag to enable/disable settings (for session state)
}

const POSITION_LABELS = {
	leftFoot: 'Left Foot',
	rightFoot: 'Right Foot',
	racket: 'Racket'
};

const POSITION_COLORS = {
	leftFoot: '#007AFF',    // Blue
	rightFoot: '#007AFF',   //'#FF9500',  // Orange  
	racket: '#007AFF',      //'#34C759'      // Green
};

const LED_MODE_OPTIONS = [
	{ value: LEDControlMode.AMBER, label: 'Standby', shortLabel: 'AMB', color: '#FFA500' },
	//{ value: LEDControlMode.PULSE_RED, label: 'Collecting', shortLabel: 'P-R', color: '#EF4444' },
	//{ value: LEDControlMode.PULSE_GREEN, label: 'Collecting', shortLabel: 'P-G', color: '#10B981' },
	//{ value: LEDControlMode.PULSE_BLUE, label: 'Collecting', shortLabel: 'P-B', color: '#3B82F6' },
	{ value: LEDControlMode.SOLID_RED, label: 'Collecting', shortLabel: 'S-R', color: '#EF4444' },
	{ value: LEDControlMode.SOLID_GREEN, label: 'Collecting', shortLabel: 'S-G', color: '#10B981' },
	{ value: LEDControlMode.SOLID_BLUE, label: 'Collecting', shortLabel: 'S-B', color: '#3B82F6' },
	{ value: LEDControlMode.OFF, label: 'Off', shortLabel: 'OFF', color: '#6B7280' },
];

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

const DeviceBox: React.FC<DeviceBoxProps> = ({ 
	position, 
	device, 
	ledMode, 
	enabled,
	onLEDModeChange,
	onRemoveDevice,
	onAssignDevice
}) => {
	const { theme } = useTheme();
	
	// Get next LED mode for step-through
	const getNextLEDMode = (currentMode: LEDControlMode): LEDControlMode => {
		const currentIndex = LED_MODE_OPTIONS.findIndex(opt => opt.value === currentMode);
		const nextIndex = (currentIndex + 1) % LED_MODE_OPTIONS.length;
		return LED_MODE_OPTIONS[nextIndex].value;
	};

	const handleLEDStep = () => {
		if (device && enabled) {
			const nextMode = getNextLEDMode(ledMode);
			onLEDModeChange(device.id, nextMode);
		}
	};

	const currentLEDOption = LED_MODE_OPTIONS.find(opt => opt.value === ledMode);

	return (
		<View style={[
			theme.viewStyles.card,
			{
				backgroundColor: theme.colors.dgrey,
				height: 140,
				borderWidth: 2,
				borderColor: device ? POSITION_COLORS[position] : theme.colors.border,
				opacity: enabled ? 1 : 0.7,
                padding: 5,
			}
		]}>
			{/* Position Header with button on right */}
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
				<Text style={[
					theme.textStyles.body,
					{ fontWeight: '600', color: POSITION_COLORS[position] }
				]}>
					{POSITION_LABELS[position]}
				</Text>
				{device ? (
					<TouchableOpacity
						style={{
							backgroundColor: theme.colors.danger,
							paddingVertical: 4,
							paddingHorizontal: 6,
							borderRadius: 3,
							opacity: enabled ? 1 : 0.5
						}}
						onPress={() => enabled && onRemoveDevice(device.id)}
						disabled={!enabled}
					>
						<Trash size={16} color={theme.colors.white} />
					</TouchableOpacity>
				) : (
					<TouchableOpacity
						style={{
							backgroundColor: enabled ? theme.colors.primary : theme.colors.muted,
							paddingVertical: 4,
							paddingHorizontal: 10,
							borderRadius: 4,
							opacity: enabled ? 1 : 0.5
						}}
						onPress={() => enabled && onAssignDevice(position)}
						disabled={!enabled}
					>
						<Plus size={16} color={theme.colors.white} />
					</TouchableOpacity>
				)}
			</View>

			{/* Content Area - Fixed Height to Ensure Consistent Sizing */}
			<View style={{ flex: 1, justifyContent: 'space-between' }}>
				{device ? (
					<>
						{/* Device Info */}
						<View style={{ marginBottom: 8 }}>
							<Text style={[theme.textStyles.body, { fontWeight: '600' }]}>
								{device.name || 'StingRay'}
							</Text>
							<Text style={[theme.textStyles.body2, { color: theme.colors.muted }]}>
								{device.id.slice(-6)}
							</Text>
						</View>

						{/* LED Control Button */}
                        <View style={{ flexDirection: 'row', alignContent: 'center', justifyContent: 'center'}}>
						<TouchableOpacity
							style={[
								{
									backgroundColor: enabled ? currentLEDOption?.color : theme.colors.muted,
									paddingVertical: 6,
									paddingHorizontal: 4,
									borderRadius: 4,
									marginBottom: 8,
									opacity: enabled ? 1 : 0.5,
                                    width: '75%'
								}
							]}
							onPress={handleLEDStep}
							disabled={!enabled}
						>
							<View style={[theme.viewStyles.rowCenter, { justifyContent: 'center' }]}>
								<Lightbulb size={16} color={theme.colors.white} />
								<Text style={[
									theme.textStyles.body, 
									{ 
										//fontSize: 10, 
										color: theme.colors.white,
										marginLeft: 4,
										fontWeight: '600'
									}
								]}>
									{currentLEDOption?.label}
								</Text>
							</View>
						</TouchableOpacity>
                        </View>

						{/* Remove Button 
						<TouchableOpacity
							style={[
								{
									backgroundColor: theme.colors.danger,
									paddingVertical: 4,
									paddingHorizontal: 6,
									borderRadius: 3,
									alignSelf: 'flex-end',
									opacity: enabled ? 1 : 0.5
								}
							]}
							onPress={() => enabled && onRemoveDevice(device.id)}
							disabled={!enabled}
						>
							<X size={12} color={theme.colors.white} />
						</TouchableOpacity> */}
					</>
				) : (
					// Empty slot - centered content with same overall structure
					<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
						{/* <TouchableOpacity
							style={[
								{
									backgroundColor: enabled ? theme.colors.primary : theme.colors.muted,
									paddingVertical: 12,
									paddingHorizontal: 16,
									borderRadius: 6,
									opacity: enabled ? 1 : 0.5
								}
							]}
							onPress={() => enabled && onAssignDevice(position)}
							disabled={!enabled}
						>
							<View style={[theme.viewStyles.rowCenter]}>
								<Plus size={16} color={theme.colors.white} />
								<Text style={[
									theme.textStyles.body, 
									{ 
										color: theme.colors.white,
										marginLeft: 4,
										fontSize: 11,
										fontWeight: '600'
									}
								]}>
									Assign
								</Text>
							</View>
						</TouchableOpacity> */}
					</View>
				)}
			</View>
		</View>
	);
};

export const DeviceSettingsPanel: React.FC<DeviceSettingsPanelProps> = ({ 
	enabled = true 
}) => {
	const { 
		connected, 
		devicesByPosition,
		assignDevicePosition,
		unassignDevicePosition 
	} = useBle();

	const { theme } = useTheme();

	// LED control states for each device
	const [ledModes, setLedModes] = useState<Record<string, LEDControlMode>>({});

	// Available devices that can be assigned
	//const availableDevices = Object.values(connected).filter(device => !device.position);

	// Read actual LED modes from connected devices
	const readDeviceLEDMode = useCallback(async (deviceId: string): Promise<LEDControlMode> => {
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
				'19b10010-e8f2-537e-4f6c-d104768a1215'  // LED_CONTROL_CHARACTERISTIC_UUID
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
			console.log(`Device ${deviceId} does not support LED control or read failed:`, error);
		}

		return LEDControlMode.AMBER; // Default fallback
	}, [connected]);

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
				setLedModes(prev => ({ ...prev, ...updates }));
			}
		};

		initializeLEDModes();
	}, [connected, ledModes, readDeviceLEDMode]);

	// Handle LED mode change
	const handleLEDModeChange = useCallback(async (deviceId: string, mode: LEDControlMode) => {
		try {
			// Update local state immediately for responsive UI
			setLedModes(prev => ({ ...prev, [deviceId]: mode }));
			
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
			const modeValue = mode & 0xFF; // Ensure single byte
			// eslint-disable-next-line no-bitwise
			const char1 = base64chars[(modeValue >> 2) & 0x3F];
			// eslint-disable-next-line no-bitwise
			const char2 = base64chars[(modeValue << 4) & 0x30];
			const encodedMode = char1 + char2 + '==';
			
			// Send the command directly to the device using the same UUIDs as useLEDControl
			await device.writeCharacteristicWithResponseForService(
				'19b10010-e8f2-537e-4f6c-d104768a1214', // LED_SERVICE_UUID
				'19b10010-e8f2-537e-4f6c-d104768a1215', // LED_CONTROL_CHARACTERISTIC_UUID
				encodedMode
			);
			
			console.log(`Successfully set LED mode for device ${deviceId} to ${mode}`);
		} catch (error) {
			console.warn(`Failed to set LED mode for device ${deviceId}:`, error);
			// Revert the local state on error - set back to previous value or default
			setLedModes(prev => ({ ...prev, [deviceId]: LEDControlMode.AMBER }));
			Alert.alert('Error', `Failed to set LED mode: ${error}`);
		}
	}, [connected]);

	// Handle device removal from position
	const handleRemoveDevice = useCallback((deviceId: string) => {
		Alert.alert(
			'Remove Device',
			'Remove this device from its position?',
			[
				{ text: 'Cancel', style: 'cancel' },
				{ 
					text: 'Remove', 
					style: 'destructive',
					onPress: () => unassignDevicePosition(deviceId)
				}
			]
		);
	}, [unassignDevicePosition]);

	// Handle device assignment to position
	const handleAssignDevice = useCallback((position: DevicePosition) => {
		const allDevices = Object.values(connected);
		
		if (allDevices.length === 0) {
			Alert.alert('No Devices', 'No devices are connected.');
			return;
		}

		// Get available devices (not assigned to any position) and devices assigned to other positions
		const unassignedDevices = allDevices.filter(device => !device.position);
		const assignedDevices = allDevices.filter(device => device.position && device.position !== position);

		const allOptions = [
			...unassignedDevices.map(device => ({
				device,
				label: `${device.name || 'StingRay'} (Unassigned)`,
				isUnassigned: true
			})),
			...assignedDevices.map(device => ({
				device,
				label: `${device.name || 'StingRay'} (${POSITION_LABELS[device.position!]})`,
				isUnassigned: false
			}))
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
							onPress: () => assignDevicePosition(option.device.id, position, POSITION_COLORS[position])
						}
					]
				);
			} else {
				assignDevicePosition(option.device.id, position, POSITION_COLORS[position]);
			}
		} else {
			// Show selection for multiple devices
			Alert.alert(
				'Assign Device',
				`Select a device to assign to ${POSITION_LABELS[position]}:`,
				[
					...allOptions.map(option => ({
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
											onPress: () => assignDevicePosition(option.device.id, position, POSITION_COLORS[position])
										}
									]
								);
							} else {
								assignDevicePosition(option.device.id, position, POSITION_COLORS[position]);
							}
						}
					})),
					{ text: 'Cancel', style: 'cancel' }
				]
			);
		}
	}, [connected, assignDevicePosition]);

	return (
		<View style={[theme.viewStyles.panelContainer, {backgroundColor: theme.colors.white}]}>
			{/* Header */}
			<View style={[theme.viewStyles.panelTitle, theme.viewStyles.rowBetween]}>
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Settings size={20} color={theme.colors.primary} />
				</View>
				<View style={theme.viewStyles.rowCenter}>
					{enabled ? (
						<Unlock size={18} color={theme.colors.good} />
					) : (
						<Lock size={18} color={theme.colors.muted} />
					)}
					<Text style={[
						theme.textStyles.body, 
						{ 
							marginLeft: 4, 
							//fontSize: 12,
							color: enabled ? theme.colors.good : theme.colors.muted 
						}
					]}>
						{enabled ? 'Unlocked' : 'Locked'}
					</Text>
				</View>
			</View>

			{/* Position Boxes - 2 on top row, 1 on bottom */}
			<View style={{ marginBottom: 16 }}>
				{/* Top Row - Left Foot and Right Foot */}
				<View style={[{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }]}>
					{(['leftFoot', 'rightFoot'] as DevicePosition[]).map((position) => {
						const device = devicesByPosition[position];
						const ledMode = device ? (ledModes[device.id] || LEDControlMode.AMBER) : LEDControlMode.AMBER;

						return (
							<View key={position} style={{ width: '48%' }}>
								<DeviceBox
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
					})}
				</View>

				{/* Bottom Row - Racket (centered) */}
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
				</View>
			</View>
		</View>
	);
};