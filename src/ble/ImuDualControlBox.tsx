// components/ImuDualControlBox.tsx
import React, { useEffect } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useDualImu } from './DualImuProvider';
import { useStateControl, StateMode, stateModeLabel } from './useStateControl';
import { CombinedWriter } from './combinedImuWriter';
import { createCombinedImuWriter } from './combinedImuWriter';
import { shareLastSessionFile } from './combinedImuWriter';

export default function ImuDualControlBox({
	writerRef,
	expectedHz = 60,
}: {
	writerRef: React.MutableRefObject<CombinedWriter | null>;
	expectedHz?: number;
}) {
	const { a, b, entryA, entryB, startAll, stopAll, setCollectAll, drainAll } =
		useDualImu();

	const recording = !!(a?.collect || b?.collect);

	// State control hooks per device (LED/state service)
	const stateA = useStateControl(entryA, { subscribe: true });
	const stateB = useStateControl(entryB, { subscribe: true });

	const onStart = async () => {
		if (recording) {
			if (__DEV__)
				console.log('[CTRL] start(): already recording — noop');
			return;
		}

		// Prepare writer first so the BLE callback can append immediately
		try {
			writerRef.current = createCombinedImuWriter({
				sessionName: 'imu_both',
				expectedHz,
				idA: entryA?.id,
				idB: entryB?.id,
			});

            //Send the *current* state snapshot BEFORE starting/collecting
            writerRef.current.setStateA(stateA.value ?? null)
            writerRef.current.setStateB(stateB.value ?? null)

			await writerRef.current.start();
			if (__DEV__)
				console.log('[CTRL] writer started at', writerRef.current.path);
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
		if (writerRef.current)
			writerRef.current.setStateA?.(stateA.value ?? null);
	}, [stateA.value, writerRef]);

	useEffect(() => {
		if (writerRef.current)
			writerRef.current.setStateB?.(stateB.value ?? null);
	}, [stateB.value, writerRef]);

	return (
		<View style={styles.card}>
			<Text style={styles.h1}>IMU Control (Both Devices)</Text>

			<View style={styles.row}>
				{recording ? (
					<Button title='Stop' onPress={onStop} />
				) : (
					<Button title='Start' onPress={onStart} />
				)}
			</View>

			<View style={styles.row}>
				<SmallBtn
					label='Export Last Session'
					onPress={shareLastSessionFile}
				/>
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
						pauseResume={
							a ? (a.isStreaming ? a.stop : a.start) : undefined
						}
					/>
					<SmallBtn label='Reset Stats' onPress={a?.resetStats} />
					<SmallBtn label='Flush' onPress={a?.flush} />
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
						pauseResume={
							b ? (b.isStreaming ? b.stop : b.start) : undefined
						}
					/>
					<SmallBtn label='Reset Stats' onPress={b?.resetStats} />
					<SmallBtn label='Flush' onPress={b?.flush} />
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
}: {
	title: string;
	rate?: number;
	loss?: number;
	stateValue: number | null | undefined;
	setStateMode?: (m: number) => Promise<void>;
	supported: boolean;
	pauseResume?: () => void;
}) {
	return (
		<View style={styles.section}>
			<Text style={styles.h2}>{title}</Text>
			<Text>Rate: {rate != null ? `${rate.toFixed(1)} Hz` : '—'}</Text>
			<Text>Loss: {loss != null ? `${loss.toFixed(1)}%` : '—'}</Text>

			<Text>State: {supported ? stateModeLabel(stateValue) : 'N/A'}</Text>

			<View style={styles.btnRow}>
				<SmallBtn
					label='Amber'
					onPress={() => setStateMode?.(StateMode.Amber)}
				/>
				<SmallBtn
					label='Red'
					onPress={() => setStateMode?.(StateMode.Red)}
				/>
				<SmallBtn
					label='Green'
					onPress={() => setStateMode?.(StateMode.Green)}
				/>
				<SmallBtn
					label='Blue'
					onPress={() => setStateMode?.(StateMode.Blue)}
				/>
				<SmallBtn
					label='Off'
					onPress={() => setStateMode?.(StateMode.Off)}
				/>
				{pauseResume && (
					<SmallBtn label='Pause/Resume' onPress={pauseResume} />
				)}
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
