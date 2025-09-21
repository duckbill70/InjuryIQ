import React, { createContext, useContext, useMemo, useRef, useState, useCallback, ReactNode } from 'react';
import { useBle } from '../ble/BleProvider';
import { useStateControl } from '../ble/useStateControl';
import { DualImuProvider, useDualImu } from '../imu/DualImuProvider';
import { createCombinedImuWriter, type CombinedWriter, type RawPacket } from '../imu/combinedImuWriter';
import { useAuth } from '../auth/AuthProvider';
import { useFatigueValue } from '../ble/useFatigueValue';

type SessionCtx = {
	writerRef: React.MutableRefObject<CombinedWriter | null>;
	expectedHz: number;
	entryA?: ReturnType<typeof useDualImu>['entryA'];
	entryB?: ReturnType<typeof useDualImu>['entryB'];
	isCollecting: boolean;
	startRecording: () => Promise<void>;
	stopRecording: () => Promise<void>;
	a: ReturnType<typeof useDualImu>['a'];
	b: ReturnType<typeof useDualImu>['b'];
	sport: SportType;
	setSport: (sport: SportType) => void;
	fatigueA?: number | null;
	fatigueB?: number | null;
};

type SportType = 'hiking' | 'running' | 'tennis' | 'padel';

const SessionContext = createContext<SessionCtx | null>(null);

export const useSession = () => {
	const v = useContext(SessionContext);
	if (!v) throw new Error('useSession must be used within <SessionProvider>');
	return v;
};

export function SessionProvider({ children, expectedHz = 60 }: { children: ReactNode; expectedHz?: number }) {
	const { connected } = useBle();
	const { user } = useAuth();
	const arr = Object.values(connected);
	const devA = arr[0];
	const devB = arr[1];
	const writerRef = useRef<CombinedWriter | null>(null);

	// Get fatigue values for both devices
	const { value: fatigueA } = useFatigueValue(devA);
	const { value: fatigueB } = useFatigueValue(devB);

	// Batch handlers pass fatigue values to writer
	const onBatchA = useCallback(
		(batch: RawPacket[]) => {
			writerRef.current?.onBatchA(batch, fatigueA);
		},
		[fatigueA],
	);

	const onBatchB = useCallback(
		(batch: RawPacket[]) => {
			writerRef.current?.onBatchB(batch, fatigueB);
		},
		[fatigueB],
	);

	return (
		<DualImuProvider entryA={devA} entryB={devB} expectedHzA={expectedHz} autoStart onBatchA={onBatchA} onBatchB={onBatchB}>
			<SessionBody expectedHz={expectedHz} writerRef={writerRef} userMeta={{ uid: user?.uid ?? null, email: user?.email ?? null }} fatigueA={fatigueA} fatigueB={fatigueB}>
				{children}
			</SessionBody>
		</DualImuProvider>
	);
}

function SessionBody({
	children,
	expectedHz,
	writerRef,
	userMeta,
	fatigueA,
	fatigueB,
}: {
	children: ReactNode;
	expectedHz: number;
	writerRef: React.MutableRefObject<CombinedWriter | null>;
	userMeta: { uid: string | null; email: string | null };
	fatigueA?: number | null;
	fatigueB?: number | null;
}) {
	const { a, b, entryA, entryB, startAll, stopAll, drainAll, setCollectAll, isCollectingAny } = useDualImu();
	const stateA = useStateControl(entryA, { subscribe: true });
	const stateB = useStateControl(entryB, { subscribe: true });
	const [sport, setSport] = useState<SportType>('running');

	const startRecording = useCallback(async () => {
		if (isCollectingAny) {
			if (__DEV__) console.log('[CTRL] startRecording(): already recording');
			return;
		}
		try {
			writerRef.current = createCombinedImuWriter({
				sessionName: 'imu_both',
				expectedHz,
				idA: entryA?.id,
				idB: entryB?.id,
				meta: {
					user: { uid: userMeta.uid, email: userMeta.email },
					initialState: { A: stateA.value ?? null, B: stateB.value ?? null },
					sport,
				},
			});
			await writerRef.current.start();
			if (__DEV__) console.log('[CTRL] writer started at', writerRef.current.path);
		} catch (err) {
			if (__DEV__) console.error('[CTRL] writer start failed:', err);
			writerRef.current = null;
			return;
		}
		try {
			startAll();
		} catch (err) {
			if (__DEV__) console.error('[CTRL] startAll() error:', err);
		}
		setCollectAll(true);
	}, [isCollectingAny, expectedHz, entryA?.id, entryB?.id, a?.value, b?.value, startAll, userMeta, setCollectAll, sport, stateA.value, stateB.value]);

	const stopRecording = useCallback(async () => {
		setCollectAll(false);
		try {
			const { a: tailA, b: tailB } = drainAll();
			writerRef.current?.onBatchA(tailA, fatigueA);
			writerRef.current?.onBatchB(tailB, fatigueB);
		} catch {}
		try {
			stopAll();
		} catch {}
		try {
			await writerRef.current?.stop?.();
		} catch {}
		writerRef.current = null;
	}, [drainAll, stopAll, setCollectAll, fatigueA, fatigueB]);

	const value: SessionCtx = useMemo(
		() => ({
			writerRef,
			expectedHz,
			entryA,
			entryB,
			isCollecting: isCollectingAny,
			startRecording,
			stopRecording,
			a,
			b,
			sport,
			setSport,
			fatigueA,
			fatigueB,
		}),
		[writerRef, expectedHz, entryA, entryB, isCollectingAny, startRecording, stopRecording, a, b, sport, setSport, fatigueA, fatigueB],
	);

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
