import React from 'react';
import { View, Text } from 'react-native';

import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeContext';
import { useStateControl, StateMode } from '../ble/useStateControl';
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

function getFatigueColor(percent: number | null): string {
	if (percent === null) return '#9CA3AF'; // gray when no data
	
	// Green (0%) -> Amber (50%) -> Red (100%)
	if (percent <= 50) {
		// Green to Amber: 0-50%
		const ratio = percent / 50;
		const red = Math.round(34 + (255 - 34) * ratio);   // 34 -> 255
		const green = Math.round(197 + (179 - 197) * ratio); // 197 -> 179
		const blue = Math.round(94 + (0 - 94) * ratio);     // 94 -> 0
		return `rgb(${red}, ${green}, ${blue})`;
	} else {
		// Amber to Red: 50-100%
		const ratio = (percent - 50) / 50;
		const red = Math.round(255 - (255 - 239) * ratio);   // 255 -> 239
		const green = Math.round(179 - (179 - 68) * ratio);  // 179 -> 68
		const blue = Math.round(0 - (0 - 68) * ratio);       // 0 -> 68
		return `rgb(${red}, ${green}, ${blue})`;
	}
}

export default function FatiguePanel() {
	const { theme } = useTheme();
	const { entryA, entryB, fatigueTrendA, fatigueTrendB } = useSession();
	
	// State control hooks to get device colors for foot icons
	const stateA = useStateControl(entryA, { subscribe: true });
	const stateB = useStateControl(entryB, { subscribe: true });

	// Average fatigue over the (throttled) window:
	const avgA = fatigueTrendA.avg ?? null;
	const avgB = fatigueTrendB.avg ?? null;

	return (
		<View style={theme.viewStyles.panelContainer}>
			<Text style={theme.textStyles.panelTitle}>Fatigue Monitor</Text>
			
			<View style={theme.viewStyles.devicesRow}>
				{/* Device A */}
				<View style={theme.viewStyles.deviceContainer}>
					<View style={theme.viewStyles.deviceHeader}>
						<FootIcon 
							size={32} 
							color={stateModeToTint(stateA.value, theme?.colors?.muted || '#9CA3AF')} 
							side='left' 
						/>
					</View>
					<View style={theme.viewStyles.deviceContent}>
						<Text style={[theme.textStyles.fatiguePercentage, { color: getFatigueColor(avgA) }]}>
							{avgA !== null ? `${Math.round(avgA)}%` : '--'}
						</Text>
					</View>
				</View>

				{/* Device B */}
				<View style={theme.viewStyles.deviceContainer}>
					<View style={theme.viewStyles.deviceHeader}>
						<FootIcon 
							size={32} 
							color={stateModeToTint(stateB.value, theme?.colors?.muted || '#9CA3AF')} 
							side='right' 
						/>
					</View>
					<View style={theme.viewStyles.deviceContent}>
						<Text style={[theme.textStyles.fatiguePercentage, { color: getFatigueColor(avgB) }]}>
							{avgB !== null ? `${Math.round(avgB)}%` : '--'}
						</Text>
					</View>
				</View>
			</View>
		</View>
	);
}
