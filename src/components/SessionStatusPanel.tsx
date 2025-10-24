import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Play, Square, Pause as PauseIcon } from 'lucide-react-native';
import { BluetoothSearchingIcon, Bluetooth } from 'lucide-react-native';

import { useSession } from '../session/SessionProvider';
import { useBle } from '../ble/BleProvider';
import { useTheme } from '../theme/ThemeContext';
import { StateMode } from '../ble/useStateControl';
import { SportType } from '../session/types';

function Dot({ on = false, color }: { on?: boolean; color?: string }) {
	return (
		<View
			style={{
				width: 10,
				height: 10,
				borderRadius: 5,
				backgroundColor: color || (on ? '#22c55e' : '#9ca3af'),
			}}
		/>
	);
}

const sports: { value: SportType; label: string }[] = [
	{ value: 'running', label: 'Run' },
	{ value: 'hiking', label: 'Hike' },
	{ value: 'padel', label: 'Padel' },
	{ value: 'tennis', label: 'Tennis' },
];

export default function SessionStatusPanel() {
	const { theme } = useTheme();
	const { entryA, entryB, a, b, startRecording, stopRecording, sport, setSport, stateA, stateB, isPaused, togglePause, sessionActive } = useSession();
	const { scanning, startScan, isPoweredOn } = useBle();
	const [showSportModal, setShowSportModal] = useState(false);
	const [pendingRecordingStart, setPendingRecordingStart] = useState(false);
	const [targetSport, setTargetSport] = useState<SportType | null>(null);

	//const recording = !!(a?.collect || b?.collect);

	// Show actual Hz and loss stats unless device is disconnected, StateMode is Off, or StateMode is Amber
	const showStatsA = !!entryA?.id && stateA.value !== StateMode.Off && stateA.value !== StateMode.Amber;
	const showStatsB = !!entryB?.id && stateB.value !== StateMode.Off && stateB.value !== StateMode.Amber;
	
	const hzA = showStatsA ? (a?.stats.measuredHz ?? 0) : 0;
	const lossA = showStatsA ? (a?.stats.lossPercent ?? 0) : 0;
	const hzB = showStatsB ? (b?.stats.measuredHz ?? 0) : 0;
	const lossB = showStatsB ? (b?.stats.lossPercent ?? 0) : 0;

	// Determine dot colors - amber when StateMode.Amber, otherwise normal logic
	const dotColorA = stateA.value === StateMode.Amber ? '#FFB300' : undefined;
	const dotColorB = stateB.value === StateMode.Amber ? '#FFB300' : undefined;

	function toSentenceCase(str: string) {
		if (!str) return '';
		return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
	}

	const handleStartSession = () => {
		// Check if at least one device is present and in a valid recording state (not Off or Amber)
		if (!hasValidDevices) {
			return; // Don't show modal if no valid devices are available
		}
		setShowSportModal(true);
	};

	// Check if at least one device is connected and in a valid state (not Off or Amber)
	const hasValidDevices = !!(
		(entryA && stateA.value !== StateMode.Off && stateA.value !== StateMode.Amber) ||
		(entryB && stateB.value !== StateMode.Off && stateB.value !== StateMode.Amber)
	);

	// Effect to start recording when sport is properly set
	useEffect(() => {
		if (pendingRecordingStart && targetSport && sport === targetSport) {
			// Sport has been updated, now we can start recording
			setPendingRecordingStart(false);
			setTargetSport(null);
			startRecording();
		}
	}, [sport, pendingRecordingStart, targetSport, startRecording]);

	// Cleanup effect in case sport setting gets stuck
	useEffect(() => {
		if (pendingRecordingStart) {
			const timeout = setTimeout(() => {
				// If we're still waiting after 2 seconds, force start recording
				console.warn('Sport setting timeout, starting recording anyway');
				setPendingRecordingStart(false);
				setTargetSport(null);
				startRecording();
			}, 2000);

			return () => clearTimeout(timeout);
		}
	}, [pendingRecordingStart, startRecording]);

	const handleSportSelection = async (selectedSport: SportType) => {
		// Set the target sport and flag to start recording
		setTargetSport(selectedSport);
		setSport(selectedSport);
		setShowSportModal(false);
		setPendingRecordingStart(true);
		// Recording will start automatically via useEffect when sport is updated
	};

	return (
		<View style={[theme.viewStyles.panelContainer, { backgroundColor: 'white', opacity: 0.9 }]}>
			{/* Sport Selection Modal */}
			<Modal
				visible={showSportModal}
				transparent={true}
				animationType="fade"
				onRequestClose={() => setShowSportModal(false)}
			>
				<View style={{
					flex: 1,
					backgroundColor: 'rgba(0, 0, 0, 0.5)',
					justifyContent: 'center',
					alignItems: 'center',
					padding: 20,
				}}>
					<View style={{
						backgroundColor: 'white',
						borderRadius: 12,
						padding: 20,
						width: '90%',
						maxWidth: 200,
						alignItems: 'center',
					}}>
						<View style={{ gap: 12, width: '100%', alignItems: 'center' }}>
							{sports.map(({ value, label }) => (
								<TouchableOpacity
									key={value}
									onPress={() => handleSportSelection(value)}
									style={[theme.viewStyles.actionButton, {
										backgroundColor: value === sport ? theme.colors.teal : theme.colors.muted,
										borderColor: value === sport ? theme.colors.teal : theme.colors.muted,
									}]}
								>
									<Text style={theme.textStyles.buttonLabel}>{label}</Text>
								</TouchableOpacity>
							))}
						</View>

						<TouchableOpacity
							onPress={() => setShowSportModal(false)}
							style={[theme.viewStyles.actionButton, {
								backgroundColor: theme.colors.amber,
								marginTop: 16,
							}]}
						>
							<Text style={theme.textStyles.buttonLabel}>Cancel</Text>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>

			{/* Header */}
			<View style={theme.viewStyles.rowBetween}>
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Text style={[theme.textStyles.body2, theme.textStyles.bold]}>Session:</Text>
					<Text style={[theme.textStyles.body2, theme.textStyles.bold, { paddingLeft: 2 }]}>{toSentenceCase(sport)}</Text>
				</View>
				<View style={theme.viewStyles.rowCenter}>
					<Dot on={sessionActive} />
					<Text style={[theme.textStyles.body2, { marginLeft: 6 }]}>{sessionActive ? 'Collecting' : 'Idle'}</Text>
				</View>
			</View>

			{/* Devices */}
			<View style={[theme.viewStyles.rowBetween, { marginTop: 6 }]}>
				<View style={theme.viewStyles.deviceCol}>
					<View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '80%' }}>
						<Text style={[theme.textStyles.body2, theme.textStyles.mono, theme.textStyles.dim, { paddingRight: 8 }]}>Device A</Text>
						<Dot on={!!entryA?.id && stateA.value !== StateMode.Off} color={dotColorA} />
					</View>
					<Text style={theme.textStyles.body2}>{entryA?.device.name ?? '—'}</Text>
					<Text style={[theme.textStyles.body2, theme.textStyles.dim, { minWidth: 120, textAlign: 'left' }]}>
						{hzA.toFixed(1)} Hz • {lossA.toFixed(1)}% loss
					</Text>
				</View>

				<View style={theme.viewStyles.deviceCol}>
					<View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '80%' }}>
						<Text style={[theme.textStyles.body2, theme.textStyles.mono, theme.textStyles.dim, { paddingRight: 8 }]}>Device B</Text>
						<Dot on={!!entryB?.id && stateB.value !== StateMode.Off} color={dotColorB} />
					</View>
					<Text style={theme.textStyles.body2}>{entryB?.device.name ?? '—'}</Text>
					<Text style={[theme.textStyles.body2, theme.textStyles.dim, { minWidth: 120, textAlign: 'left' }]}>
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
								handleStartSession();
							} else {
								togglePause();
							}
						}}
						disabled={!sessionActive && !hasValidDevices}
						style={[
							theme.viewStyles.actionButton,
							{
								backgroundColor: !sessionActive ? 
									(hasValidDevices ? theme.colors.teal : theme.colors.muted) : 
									(isPaused ? theme.colors.amber : theme.colors.teal),
								opacity: (!sessionActive && !hasValidDevices) || (sessionActive && !isPaused) ? 0.6 : 1,
								minWidth: 120
							},
						]}
					>
						{!sessionActive ? (
							<>
								<Play size={18} color='white' />
								<Text style={theme.textStyles.buttonLabel}>
									{hasValidDevices ? 'Start' : 'No Devices'}
								</Text>
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
								minWidth: 120,
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
