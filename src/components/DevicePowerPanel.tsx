import React from 'react';
import { View, Text } from 'react-native';

import PowerModeToggle from './PowerModeToggle';
import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeContext';

/**
 * Example component showing how to use PowerModeToggle
 * This can be included in any screen or panel where device power control is needed
 */
export default function DevicePowerPanel() {
	const { theme } = useTheme();
	const { entryA, entryB, stateA, stateB, a, b } = useSession();

	return (
		<View style={[theme.viewStyles.panelContainer, { backgroundColor: 'white', opacity: 0.9 }]}>

			{/* Device Power Controls in a Row */}
			<View style={[theme.viewStyles.rowBetween, { gap: 12 }]}>
				{/* Device A Power Control */}
				{entryA && (
					<View style={{ flex: 1 }}>
						<PowerModeToggle
							currentMode={stateA.value}
							onModeChange={async (mode) => {
								await stateA.setStateMode?.(mode);
							}}
							disabled={!stateA.supported}
							deviceName={entryA.device.name || 'Device A'}
							onStatsReset={() => {
								// Reset device A stats when switching to low power mode
								a?.resetStats?.();
							}}
						/>
					</View>
				)}

				{/* Device B Power Control */}
				{entryB && (
					<View style={{ flex: 1 }}>
						<PowerModeToggle
							currentMode={stateB.value}
							onModeChange={async (mode) => {
								await stateB.setStateMode?.(mode);
							}}
							disabled={!stateB.supported}
							deviceName={entryB.device.name || 'Device B'}
							onStatsReset={() => {
								// Reset device B stats when switching to low power mode
								b?.resetStats?.();
							}}
						/>
					</View>
				)}

				{/* Placeholder if only one device */}
				{(entryA && !entryB) && <View style={{ flex: 1 }} />}
				{(!entryA && entryB) && <View style={{ flex: 1 }} />}
			</View>

			{/* Show message if no devices */}
			{!entryA && !entryB && (
				<View style={[theme.viewStyles.rowCenter, { padding: 16 }]}>
					<Text style={[theme.textStyles.body2, theme.textStyles.dim]}>
						No devices connected
					</Text>
				</View>
			)}
		</View>
	);
}