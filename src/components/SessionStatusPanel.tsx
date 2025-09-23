import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, Square } from 'lucide-react-native';

import { useSession } from '../session/SessionProvider';

import { useTheme } from '../theme/ThemeContext';

function Dot({ on = false }: { on?: boolean }) {
	return (
		<View
			style={{
				width: 10,
				height: 10,
				borderRadius: 5,
				backgroundColor: on ? '#22c55e' : '#9ca3af',
			}}
		/>
	);
}

export default function SessionStatusPanel() {
	const { theme } = useTheme();
	const { entryA, entryB, a, b, startRecording, stopRecording, sport } = useSession();

	const recording = !!(a?.collect || b?.collect);

	const hzA = a?.stats.measuredHz ?? 0;
	const lossA = a?.stats.lossPercent ?? 0;
	const hzB = b?.stats.measuredHz ?? 0;
	const lossB = b?.stats.lossPercent ?? 0;

	function toSentenceCase(str: string) {
	if (!str) return '';
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
	}


	return (
		<View style={[styles.card, { backgroundColor: 'white', opacity: 0.9 }]}>
			{/* Header */}
			<View style={styles.rowBetween}>
				<View style={{ flexDirection: 'row', alignItems: 'center'}}>
				<Text style={[theme.textStyles.body2, styles.bold]}>Session:</Text>
				<Text style={[theme.textStyles.body2, styles.bold, {paddingLeft: 2}]}>{toSentenceCase(sport)}</Text>
				</View>
				<View style={styles.rowCenter}>
					<Dot on={recording} />
					<Text style={[theme.textStyles.xsmall, { marginLeft: 6 }]}>{recording ? 'Collecting' : 'Idle'}</Text>
				</View>
			</View>

			{/* Devices */}
			<View style={[styles.rowBetween, { marginTop: 6 }]}>
				<View style={styles.deviceCol}>
					<View style={{flexDirection: 'row', alignItems: 'center'}}>
						<Text style={[theme.textStyles.xsmall, styles.mono, styles.dim, {paddingRight: 4}]}>Device A</Text>
						<Dot on={recording} />
					</View>
					<Text style={theme.textStyles.body2}>{entryA?.device.name ?? '—'}</Text>
					<Text style={[theme.textStyles.xsmall, styles.dim]}>
						{hzA.toFixed(1)} Hz • {lossA.toFixed(1)}% loss
					</Text>
				</View>

				<View style={styles.deviceCol}>
					<Text style={[theme.textStyles.xsmall, styles.mono, styles.dim]}>Device B</Text>
					<Text style={theme.textStyles.body2}>{entryB?.device.name ?? '—'}</Text>
					<Text style={[theme.textStyles.xsmall, styles.dim]}>
						{hzB.toFixed(1)} Hz • {lossB.toFixed(1)}% loss
					</Text>
				</View>
			</View>

			{/* Controls */}
			<View style={[styles.rowCenter, { marginTop: 10, gap: 12 }]}>
				<TouchableOpacity
					onPress={startRecording}
					disabled={recording}
					style={[
						styles.btn,
						{
							backgroundColor: recording ? theme.colors.muted : theme.colors.primary,
							opacity: recording ? 0.6 : 1,
						},
					]}
				>
					<Play size={18} color='white' />
					<Text style={[styles.btnLabel]}>Start</Text>
				</TouchableOpacity>

				<TouchableOpacity
					onPress={stopRecording}
					disabled={!recording}
					style={[
						styles.btn,
						{
							backgroundColor: !recording ? theme.colors.muted : '#ef4444',
							opacity: !recording ? 0.6 : 1,
						},
					]}
				>
					<Square size={18} color='white' />
					<Text style={styles.btnLabel}>Stop</Text>
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
