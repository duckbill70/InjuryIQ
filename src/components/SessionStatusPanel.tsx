import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, Square, Pause as PauseIcon } from 'lucide-react-native';
import { BluetoothSearchingIcon, Bluetooth } from 'lucide-react-native';

import { useSession } from '../session/SessionProvider';
import { useBle } from '../ble/BleProvider';
import { useTheme } from '../theme/ThemeContext';
import { StateMode } from '../ble/useStateControl';

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
	const { entryA, entryB, a, b, startRecording, stopRecording, sport, stateA, stateB, isPaused, togglePause, sessionActive, collecting } = useSession();
	const { scanning, startScan, isPoweredOn } = useBle();

	//const recording = !!(a?.collect || b?.collect);

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
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Text style={[theme.textStyles.body2, styles.bold]}>Session:</Text>
					<Text style={[theme.textStyles.body2, styles.bold, { paddingLeft: 2 }]}>{toSentenceCase(sport)}</Text>
				</View>
				<View style={styles.rowCenter}>
					<Dot on={sessionActive} />
					<Text style={[theme.textStyles.xsmall, { marginLeft: 6 }]}>{sessionActive ? 'Collecting' : 'Idle'}</Text>
				</View>
			</View>

			{/* Devices */}
			<View style={[styles.rowBetween, { marginTop: 6 }]}>
				<View style={styles.deviceCol}>
					<View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '80%' }}>
						<Text style={[theme.textStyles.xsmall, styles.mono, styles.dim, { paddingRight: 8 }]}>Device A</Text>
						<Dot on={!!entryA?.id && stateA.value !== StateMode.Off} />
					</View>
					<Text style={theme.textStyles.body2}>{entryA?.device.name ?? '—'}</Text>
					<Text style={[theme.textStyles.xsmall, styles.dim, { minWidth: 120, textAlign: 'left' }]}>
						{hzA.toFixed(1)} Hz • {lossA.toFixed(1)}% loss
					</Text>
				</View>

				<View style={styles.deviceCol}>
					<View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '80%' }}>
						<Text style={[theme.textStyles.xsmall, styles.mono, styles.dim, { paddingRight: 8 }]}>Device B</Text>
						<Dot on={!!entryB?.id && stateB.value !== StateMode.Off} />
					</View>
					<Text style={theme.textStyles.body2}>{entryB?.device.name ?? '—'}</Text>
					<Text style={[theme.textStyles.xsmall, styles.dim, { minWidth: 120, textAlign: 'left' }]}>
						{hzB.toFixed(1)} Hz • {lossB.toFixed(1)}% loss
					</Text>
				</View>
			</View>

			{/* Controls */}
			<View style={[styles.rowCenter, { marginTop: 10, gap: 5, justifyContent: 'space-between' }]}>
				<TouchableOpacity
					onPress={() => startScan({ timeoutMs: 1500, maxDevices: 2 })}
					disabled={scanning || !isPoweredOn}
					style={[
						styles.btn,
						{
							backgroundColor: scanning ? 'grey' : theme.colors.primary,
							opacity: scanning ? 0.6 : 1,
						},
					]}
				>
					{scanning ? <BluetoothSearchingIcon size={18} color='white' /> : <Bluetooth size={18} color='white' />}
					<Text style={[styles.btnLabel]}>{scanning ? 'Scan' : 'Scan'}</Text>
				</TouchableOpacity>

				<View style={[styles.rowCenter, { gap: 5 }]}>
					{/* NEW: Start & Puse */}
					<TouchableOpacity
						onPress={() => {
							if (!sessionActive) {
								startRecording();
							} else {
								togglePause();
							}
						}}
						style={[
							styles.btn,
							{
								backgroundColor: !sessionActive ? theme.colors.teal : isPaused ? theme.colors.amber : theme.colors.teal, // Optional: different color when actively recording
								opacity: sessionActive && !isPaused ? 1 : 0.9,
							},
						]}
					>
						{!sessionActive ? (
							<>
								<Play size={18} color='white' />
								<Text style={styles.btnLabel}>Start</Text>
							</>
						) : isPaused ? (
							<>
								<Play size={18} color='white' />
								<Text style={styles.btnLabel}>Resume</Text>
							</>
						) : (
							<>
								<PauseIcon size={18} color='white' />
								<Text style={styles.btnLabel}>Pause</Text>
							</>
						)}
					</TouchableOpacity>

					{/* NEW: Pause/Resume 
					<TouchableOpacity
						onPress={togglePause}
						disabled={!sessionActive}
						style={[
							styles.btn,
							{
								backgroundColor: !sessionActive ? theme.colors.muted : theme.colors.primary,
								opacity: !sessionActive ? 0.6 : 1,
							},
						]}
					>
						{isPaused ? <Play size={18} color='white' /> : <PauseIcon size={18} color='white' />}
						<Text style={styles.btnLabel}>{isPaused ? 'Paused' : 'Pause'}</Text>
					</TouchableOpacity> */}

					{/* NEW: Stop */}
					<TouchableOpacity
						onPress={stopRecording}
						disabled={!sessionActive}
						style={[
							styles.btn,
							{
								backgroundColor: !sessionActive ? theme.colors.muted : '#ef4444',
								opacity: !sessionActive ? 0.6 : 1,
							},
						]}
					>
						<Square size={18} color='white' />
						<Text style={styles.btnLabel}>Stop</Text>
					</TouchableOpacity>
				</View>
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
	rowCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	deviceCol: { maxWidth: '48%' },
	bold: { fontWeight: '700' },
	dim: { color: '#6b7280' },
	mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
	btn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 5,
		paddingVertical: 8,
		//paddingHorizontal: 8,
		borderRadius: 10,
		width: 120,
	},
	btnLabel: { color: 'white', fontWeight: '600' },
});
