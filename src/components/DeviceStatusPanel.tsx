import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';

import { useSession } from '../session/SessionProvider';
import { useStateControl, StateMode } from '../ble/useStateControl';
import { useTheme } from '../theme/ThemeContext';
import FootIcon from './FootIcon';

const modeSequence = [
	//StateMode.Amber,
	//StateMode.RedPulse,
	//StateMode.GreenPulse,
	//StateMode.BluePulse,
	StateMode.Red,
	StateMode.Green,
	//StateMode.Blue,
	//StateMode.Off,
];

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

export default function DeviceStatusPanel() {
	const { theme } = useTheme();
	const { entryA, entryB, a, b } = useSession();
	// State control hooks per device (LED/state service)
	const stateA = useStateControl(entryA, { subscribe: true });
	const stateB = useStateControl(entryB, { subscribe: true });

	const recording = !!(a?.collect || b?.collect);

	return (
		<View style={[styles.card, { backgroundColor: 'white', opacity: 0.9 }]}>
			<View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
				{/*--- Left Foot ---*/}
				<TouchableOpacity
					disabled={recording}
					onPress={() => {
						const currentIndex = modeSequence.indexOf(stateA.value ?? StateMode.Off);
						const nextIndex = (currentIndex + 1) % modeSequence.length;
						const nextMode = modeSequence[nextIndex];
						stateA.setStateMode?.(nextMode);
						if (__DEV__) console.log(`stateA.value: ${nextMode}`);
					}}
				>
					<FootIcon size={150} color={stateModeToTint(stateA.value, theme?.colors?.muted)} side='left' />
				</TouchableOpacity>

				{/*--- Right Foot ---*/}
				<TouchableOpacity
					disabled={recording}
					onPress={() => {
						const currentIndex = modeSequence.indexOf(stateB.value ?? StateMode.Off);
						const nextIndex = (currentIndex + 1) % modeSequence.length;
						const nextMode = modeSequence[nextIndex];
						stateB.setStateMode?.(nextMode);
						if (__DEV__) console.log(`stateB.value: ${nextMode}`);
					}}
				>
					<FootIcon size={150} color={stateModeToTint(stateB.value, theme?.colors?.muted)} side='right' />
				</TouchableOpacity>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 12,
		padding: 12,
		borderWidth: 1,
		borderColor: '#e5e7eb',
	},
	rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	rowCenter: { flexDirection: 'row', alignItems: 'center' },
	deviceCol: { maxWidth: '48%' },
	bold: { fontWeight: '700' },
	dim: { color: '#6b7280' },
	mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
	btn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 10,
	},
	btnLabel: { color: 'white', fontWeight: '600' },
});
