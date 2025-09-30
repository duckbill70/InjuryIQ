import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';

import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeContext';

import { SportType } from '../session/types';

interface SportSegmentedControlProps {
	sport: SportType;
	setSport: (sport: SportType) => void;
	recording: boolean;
	btntheme: any; // Replace with your actual theme type if available
}

const sports: { value: SportType; label: string }[] = [
	{ value: 'running', label: 'Run' },
	{ value: 'hiking', label: 'Hike' },
	{ value: 'padel', label: 'Padel' },
	{ value: 'tennis', label: 'Tennis' },
];

function SportSegmentedControl({ sport, setSport, recording, btntheme }: SportSegmentedControlProps) {

	const { theme } = useTheme();

	return (
		<View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', gap: 10 }}>
			{sports.map(({ value, label }) => (
				<TouchableOpacity
					key={value}
					style={[btntheme.btn, {
						flex: 1,
						alignItems: 'center',
						backgroundColor: value === sport ? theme?.colors?.teal : theme?.colors?.muted,
						borderColor: value === sport ? theme?.colors?.teal : theme?.colors?.muted,
						opacity: recording ? 0.6 : 1,
						justifyContent: 'center'
					}]}
					onPress={() => setSport(value)}
					disabled={recording}
				>
					<Text style={btntheme.btnLabel}>{label}</Text>
				</TouchableOpacity>
			))}
		</View>
	);
}

export default function SportStatusPanel() {
	//const { theme } = useTheme();
	const { a, b } = useSession();

	// sport
	const { sport, setSport } = useSession();

	const recording = !!(a?.collect || b?.collect);

	return (
		<View style={[styles.card, { backgroundColor: 'white', opacity: 0.9 }]}>
			{/*--- Sport? ---*/}
			<SportSegmentedControl sport={sport} setSport={setSport} recording={recording} btntheme={styles} />
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
