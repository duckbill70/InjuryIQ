import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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
		<View style={[theme.viewStyles.panelContainer, { backgroundColor: 'white', opacity: 0.9 }]}>
			{/* Header */}
			<View style={theme.viewStyles.rowBetween}>
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Text style={[theme.textStyles.body2, theme.textStyles.bold]}>Session:</Text>
					<Text style={[theme.textStyles.body2, theme.textStyles.bold, { paddingLeft: 2 }]}>{toSentenceCase(sport)}</Text>
				</View>
				<View style={theme.viewStyles.rowCenter}>
					<Dot on={sessionActive} />
					<Text style={[theme.textStyles.xsmall, { marginLeft: 6 }]}>{sessionActive ? 'Collecting' : 'Idle'}</Text>
				</View>
			</View>

			{/* Devices */}
			<View style={[theme.viewStyles.rowBetween, { marginTop: 6 }]}>
				<View style={theme.viewStyles.deviceCol}>
					<View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '80%' }}>
						<Text style={[theme.textStyles.xsmall, theme.textStyles.mono, theme.textStyles.dim, { paddingRight: 8 }]}>Device A</Text>
						<Dot on={!!entryA?.id && stateA.value !== StateMode.Off} />
					</View>
					<Text style={theme.textStyles.body2}>{entryA?.device.name ?? '—'}</Text>
					<Text style={[theme.textStyles.xsmall, theme.textStyles.dim, { minWidth: 120, textAlign: 'left' }]}>
						{hzA.toFixed(1)} Hz • {lossA.toFixed(1)}% loss
					</Text>
				</View>

				<View style={theme.viewStyles.deviceCol}>
					<View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '80%' }}>
						<Text style={[theme.textStyles.xsmall, theme.textStyles.mono, theme.textStyles.dim, { paddingRight: 8 }]}>Device B</Text>
						<Dot on={!!entryB?.id && stateB.value !== StateMode.Off} />
					</View>
					<Text style={theme.textStyles.body2}>{entryB?.device.name ?? '—'}</Text>
					<Text style={[theme.textStyles.xsmall, theme.textStyles.dim, { minWidth: 120, textAlign: 'left' }]}>
						{hzB.toFixed(1)} Hz • {lossB.toFixed(1)}% loss
					</Text>
				</View>
			</View>

			{/* Controls */}
			<View style={[theme.viewStyles.rowCenter, { marginTop: 10, gap: 5, justifyContent: 'space-between' }]}>
				<TouchableOpacity
					onPress={() => startScan({ timeoutMs: 1500, maxDevices: 2 })}
					disabled={scanning || !isPoweredOn}
					style={[
						theme.viewStyles.actionButton,
						{
							backgroundColor: scanning ? 'grey' : theme.colors.primary,
							opacity: scanning ? 0.6 : 1,
						},
					]}
				>
					{scanning ? <BluetoothSearchingIcon size={18} color='white' /> : <Bluetooth size={18} color='white' />}
					<Text style={theme.textStyles.buttonLabel}>{scanning ? 'Scan' : 'Scan'}</Text>
				</TouchableOpacity>

				<View style={[theme.viewStyles.rowCenter, { gap: 5 }]}>
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
							theme.viewStyles.actionButton,
							{
								backgroundColor: !sessionActive ? theme.colors.teal : isPaused ? theme.colors.amber : theme.colors.teal, // Optional: different color when actively recording
								opacity: sessionActive && !isPaused ? 1 : 0.9,
							},
						]}
					>
						{!sessionActive ? (
							<>
								<Play size={18} color='white' />
								<Text style={theme.textStyles.buttonLabel}>Start</Text>
							</>
						) : isPaused ? (
							<>
								<Play size={18} color='white' />
								<Text style={theme.textStyles.buttonLabel}>Resume</Text>
							</>
						) : (
							<>
								<PauseIcon size={18} color='white' />
								<Text style={theme.textStyles.buttonLabel}>Pause</Text>
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
							theme.viewStyles.actionButton,
							{
								backgroundColor: !sessionActive ? theme.colors.muted : '#ef4444',
								opacity: !sessionActive ? 0.6 : 1,
							},
						]}
					>
						<Square size={18} color='white' />
						<Text style={theme.textStyles.buttonLabel}>Stop</Text>
					</TouchableOpacity>
				</View>
			</View>
		</View>
	);
}
