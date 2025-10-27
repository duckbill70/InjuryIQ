import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, ScrollView } from 'react-native';
import { useBle, DevicePosition } from '../ble/BleProvider';
import { LEDControlMode } from '../ble/useLEDControl';
import { useTheme } from '../theme/ThemeContext';
import { 
	Settings, 
	MapPin, 
	Lightbulb, 
	ChevronDown,
	ChevronUp,
	Check,
	Lock,
	Unlock
} from 'lucide-react-native';

interface DeviceSettingsPanelProps {
	enabled?: boolean; // Flag to enable/disable settings (for session state)
}

interface DropdownProps {
	value: DevicePosition | null;
	options: { value: DevicePosition | null; label: string }[];
	onSelect: (value: DevicePosition | null) => void;
	disabled?: boolean;
}

interface LEDDropdownProps {
	value: LEDControlMode;
	onSelect: (value: LEDControlMode) => void;
	disabled?: boolean;
}

const POSITION_OPTIONS = [
	{ value: null, label: 'Unassigned' },
	{ value: 'leftFoot' as DevicePosition, label: 'Left Foot' },
	{ value: 'rightFoot' as DevicePosition, label: 'Right Foot' },
	{ value: 'racket' as DevicePosition, label: 'Racket' },
];

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

const LED_MODE_OPTIONS = [
	{ value: LEDControlMode.AMBER, label: 'Standby (Amber)', color: '#FFA500' },
	{ value: LEDControlMode.PULSE_RED, label: 'Pulse Red', color: '#EF4444' },
	{ value: LEDControlMode.PULSE_GREEN, label: 'Pulse Green', color: '#10B981' },
	{ value: LEDControlMode.PULSE_BLUE, label: 'Pulse Blue', color: '#3B82F6' },
	{ value: LEDControlMode.SOLID_RED, label: 'Solid Red', color: '#EF4444' },
	{ value: LEDControlMode.SOLID_GREEN, label: 'Solid Green', color: '#10B981' },
	{ value: LEDControlMode.SOLID_BLUE, label: 'Solid Blue', color: '#3B82F6' },
	{ value: LEDControlMode.OFF, label: 'Off (Low Power)', color: '#6B7280' },
];

const PositionDropdown: React.FC<DropdownProps> = ({ value, options, onSelect, disabled }) => {
	const { theme } = useTheme();
	const [isOpen, setIsOpen] = useState(false);

	const selectedOption = options.find(opt => opt.value === value);

	return (
		<View style={{ position: 'relative' }}>
			<TouchableOpacity
				style={[
					theme.viewStyles.button,
					{ 
						backgroundColor: disabled ? theme.colors.muted : theme.colors.background,
						borderWidth: 1,
						borderColor: theme.colors.border,
						paddingVertical: 8,
						paddingHorizontal: 12,
						opacity: disabled ? 0.5 : 1
					}
				]}
				onPress={() => !disabled && setIsOpen(!isOpen)}
				disabled={disabled}
			>
				<View style={[theme.viewStyles.rowBetween, { alignItems: 'center' }]}>
					<Text style={[
						theme.textStyles.body, 
						{ color: disabled ? theme.colors.muted : theme.colors.text }
					]}>
						{selectedOption?.label || 'Select Position'}
					</Text>
					{isOpen ? (
						<ChevronUp size={16} color={disabled ? theme.colors.muted : theme.colors.text} />
					) : (
						<ChevronDown size={16} color={disabled ? theme.colors.muted : theme.colors.text} />
					)}
				</View>
			</TouchableOpacity>

			<Modal
				visible={isOpen}
				transparent
				animationType="fade"
				onRequestClose={() => setIsOpen(false)}
			>
				<TouchableOpacity
					style={{
						flex: 1,
						backgroundColor: 'rgba(0,0,0,0.5)',
						justifyContent: 'center',
						alignItems: 'center',
					}}
					onPress={() => setIsOpen(false)}
				>
					<View style={[
						theme.viewStyles.card,
						{
							backgroundColor: theme.colors.background,
							minWidth: 200,
							maxHeight: 300,
						}
					]}>
						<ScrollView>
							{options.map((option) => (
								<TouchableOpacity
									key={option.value || 'null'}
									style={{
										padding: 12,
										borderBottomWidth: 1,
										borderBottomColor: theme.colors.border,
									}}
									onPress={() => {
										onSelect(option.value);
										setIsOpen(false);
									}}
								>
									<View style={[theme.viewStyles.rowBetween, { alignItems: 'center' }]}>
										<Text style={theme.textStyles.body}>
											{option.label}
										</Text>
										{value === option.value && (
											<Check size={16} color={theme.colors.primary} />
										)}
									</View>
								</TouchableOpacity>
							))}
						</ScrollView>
					</View>
				</TouchableOpacity>
			</Modal>
		</View>
	);
};

const LEDDropdown: React.FC<LEDDropdownProps> = ({ value, onSelect, disabled }) => {
	const { theme } = useTheme();
	const [isOpen, setIsOpen] = useState(false);

	const selectedOption = LED_MODE_OPTIONS.find(opt => opt.value === value);

	return (
		<View style={{ position: 'relative' }}>
			<TouchableOpacity
				style={[
					theme.viewStyles.button,
					{ 
						backgroundColor: disabled ? theme.colors.muted : theme.colors.background,
						borderWidth: 1,
						borderColor: theme.colors.border,
						paddingVertical: 8,
						paddingHorizontal: 12,
						opacity: disabled ? 0.5 : 1
					}
				]}
				onPress={() => !disabled && setIsOpen(!isOpen)}
				disabled={disabled}
			>
				<View style={[theme.viewStyles.rowBetween, { alignItems: 'center' }]}>
					<View style={[theme.viewStyles.rowCenter, { flex: 1 }]}>
						{selectedOption && (
							<View style={{
								width: 12,
								height: 12,
								borderRadius: 6,
								backgroundColor: selectedOption.color,
								marginRight: 8,
							}} />
						)}
						<Text style={[
							theme.textStyles.body, 
							{ color: disabled ? theme.colors.muted : theme.colors.text }
						]}>
							{selectedOption?.label || 'Select LED Mode'}
						</Text>
					</View>
					{isOpen ? (
						<ChevronUp size={16} color={disabled ? theme.colors.muted : theme.colors.text} />
					) : (
						<ChevronDown size={16} color={disabled ? theme.colors.muted : theme.colors.text} />
					)}
				</View>
			</TouchableOpacity>

			<Modal
				visible={isOpen}
				transparent
				animationType="fade"
				onRequestClose={() => setIsOpen(false)}
			>
				<TouchableOpacity
					style={{
						flex: 1,
						backgroundColor: 'rgba(0,0,0,0.5)',
						justifyContent: 'center',
						alignItems: 'center',
					}}
					onPress={() => setIsOpen(false)}
				>
					<View style={[
						theme.viewStyles.card,
						{
							backgroundColor: theme.colors.background,
							minWidth: 250,
							maxHeight: 400,
						}
					]}>
						<ScrollView>
							{LED_MODE_OPTIONS.map((option) => (
								<TouchableOpacity
									key={option.value}
									style={{
										padding: 12,
										borderBottomWidth: 1,
										borderBottomColor: theme.colors.border,
									}}
									onPress={() => {
										onSelect(option.value);
										setIsOpen(false);
									}}
								>
									<View style={[theme.viewStyles.rowBetween, { alignItems: 'center' }]}>
										<View style={[theme.viewStyles.rowCenter, { flex: 1 }]}>
											<View style={{
												width: 12,
												height: 12,
												borderRadius: 6,
												backgroundColor: option.color,
												marginRight: 8,
											}} />
											<Text style={theme.textStyles.body}>
												{option.label}
											</Text>
										</View>
										{value === option.value && (
											<Check size={16} color={theme.colors.primary} />
										)}
									</View>
								</TouchableOpacity>
							))}
						</ScrollView>
					</View>
				</TouchableOpacity>
			</Modal>
		</View>
	);
};

export const DeviceSettingsPanel: React.FC<DeviceSettingsPanelProps> = ({ 
	enabled = true 
}) => {
	const { theme } = useTheme();
	const { 
		connected, 
		devicesByPosition,
		assignDevicePosition,
		unassignDevicePosition 
	} = useBle();

	// LED control states for each device
	const [ledModes, setLedModes] = useState<Record<string, LEDControlMode>>({});

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

	// Get connected devices array
	const connectedDevices = Object.values(connected);

	// Handle position change
	const handlePositionChange = useCallback(async (deviceId: string, newPosition: DevicePosition | null) => {
		try {
			if (newPosition === null) {
				unassignDevicePosition(deviceId);
			} else {
				// Check if position is already taken
				const currentDevice = devicesByPosition[newPosition];
				if (currentDevice && currentDevice.id !== deviceId) {
					Alert.alert(
						'Position Occupied',
						`The ${POSITION_LABELS[newPosition]} position is already assigned to ${currentDevice.name || 'another device'}. Do you want to swap their positions?`,
						[
							{ text: 'Cancel', style: 'cancel' },
							{
								text: 'Swap',
								onPress: async () => {
									// First unassign the current device at that position
									unassignDevicePosition(currentDevice.id);
									// Then assign the new device
									await assignDevicePosition(deviceId, newPosition, POSITION_COLORS[newPosition]);
								}
							}
						]
					);
					return;
				}
				
				await assignDevicePosition(deviceId, newPosition, POSITION_COLORS[newPosition]);
			}
		} catch (error) {
			Alert.alert('Error', `Failed to update device position: ${error}`);
		}
	}, [devicesByPosition, assignDevicePosition, unassignDevicePosition]);

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

	if (connectedDevices.length === 0) {
		return (
			<View style={[theme.viewStyles.panelContainer, { minHeight: 150, justifyContent: 'center' }]}>
				<Text style={[theme.textStyles.placeholderText, { textAlign: 'center', color: theme.colors.text }]}>
					No devices connected
				</Text>
				<Text style={[theme.textStyles.placeholderSubText, { textAlign: 'center', color: theme.colors.muted }]}>
					Connect your StingRay devices to configure settings
				</Text>
			</View>
		);
	}

	return (
		<View style={theme.viewStyles.panelContainer}>
			{/* Header */}
			<View style={[theme.viewStyles.panelTitle, theme.viewStyles.rowBetween]}>
				<View style={theme.viewStyles.rowCenter}>
					<Settings size={20} color={theme.colors.primary} />
					<Text style={[theme.textStyles.panelTitle, { marginLeft: 8 }]}>
						Device Settings
					</Text>
				</View>
				<View style={theme.viewStyles.rowCenter}>
					{enabled ? (
						<Unlock size={16} color={theme.colors.good} />
					) : (
						<Lock size={16} color={theme.colors.muted} />
					)}
					<Text style={[
						theme.textStyles.body, 
						{ 
							marginLeft: 4, 
							fontSize: 12,
							color: enabled ? theme.colors.good : theme.colors.muted 
						}
					]}>
						{enabled ? 'Unlocked' : 'Locked'}
					</Text>
				</View>
			</View>

			{/* Device Settings */}
			<ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
				{connectedDevices.map((device) => {
					const currentPosition = device.position;
					const currentLEDMode = ledModes[device.id] || LEDControlMode.AMBER;

					return (
						<View
							key={device.id}
							style={[
								theme.viewStyles.card,
								{
									backgroundColor: theme.colors.dgrey,
									marginBottom: 16,
									borderWidth: 2,
									borderColor: currentPosition ? POSITION_COLORS[currentPosition] : theme.colors.border,
								}
							]}
						>
							{/* Device Header */}
							<View style={[
								theme.viewStyles.rowBetween,
								{ 
									marginBottom: 16,
									paddingBottom: 12,
									borderBottomWidth: 1,
									borderBottomColor: theme.colors.border
								}
							]}>
								<View>
									<Text style={[theme.textStyles.body, { fontWeight: '600' }]}>
										{device.name || 'StingRay Device'}
									</Text>
									<Text style={[theme.textStyles.body, { fontSize: 12, color: theme.colors.muted }]}>
										ID: {device.id.slice(-8)}
									</Text>
								</View>
								{currentPosition && (
									<View style={{
										backgroundColor: POSITION_COLORS[currentPosition] + '20',
										paddingHorizontal: 8,
										paddingVertical: 4,
										borderRadius: 6,
										borderWidth: 1,
										borderColor: POSITION_COLORS[currentPosition],
									}}>
										<Text style={[
											theme.textStyles.body,
											{ 
												fontSize: 12, 
												fontWeight: '600',
												color: POSITION_COLORS[currentPosition] 
											}
										]}>
											{POSITION_LABELS[currentPosition]}
										</Text>
									</View>
								)}
							</View>

							{/* Position Setting */}
							<View style={{ marginBottom: 16 }}>
								<View style={[theme.viewStyles.rowCenter, { marginBottom: 8 }]}>
									<MapPin size={16} color={theme.colors.primary} />
									<Text style={[theme.textStyles.body, { marginLeft: 8, fontWeight: '600' }]}>
										Position Assignment
									</Text>
								</View>
								<PositionDropdown
									value={currentPosition || null}
									options={POSITION_OPTIONS}
									onSelect={(position) => handlePositionChange(device.id, position)}
									disabled={!enabled}
								/>
							</View>

							{/* LED Control Setting */}
							<View>
								<View style={[theme.viewStyles.rowCenter, { marginBottom: 8 }]}>
									<Lightbulb size={16} color={theme.colors.primary} />
									<Text style={[theme.textStyles.body, { marginLeft: 8, fontWeight: '600' }]}>
										LED Control
									</Text>
								</View>
								<LEDDropdown
									value={currentLEDMode}
									onSelect={(mode) => handleLEDModeChange(device.id, mode)}
									disabled={!enabled}
								/>
							</View>
						</View>
					);
				})}
			</ScrollView>

			{/* Footer Info */}
			{!enabled && (
				<View style={[
					theme.viewStyles.card,
					{
						backgroundColor: theme.colors.warn + '20',
						borderColor: theme.colors.warn,
						borderWidth: 1,
						marginTop: 16,
					}
				]}>
					<View style={theme.viewStyles.rowCenter}>
						<Lock size={16} color={theme.colors.warn} />
						<Text style={[
							theme.textStyles.body,
							{ 
								marginLeft: 8,
								color: theme.colors.warn,
								fontSize: 12
							}
						]}>
							Settings are locked during active sessions
						</Text>
					</View>
				</View>
			)}
		</View>
	);
};