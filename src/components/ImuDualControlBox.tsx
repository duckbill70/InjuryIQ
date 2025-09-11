// components/ImuDualControlBox.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, TouchableOpacity } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeContext';
import { useDualImu } from '../imu/DualImuProvider';
import { useStateControl, StateMode, stateModeLabel } from '../ble/useStateControl';
import { CombinedWriter, createCombinedImuWriter, shareLastSessionFile, Sport } from '../imu/combinedImuWriter';
//import { createCombinedImuWriter } from '../imu/combinedImuWriter';
//import { shareLastSessionFile } from '../imu/combinedImuWriter';

import { Play, Square, ArrowLeftRight } from 'lucide-react-native';
import { SegmentedButtons } from 'react-native-paper';
import { DataTable } from 'react-native-paper';

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

export default function ImuDualControlBox({ writerRef, expectedHz = 60 }: { writerRef: React.MutableRefObject<CombinedWriter | null>; expectedHz?: number }) {
	const { a, b, entryA, entryB, startAll, stopAll, setCollectAll, drainAll } = useDualImu();

	const recording = !!(a?.collect || b?.collect);

	// State control hooks per device (LED/state service)
	const stateA = useStateControl(entryA, { subscribe: true });
	const stateB = useStateControl(entryB, { subscribe: true });

	// garb the user info
	const { user } = useAuth();

	//get the theme
	const { theme } = useTheme();

	// sport
	const [sport, setSport] = useState<Sport>('running');

	useEffect(() => {
		if (__DEV__) console.log(`[Sport] Updated : ${sport}`);
	}, [sport]);

	const onStart = async () => {
		if (recording) {
			if (__DEV__) console.log('[CTRL] start(): already recording — noop');
			return;
		}

		// Prepare writer first so the BLE callback can append immediately
		try {
			writerRef.current = createCombinedImuWriter({
				sessionName: 'imu_both',
				expectedHz,
				idA: entryA?.id,
				idB: entryB?.id,
				// onf off metadata for header
				meta: {
					user: {
						uid: user?.uid ?? null,
						email: user?.email ?? null,
					},
					initialState: {
						A: stateA.value ?? null,
						B: stateB.value ?? null,
					},
					sport,
				},
			});

			//Send the *current* state snapshot BEFORE starting/collecting
			//writerRef.current.setStateA(stateA.value ?? null)
			//writerRef.current.setStateB(stateB.value ?? null)

			await writerRef.current.start();
			if (__DEV__) console.log('[CTRL] writer started at', writerRef.current.path);
		} catch (err) {
			if (__DEV__) console.error('[CTRL] writer start failed:', err);
			writerRef.current = null; // safety
			return; // bail; no point collecting without a writer
		}

		// Make sure both sides are subscribed (safe if already streaming)
		try {
			startAll();
		} catch (err) {
			if (__DEV__) console.error('[CTRL] startAll() error:', err);
		}

		// Now flip collection on so monitor callbacks will write
		setCollectAll(true);
	};

	const onStop = async () => {
		// Stop collecting first so no more appends race with drain/stop
		setCollectAll(false);

		// Drain any tail buffers to avoid 0-row files
		try {
			const { a: tailA, b: tailB } = drainAll();
			writerRef.current?.onBatchA?.(tailA);
			writerRef.current?.onBatchB?.(tailB);
			if (__DEV__)
				console.log('[CTRL] drained tails', {
					a: tailA?.length ?? 0,
					b: tailB?.length ?? 0,
				});
		} catch (err) {
			if (__DEV__) console.error('[CTRL] drainAll() error:', err);
		}

		// Tear down BLE subscriptions
		try {
			stopAll();
		} catch (err) {
			if (__DEV__) console.error('[CTRL] stopAll() error:', err);
		}

		// Flush & close writer
		try {
			const summary = await writerRef.current?.stop();
			if (__DEV__) console.log('[CTRL] writer stopped', summary);
		} catch (err) {
			if (__DEV__) console.error('[CTRL] writer stop failed:', err);
		} finally {
			writerRef.current = null;
		}
	};

	// Safety: stop on unmount if still recording
	useEffect(() => {
		return () => {
			try {
				setCollectAll(false);
				stopAll();
			} catch {
				/* ignore */
			}
			// Best-effort writer close (can't await in cleanup)
			writerRef.current?.stop?.();
			writerRef.current = null;
			if (__DEV__) console.log('[CTRL] cleanup complete');
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Push state changes into the writer (if started)
	useEffect(() => {
		if (writerRef.current) writerRef.current.setStateA?.(stateA.value ?? null);
	}, [stateA.value, writerRef]);

	useEffect(() => {
		if (writerRef.current) writerRef.current.setStateB?.(stateB.value ?? null);
	}, [stateB.value, writerRef]);

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

	const sportyTheme = {
		colors: {
			// selected segment background & label/icon
			secondaryContainer: '#0ea5e9',
			onSecondaryContainer: '#ffffff',
			// container/segment outlines
			outline: '#0ea5e9',
		},
	};

	return (
		<View style={{ flexDirection: 'column', columnGap: 10 }}>
			{/* --- Start & Stop Control */}
			<View
				style={[
					styles.card,
					{
						flexDirection: 'column',
						backgroundColor: `${theme?.colors?.black ?? '#000000'}CC`, //80% Opacity on black
						alignContent: 'center',
						justifyContent: 'center',
						opacity: 1,
					},
				]}
			>
				<View
					style={{
						flexDirection: 'row',
						justifyContent: 'center',
						alignContent: 'center',
						rowGap: 20,
					}}
				>
					{/*--- Stop ---*/}
					<TouchableOpacity disabled={!recording} onPress={onStop}>
						<Square color={!recording ? theme?.colors?.muted : 'white'} size={50} />
					</TouchableOpacity>

					{/*--- Start ---*/}
					<TouchableOpacity disabled={recording} onPress={onStart}>
						<Play color={!recording ? 'white' : theme?.colors?.muted} size={50} />
					</TouchableOpacity>
				</View>

				{/*--- Sport? ---*/}
				<SegmentedButtons
					value={sport}
					onValueChange={setSport}
					buttons={[
						{ value: 'hiking', label: 'Hike', disabled: recording, },
						{ value: 'running', label: 'Run', disabled: recording, },
						{ value: 'padel', label: 'Padel', disabled: recording, },
						{ value: 'tennis', label: 'Tennis', disabled: recording, },
					]}
					theme={{
						colors: {
							// selected segment background & label/icon
							secondaryContainer: theme?.colors?.white,
							onSecondaryContainer: theme?.colors?.black,
							// container/segment outlines
							outline: theme?.colors?.white,
							onSurface: theme?.colors?.muted,
						},
					}}
				/>
			</View>

			{/* --- Location Control (ble : state ) */}
			<View style={[ styles.card, { flexDirection: 'column', backgroundColor: theme?.colors?.black, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }, ]} >
				<View style={{ flexDirection: 'row', }} >
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

			{/*--- Sats? ---*/}
			<View style={[ styles.card, { flexDirection: 'column', backgroundColor: theme?.colors?.black, alignItems: 'center', justifyContent: 'center', paddingLeft: 20, paddingRight: 20, paddingTop: 10, paddingBottom: 30 }, ]} >
					<DataTable>

						<DataTable.Header>
							<DataTable.Title>
								<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white, fontWeight: 'bold' }]}>Device</Text>
							</DataTable.Title>
							<DataTable.Title style={{ justifyContent: 'flex-end' }}>
								<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white, fontWeight: 'bold' }]}>Rate(Hz)</Text>
							</DataTable.Title>
							<DataTable.Title style={{ justifyContent: 'flex-end' }}>
								<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white, fontWeight: 'bold' }]}>Loss(%)</Text>
							</DataTable.Title>
						</DataTable.Header>

						<DataTable.Row>
							<DataTable.Cell>
								<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white }]}>{entryA?.device.name}</Text>
							</DataTable.Cell>
							<DataTable.Cell numeric>
								<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white }]}>{a?.stats.measuredHz != null ? a.stats.measuredHz.toFixed(1) : '—'}</Text>
							</DataTable.Cell>
							<DataTable.Cell numeric>
								<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white }]}>{a?.stats.lossPercent != null ? a.stats.lossPercent.toFixed(1) : '—'}</Text>
							</DataTable.Cell>
						</DataTable.Row>

						<DataTable.Row>
							<DataTable.Cell>
								<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white }]}>{entryB?.device.name}</Text>
							</DataTable.Cell>
							<DataTable.Cell numeric>
								<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white }]}>{b?.stats.measuredHz != null ? b.stats.measuredHz.toFixed(1) : '—'}</Text>
							</DataTable.Cell>
							<DataTable.Cell numeric>
								<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white }]}>{b?.stats.lossPercent != null ? b.stats.lossPercent.toFixed(1) : '—'}</Text>
							</DataTable.Cell>
						</DataTable.Row>

					</DataTable>
			</View>

			<View style={styles.card}>
				<Text style={styles.h1}>IMU Control (Both Devices)</Text>

				<View style={styles.row}>
					<SmallBtn label='Export Last Session' onPress={shareLastSessionFile} />
				</View>

				<View
					style={{
						flex: 1,
						flexDirection: 'row',
						justifyContent: 'space-between',
					}}
				>
					{/* Device A controls */}
					<View>
						<Section
							title='Device A'
							rate={a?.stats.measuredHz}
							loss={a?.stats.lossPercent}
							stateValue={stateA.value}
							setStateMode={stateA.setStateMode}
							supported={!!stateA.supported}
							pauseResume={a ? (a.isStreaming ? a.stop : a.start) : undefined}
							resetStats={a?.resetStats}
							flush={a?.flush}
						/>
					</View>

					{/* Device B controls */}
					<View>
						<Section
							title='Device B'
							rate={b?.stats.measuredHz}
							loss={b?.stats.lossPercent}
							stateValue={stateB.value}
							setStateMode={stateB.setStateMode}
							supported={!!stateB.supported}
							pauseResume={b ? (b.isStreaming ? b.stop : b.start) : undefined}
							resetStats={b?.resetStats}
							flush={b?.flush}
						/>
					</View>
				</View>
			</View>
		</View>
	);
}

function Section({
	title,
	rate,
	loss,
	stateValue,
	setStateMode,
	supported,
	pauseResume,
	resetStats,
	flush,
}: {
	title: string;
	rate?: number;
	loss?: number;
	stateValue: number | null | undefined;
	setStateMode?: (m: number) => Promise<void>;
	supported: boolean;
	pauseResume?: () => void;
	resetStats?: () => void;
	flush?: () => void;
}) {
	return (
		<View style={styles.section}>
			<Text style={styles.h2}>{title}</Text>
			<Text>Rate: {rate != null ? `${rate.toFixed(1)} Hz` : '—'}</Text>
			<Text>Loss: {loss != null ? `${loss.toFixed(1)}%` : '—'}</Text>

			<Text>State: {supported ? stateModeLabel(stateValue) : 'N/A'}</Text>

			<View style={styles.btnRow}>
				<SmallBtn label='Amber' onPress={() => setStateMode?.(StateMode.Amber)} />
				<SmallBtn label='Red' onPress={() => setStateMode?.(StateMode.Red)} />
				<SmallBtn label='Green' onPress={() => setStateMode?.(StateMode.Green)} />
				<SmallBtn label='Blue' onPress={() => setStateMode?.(StateMode.Blue)} />
				<SmallBtn label='Off' onPress={() => setStateMode?.(StateMode.Off)} />
				{pauseResume && <SmallBtn label='Pause/Resume' onPress={pauseResume} />}
				{resetStats && <SmallBtn label='Reset Stats' onPress={resetStats} />}
				{flush && <SmallBtn label='Flush' onPress={flush} />}
			</View>
		</View>
	);
}

function SmallBtn({ label, onPress }: { label: string; onPress?: () => void }) {
	return (
		<Text onPress={onPress} style={styles.btn}>
			{label}
		</Text>
	);
}

const styles = StyleSheet.create({
	card: {
		padding: 12,
		borderWidth: 1,
		borderColor: '#e5e7eb',
		borderRadius: 12,
		gap: 8,
		backgroundColor: 'white',
		opacity: 0.8,
		margin: 10,
	},
	h1: { fontSize: 16, fontWeight: '700' },
	h2: { fontSize: 14, fontWeight: '700', marginTop: 8 },
	row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 },
	label: { color: '#6b7280' },
	section: { marginTop: 6, gap: 4 },
	btnRow: { flexDirection: 'column', flexWrap: 'wrap', gap: 6, marginTop: 4 },
	btn: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		backgroundColor: '#1e90ff',
		color: 'white',
		borderRadius: 6,
	},
});
