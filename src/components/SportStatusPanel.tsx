import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';

import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeContext';

export default function SportStatusPanel() {
	const { theme } = useTheme();
	const { a, b } = useSession();

	// sport
	const { sport, setSport } = useSession();

	const recording = !!(a?.collect || b?.collect);

	return (
		<View style={[styles.card, { backgroundColor: 'white', opacity: 0.9 }]}>
			{/*--- Sport? ---*/}
			<SegmentedButtons
				value={sport}
				onValueChange={setSport}
				buttons={[
					{ value: 'hiking', label: 'Hike', disabled: recording },
					{ value: 'running', label: 'Run', disabled: recording },
					{ value: 'padel', label: 'Padel', disabled: recording },
					{ value: 'tennis', label: 'Tennis', disabled: recording },
				]}
				theme={{
					colors: {
						// selected segment background & label/icon
						secondaryContainer: theme?.colors?.primary,
						onSecondaryContainer: theme?.colors?.white,
						// container/segment outlines
						outline: theme?.colors?.muted,
						onSurface: theme?.colors?.muted,
					},
				}}
			/>
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
