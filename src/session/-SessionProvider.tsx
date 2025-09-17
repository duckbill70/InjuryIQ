import React, { createContext, useContext, useMemo, useRef, useState, useCallback, ReactNode } from 'react';
import { useBle } from '../ble/BleProvider';
import { useStateControl } from '../ble/useStateControl';
import { DualImuProvider, useDualImu } from '../imu/DualImuProvider';
import { createCombinedImuWriter, type CombinedWriter, type RawPacket } from '../imu/combinedImuWriter';
import { useAuth } from '../auth/AuthProvider';

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
    setSport: (sport: SportType) => void
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
	const [collecting, setCollecting] = useState(false);

	const onBatchA = useCallback((batch: RawPacket[]) => writerRef.current?.onBatchA?.(batch), []);
	const onBatchB = useCallback((batch: RawPacket[]) => writerRef.current?.onBatchB?.(batch), []);

	return (
		<DualImuProvider entryA={devA} entryB={devB} expectedHzA={expectedHz} autoStart collect={collecting} onBatchA={onBatchA} onBatchB={onBatchB}>
			<SessionBody expectedHz={expectedHz} writerRef={writerRef} collecting={collecting} setCollecting={setCollecting} userMeta={{ uid: user?.uid ?? null, email: user?.email ?? null }}>
				{children}
			</SessionBody>
		</DualImuProvider>
	);
}

function SessionBody({
	children,
	expectedHz,
	writerRef,
	collecting,
	setCollecting,
	userMeta,
}: {
	children: ReactNode;
	expectedHz: number;
	writerRef: React.MutableRefObject<CombinedWriter | null>;
	collecting: boolean;
	setCollecting: (v: boolean) => void;
	userMeta: { uid: string | null; email: string | null };
}) {
	const { a, b, entryA, entryB, startAll, stopAll, drainAll } = useDualImu();

    // State control hooks per device (LED/state service)
    const stateA = useStateControl(entryA, { subscribe: true });
    const stateB = useStateControl(entryB, { subscribe: true });

    const { user } = useAuth();

    const [sport, setSport] = useState<SportType>('running'); // default value

	const onStart = async () => {
		const recording = !!(a?.collect || b?.collect);

		if (recording) {
			if (__DEV__) console.log('[CTRL] onStart(): already recording — noop');
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

	const startRecording = useCallback(async () => {
		const recording = !!(a?.collect || b?.collect);

		if (recording) {
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
					user: userMeta,
					initialState: { A: stateA?.value ?? null, B: stateB?.value ?? null },
				},
			});
			await writerRef.current.start();
		} catch (e) {
			console.warn('[Session] writer start failed:', e);
			writerRef.current = null;
			return;
		}

		try {
			startAll();
		} catch {}

		setCollecting(true);
	}, [collecting, expectedHz, entryA?.id, entryB?.id, a?.value, b?.value, setCollecting, startAll, userMeta]);

	const stopRecording = useCallback(async () => {
		setCollecting(false);

		try {
			const { a: tailA, b: tailB } = drainAll();
			writerRef.current?.onBatchA?.(tailA);
			writerRef.current?.onBatchB?.(tailB);
		} catch {}

		try {
			stopAll();
		} catch {}

		try {
			await writerRef.current?.stop?.();
		} catch {}
		writerRef.current = null;
	}, [drainAll, stopAll, setCollecting]);

	const value: SessionCtx = useMemo(
		() => ({
			writerRef,
			expectedHz,
			entryA,
			entryB,
			isCollecting: collecting,
			startRecording,
			stopRecording,
			a,
			b,
            sport,
            setSport,
		}),
		[writerRef, expectedHz, entryA, entryB, collecting, startRecording, stopRecording, a, b, sport, setSport],
	);

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
