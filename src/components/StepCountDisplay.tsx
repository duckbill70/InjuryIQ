import React from 'react';
import { View, Text } from 'react-native';
import { useBle } from '../ble/BleProvider';
import { useStepCount } from '../ble/useStepCount';
import { useStateControl, StateMode } from '../ble/useStateControl';
import { useTheme } from '../theme/ThemeContext';
import FootIcon from './FootIcon';

function stateModeToTint(mode: number | null | undefined, fallback: string) {
	switch (mode) {
		case StateMode.Amber:
			return '#FFB300'; // amber
		case StateMode.RedPulse:
			return '#EF4444'; // red-500
		case StateMode.Red:
			return '#EF4444'; // red-500
		case StateMode.GreenPulse:
			return '#22C55E'; // green-500
		case StateMode.Green:
			return '#22C55E'; // green-500
		case StateMode.BluePulse:
			return '#3B82F6'; // blue-500
		case StateMode.Blue:
			return '#3B82F6'; // blue-500
		case StateMode.Off:
			return '#9CA3AF'; // gray-400
		default:
			return fallback; // when unknown
	}
}

export const StepCountDisplay: React.FC = () => {
	const { entryA, entryB } = useBle();
	const { theme } = useTheme();

	// State control hooks to get device colors
	const stateA = useStateControl(entryA, { subscribe: true });
	const stateB = useStateControl(entryB, { subscribe: true });

	// Monitor step count from both devices (if available)
	const deviceASteps = useStepCount(entryA, {
		subscribe: true, // Use notifications when available
		intervalMs: 30000, // Poll every 30 seconds as fallback
	});

	const deviceBSteps = useStepCount(entryB, {
		subscribe: true,
		intervalMs: 30000,
	});

	//const formatTimestamp = (timestamp: number | null) => {
	//	if (!timestamp) return 'Never';
	//	return new Date(timestamp).toLocaleTimeString();
	//};

	return (
		<View style={theme.viewStyles.panelContainer}>
			<Text style={theme.textStyles.panelTitle}>Step Count Monitor</Text>
			
			<View style={theme.viewStyles.devicesRow}>
				{/* Device A */}
				<View style={theme.viewStyles.deviceContainer}>
					<View style={theme.viewStyles.deviceHeader}>
						<FootIcon size={32} color={stateModeToTint(stateA.value, theme?.colors?.muted || '#9CA3AF')} side='left' />
					</View>
					<View style={theme.viewStyles.deviceContent}>
						{entryA ? (
							<>
								{deviceASteps.supported ? (
									<>
										<Text style={theme.textStyles.stepCount}>{deviceASteps.stepCount ?? 'Loading...'}</Text>
										{/* <Text style={theme.textStyles.lastUpdated}>Last updated: {formatTimestamp(deviceASteps.lastUpdated)}</Text> */}
										{deviceASteps.error && <Text style={theme.textStyles.error}>Error: {deviceASteps.error}</Text>}
									</>
								) : (
									<Text style={theme.textStyles.unsupported}>Step counting not supported on this device</Text>
								)}
							</>
						) : (
							<>
								<Text style={theme.textStyles.stepCount}>---</Text>
								{/* <Text style={theme.textStyles.lastUpdated}>Last updated: ---</Text> */}
							</>
						)}
					</View>
				</View>

				{/* Device B */}
				<View style={theme.viewStyles.deviceContainer}>
					<View style={theme.viewStyles.deviceHeader}>
						<FootIcon size={32} color={stateModeToTint(stateB.value, theme?.colors?.muted || '#9CA3AF')} side='right' />
					</View>
					<View style={theme.viewStyles.deviceContent}>
						{entryB ? (
							<>
								{deviceBSteps.supported ? (
									<>
										<Text style={theme.textStyles.stepCount}>{deviceBSteps.stepCount ?? 'Loading...'}</Text>
										{/* <Text style={theme.textStyles.lastUpdated}>Last updated: {formatTimestamp(deviceBSteps.lastUpdated)}</Text> */}
										{deviceBSteps.error && <Text style={theme.textStyles.error}>Error: {deviceBSteps.error}</Text>}
									</>
								) : (
									<Text style={theme.textStyles.unsupported}>Step counting not supported on this device</Text>
								)}
							</>
						) : (
							<>
								<Text style={theme.textStyles.stepCount}>---</Text>
								{/* <Text style={theme.textStyles.lastUpdated}>Last updated: ---</Text> */}
							</>
						)}
					</View>
				</View>
			</View>
		</View>
	);
};
