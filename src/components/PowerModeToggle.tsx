import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Power, PowerOff } from 'lucide-react-native';

import { useTheme } from '../theme/ThemeContext';
import { useSession } from '../session/SessionProvider';
import { StateMode } from '../ble/useStateControl';

export interface PowerModeToggleProps {
	/** Current state mode value */
	currentMode: number | null | undefined;
	/** Callback when mode should change */
	onModeChange: (mode: StateMode) => Promise<void> | void;
	/** Whether the toggle is disabled (e.g., during recording) */
	disabled?: boolean;
	/** Optional device name for confirmation dialog */
	deviceName?: string;
	/** Optional callback when stats are reset */
	onStatsReset?: () => void;
}

/**
 * PowerModeToggle - A reusable component for toggling between StateMode.Amber and StateMode.Off
 * 
 * Features:
 * - Shows amber/power icon when in Amber mode
 * - Shows gray/off icon when in Off mode  
 * - Confirmation dialog when switching from Amber to Off
 * - Warns about low power mode and stats reset
 * - Automatically disables when a session is running to prevent mode changes during recording
 */
export default function PowerModeToggle({
	currentMode,
	onModeChange,
	disabled = false,
	deviceName = 'Device',
	onStatsReset,
}: PowerModeToggleProps) {
	const { theme } = useTheme();
	const { sessionActive } = useSession();
	const [isChanging, setIsChanging] = useState(false);

	const isAmberMode = currentMode === StateMode.Amber;
	const isOffMode = currentMode === StateMode.Off;

	// Disable buttons when session is running or already disabled
	const isDisabled = disabled || sessionActive || isChanging;

	const handleToggle = async () => {
		if (isDisabled) return;

		setIsChanging(true);

		try {
			if (isAmberMode) {
				// Going from Amber to Off - show confirmation
				Alert.alert(
					'Switch to Low Power Mode?',
					`This will put ${deviceName} into low power mode and reset any statistics.\n\nAre you sure you want to continue?`,
					[
						{
							text: 'Cancel',
							style: 'cancel',
							onPress: () => setIsChanging(false),
						},
						{
							text: 'Switch to Low Power',
							style: 'destructive',
							onPress: async () => {
								try {
									await onModeChange(StateMode.Off);
									onStatsReset?.();
								} catch (error) {
									console.error('Failed to switch to Off mode:', error);
									Alert.alert('Error', 'Failed to switch device to low power mode.');
								} finally {
									setIsChanging(false);
								}
							},
						},
					],
					{ cancelable: true, onDismiss: () => setIsChanging(false) }
				);
			} else {
				// Going from Off (or other) to Amber - no confirmation needed
				await onModeChange(StateMode.Amber);
				setIsChanging(false);
			}
		} catch (error) {
			console.error('Failed to change mode:', error);
			Alert.alert('Error', 'Failed to change device mode.');
			setIsChanging(false);
		}
	};

	const getButtonColor = () => {
		if (isDisabled) return theme.colors.muted;
		if (isAmberMode) return theme.colors.amber; // amber
		if (isOffMode) return theme.colors.muted; // gray
		return theme.colors.primary; // default for unknown states
	};

	const getButtonText = () => {
		if (isOffMode) return 'Low Power';
		if (isAmberMode) return 'Standby';
		return 'Active'; // Any other state
	};

	const getIcon = () => {
		const iconSize = 18;
		const iconColor = 'white';
		
		if (isOffMode) {
			return <PowerOff size={iconSize} color={iconColor} />;
		} else {
			// Use Power icon for all modes other than Off (Amber, Red, Green, Blue, etc.)
			return <Power size={iconSize} color={iconColor} />;
		}
	};

	return (
		<View style={{ backgroundColor: 'transparent' }}>
			<View style={[theme.viewStyles.rowCenter, { justifyContent: 'center' }]}>
				<TouchableOpacity
					onPress={handleToggle}
					disabled={isDisabled}
					style={[
						theme.viewStyles.actionButton,
						{
							backgroundColor: getButtonColor(),
							opacity: isDisabled ? 0.6 : 1,
							flex: 1,
							minWidth: 100,
						},
					]}
				>
					{getIcon()}
					<Text style={theme.textStyles.buttonLabel}>
						{isChanging ? 'Changing...' : getButtonText()}
					</Text>
				</TouchableOpacity>
			</View>
		</View>
	);
}