import React, { createContext, useContext, useMemo, useRef, useState, useCallback, ReactNode, useEffect, Platform } from 'react';
import Geolocation, { GeoPosition, GeoError } from 'react-native-geolocation-service';

import { useBle } from '../ble/BleProvider';
import { useStateControl, StateMode } from '../ble/useStateControl';
import { DualImuProvider, useDualImu } from '../imu/DualImuProvider';
import { createCombinedImuWriter, type CombinedWriter, type RawPacket } from '../imu/combinedImuWriter';
import { useAuth } from '../auth/AuthProvider';
import { useFatigueValue } from '../ble/useFatigueValue';
import { useFatigueTrend } from '../ble/useFatigueTrend';

//import { ensurePermission } from './ensurePermission';
import { ensureGpsAuthorization } from './getPermissions';

type TrendPoint = { t: number; v: number };
type FatigueTrendState = {
	history: TrendPoint[];
	latest: TrendPoint | null;
	avg: number | null;
};

/** Matches your existing context shape */
type SessionCtx = {
	writerRef: React.MutableRefObject<CombinedWriter | null>;
	expectedHz: number;
	entryA?: ReturnType<typeof useDualImu>['entryA'];
	entryB?: ReturnType<typeof useDualImu>['entryB'];

	/** NEW — explicit session flags */
	sessionActive: boolean; // true between start..stop (even if paused)
	collecting: boolean; // true when actively writing rows (sessionActive && !isPaused)

	/** Back-compat (was used in UI) */
	isCollecting: boolean;

	startRecording: () => Promise<void>;
	stopRecording: () => Promise<void>;

	//NEW - Pause and Resume
	isPaused: boolean;
	pauseRecording: () => void;
	resumeRecording: () => void;
	togglePause: () => void;

	a: ReturnType<typeof useDualImu>['a'];
	b: ReturnType<typeof useDualImu>['b'];
	sport: SportType;
	setSport: (sport: SportType) => void;
	fatigueA: number | null;
	fatigueB: number | null;
	fatigueTrendA: FatigueTrendState;
	fatigueTrendB: FatigueTrendState;
	stateA: ReturnType<typeof useStateControl>;
	stateB: ReturnType<typeof useStateControl>;
};

//type SportType = 'hiking' | 'running' | 'tennis' | 'padel';
import { SportType } from './types';

/** Optional writer extension we’ll call if present */
type DeviceEvent = { t: number; which: 'A' | 'B'; event: 'dropped' | 'resumed' } | { t: number; event: 'session_start' | 'session_stop' | 'session_paused' | 'session_resumed' };

type CombinedWriterWithEvents = CombinedWriter & {
	onDeviceEvent?: (ev: DeviceEvent) => void;
};

const SessionContext = createContext<SessionCtx | null>(null);
export const useSession = () => {
	const v = useContext(SessionContext);
	if (!v) throw new Error('useSession must be used within <SessionProvider>');
	return v;
};

export function SessionProvider({ children, expectedHz = 60 }: { children: ReactNode; expectedHz?: number }) {
	const { user } = useAuth();

	const { entryA: devA, entryB: devB } = useBle();
	//const { connected } = useBle();
	//const arr = Object.values(connected);
	//const devA = arr[0];
	//const devB = arr[1];

	const writerRef = useRef<CombinedWriter | null>(null);

	// wire through your batch appenders (unchanged)
	const onBatchA = useCallback((batch: RawPacket[]) => writerRef.current?.onBatchA?.(batch), []);
	const onBatchB = useCallback((batch: RawPacket[]) => writerRef.current?.onBatchB?.(batch), []);

	return (
		<DualImuProvider entryA={devA} entryB={devB} expectedHzA={expectedHz} autoStart onBatchA={onBatchA} onBatchB={onBatchB}>
			<SessionBody expectedHz={expectedHz} writerRef={writerRef} userMeta={{ uid: user?.uid ?? null, email: user?.email ?? null }}>
				{children}
			</SessionBody>
		</DualImuProvider>
	);
}

function SessionBody({ children, expectedHz, writerRef, userMeta }: { children: ReactNode; expectedHz: number; writerRef: React.MutableRefObject<CombinedWriter | null>; userMeta: { uid: string | null; email: string | null } }) {
	// You already expose these from useDualImu; keeping the same callsite you have today.
	const { a, b, entryA, entryB, startAll, stopAll, drainAll, setCollectAll, isCollectingAny } = useDualImu();

	// Per-device state control (unchanged)
	const stateA = useStateControl(entryA, { subscribe: true });
	const stateB = useStateControl(entryB, { subscribe: true });

	const fatigueA = useFatigueValue(entryA).value;
	const fatigueB = useFatigueValue(entryB).value;

	// NEW: downsampled, circular history (good for sparklines)
	const trendA = useFatigueTrend(entryA, { maxPoints: 600, emitEveryMs: 250 });
	const trendB = useFatigueTrend(entryB, { maxPoints: 600, emitEveryMs: 250 });
	const connectedA = !!entryA?.id;
	const connectedB = !!entryB?.id;
	const isAOn = connectedA && stateA.supported && stateA.value !== StateMode.Off;
	const isBOn = connectedB && stateB.supported && stateB.value !== StateMode.Off;
	const safeFatigueTrendA: FatigueTrendState = isAOn ? trendA : { history: [], latest: null, avg: null };
	const safeFatigueTrendB: FatigueTrendState = isBOn ? trendB : { history: [], latest: null, avg: null };

	const { user } = useAuth();
	const [sport, setSport] = useState<SportType>('running');

	/** New lifecycle flags */
	const [sessionActive, setSessionActive] = useState(false);
	const [paused, setPaused] = useState(false);

	/** Derived collecting flag: writing rows right now */
	const collecting = sessionActive && !paused;

	/** Some existing UI referenced this; keep for back-compat */
	const isCollecting = collecting;

	/** Track “intended” recording to drive per-device drop/resume behavior */
	const intendedRecordingRef = useRef(false);

	const [writerReady, setWriterReady] = useState(false);

	// keep UI in sync if someone introspects writer directly (defensive)
	useEffect(() => {
		const id = setInterval(() => {
			const w = writerRef.current;
			if (!w) return;
			const now = !!w.isPaused?.();
			setPaused((prev) => (prev !== now ? now : prev));
		}, 500);
		return () => clearInterval(id);
	}, [writerRef]);

	/** Push live stats to writer for context/CSV footer */
	useEffect(() => {
		const w = writerRef.current as CombinedWriterWithEvents | null;
		if (!w) return;
		w.setStatsA?.(a?.stats);
		w.setStatsB?.(b?.stats);
	}, [a?.stats, b?.stats, writerRef]);

	/** GPS handling — tied *strictly* to sessionActive; also pauses with session */
	const gpsWatchIdRef = useRef<number | null>(null);

	const setGps = useCallback(
		(coords: GeoPosition['coords'] | null, tag?: string) => {
			const w = writerRef.current as CombinedWriterWithEvents | null;
			if (!w?.setGps) return;
			if (!coords) {
				w.setGps(null, tag);
				return;
			}
			w.setGps(
				{
					lat: coords.latitude,
					lon: coords.longitude,
					acc: coords.accuracy ?? undefined,
					alt: coords.altitude ?? undefined,
					altAcc: coords.altitudeAccuracy ?? undefined,
					speed: coords.speed ?? undefined,
					heading: coords.heading ?? undefined,
					ts: Date.now(),
				},
				tag,
			);
		},
		[writerRef],
	);

	const startGpsWatch = useCallback(async () => {
		if (gpsWatchIdRef.current != null) return;
		const ok = await ensureGpsAuthorization('whenInUse');
		if (__DEV__) console.log('[gps] permission ->', ok);
		if (!ok) {
			setGps(null, 'perm_denied');
			return;
		}

		// Prime with a single shot
		Geolocation.getCurrentPosition(
			(pos: GeoPosition) => {
				if (__DEV__) console.log('[gps] single OK', pos.coords);
				setGps(pos.coords, 'single_shot_ok');
			},
			(err: GeoError) => {
				console.warn('[gps] single ERR', err);
				setGps(null, `single_shot_err:${err.code}:${err.message}`);
			},
			{ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
		);

		const id = Geolocation.watchPosition(
			(pos: GeoPosition) => {
				if (__DEV__) console.log('[gps] watch OK', pos.coords);
				setGps(pos.coords, 'watch_ok');
			},
			(err: GeoError) => {
				console.warn('[gps] watch ERR', err);
				setGps(null, `watch_err:${err.code}:${err.message}`);
			},
			{
				enableHighAccuracy: true,
				distanceFilter: 0,
				interval: 1000,
				fastestInterval: 1000,
				showsBackgroundLocationIndicator: true,
				forceRequestLocation: true,
				forceLocationManager: true,
			},
		) as unknown as number;

		gpsWatchIdRef.current = id;
	}, [setGps]);

	const stopGpsWatch = useCallback(() => {
		if (gpsWatchIdRef.current != null) {
			Geolocation.clearWatch(gpsWatchIdRef.current);
			gpsWatchIdRef.current = null;
		}
		setGps(null, 'gps_stopped');
		if (__DEV__) console.log('[gps] stopped');
	}, [setGps]);

	// Clean up GPS on unmount just in case
	useEffect(() => {
		return () => stopGpsWatch();
	}, [stopGpsWatch]);

	// Convenience emitter (no-op if writer doesn’t implement it)
	const emitDeviceEvent = useCallback(
		(which: 'A' | 'B', event: 'dropped' | 'resumed') => {
			const wr = writerRef.current as CombinedWriterWithEvents | null;
			wr?.onDeviceEvent?.({ t: Date.now(), which, event });
		},
		[writerRef],
	);

	const emitSessionEvent = useCallback(
		(event: 'session_start' | 'session_stop' | 'session_paused' | 'session_resumed') => {
			const wr = writerRef.current as CombinedWriterWithEvents | null;
			wr?.onDeviceEvent?.({ t: Date.now(), event });
		},
		[writerRef],
	);

	// inside SessionBody in SessionProvider.tsx (after you have `a`, `b`, and writerRef)
	// a?.stats and b?.stats come from DualImuProvider/useImuIngress
	useEffect(() => {
		const w = writerRef.current;
		if (!w) return;
		// push latest stats (undefined -> null internally)
		w.setStatsA(a?.stats);
		w.setStatsB(b?.stats);
	}, [a?.stats, b?.stats, writerRef]);

	const startRecording = useCallback(async () => {
		if (sessionActive) return; // already running
		intendedRecordingRef.current = true;

		// 1) Start writer first so onBatchX can append immediately
		try {
			writerRef.current = createCombinedImuWriter({
				sessionName: 'imu_both',
				expectedHz,
				idA: entryA?.id,
				idB: entryB?.id,
				meta: {
					user: { uid: user?.uid ?? null /*, email: user?.email ?? null */ },
					initialState: { A: stateA.value ?? null, B: stateB.value ?? null },
					sport,
				},
			});
			await writerRef.current.start();

			setWriterReady(true);
			// session is active now
			setSessionActive(true);
			setPaused(false);
			emitSessionEvent('session_start');

			// ensure IMU notifications on, then enable batching
			try {
				startAll();
			} catch (e) {
				__DEV__ && console.warn('startAll err', e);
			}
			setCollectAll(true);

			// GPS on
			startGpsWatch();

			if (__DEV__) console.log('[CTRL] writer started');
		} catch (err) {
			__DEV__ && console.error('[CTRL] writer start failed:', err);
			writerRef.current = null;
			intendedRecordingRef.current = false;
			setSessionActive(false);
			setPaused(false);
		}
	}, [sessionActive, expectedHz, entryA?.id, entryB?.id, startAll, setCollectAll, user?.uid, stateA.value, stateB.value, sport, emitSessionEvent, startGpsWatch]);

	/** STOP — make sure to flip sessionActive=false so a new Start is allowed */
	const stopRecording = useCallback(async () => {
		if (!sessionActive) return;
		intendedRecordingRef.current = false;

		// stop batching immediately
		setCollectAll(false);

		// drain tails
		try {
			const { a: tailA, b: tailB } = drainAll();
			writerRef.current?.onBatchA?.(tailA);
			writerRef.current?.onBatchB?.(tailB);
		} catch {}

		// stop streaming & GPS
		try {
			stopAll();
		} catch {}
		stopGpsWatch();

		emitSessionEvent('session_stop');

		// finalize writer
		try {
			await (writerRef.current as CombinedWriterWithEvents)?.stop?.();
		} catch (e) {
			__DEV__ && console.warn('writer stop error', e);
		}
		writerRef.current = null;

		// reset flags — THIS WAS MISSING
		setSessionActive(false);
		setPaused(false);
	}, [sessionActive, setCollectAll, drainAll, stopAll, stopGpsWatch, emitSessionEvent]);

	/** PAUSE */
	const pauseRecording = useCallback(() => {
		if (!sessionActive) return;
		const w = writerRef.current as CombinedWriterWithEvents | null;
		if (!w?.pause) return;

		setCollectAll(false);
		w.pause();
		setPaused(true);
		stopGpsWatch();

		emitSessionEvent('session_paused');

		if (__DEV__) console.log('[CTRL] recording paused');
	}, [sessionActive, setCollectAll, stopGpsWatch]);

	/** RESUME */
	const resumeRecording = useCallback(() => {
		if (!sessionActive) return;
		const w = writerRef.current as CombinedWriterWithEvents | null;
		if (!w?.resume) return;

		startGpsWatch();
		setCollectAll(true);
		w.resume();
		setPaused(false);

		emitSessionEvent('session_resumed');

		if (__DEV__) console.log('[CTRL] recording resumed');
	}, [sessionActive, setCollectAll, startGpsWatch]);

	const togglePause = useCallback(() => {
		if (!sessionActive) return;
		paused ? resumeRecording() : pauseRecording();
	}, [sessionActive, paused, pauseRecording, resumeRecording]);

	// === New: continue logging from the device that remains, and mark events for the missing one ===
	const prevARef = useRef<string | null>(null);
	const prevBRef = useRef<string | null>(null);

	useEffect(() => {
		const nowA = entryA?.id ?? null;
		const nowB = entryB?.id ?? null;
		const prevA = prevARef.current;
		const prevB = prevBRef.current;

		if (intendedRecordingRef.current) {
			// A transitions
			if (prevA && !nowA) {
				// A dropped → keep B collecting, mark A dropped
				emitDeviceEvent('A', 'dropped');
				try {
					a.setCollect?.(false);
				} catch {}
			} else if (!prevA && nowA) {
				// A resumed → restart A collecting
				emitDeviceEvent('A', 'resumed');
				try {
					a.start?.();
					a.setCollect?.(true);
				} catch {}
			}

			// B transitions
			if (prevB && !nowB) {
				emitDeviceEvent('B', 'dropped');
				try {
					b.setCollect?.(false);
				} catch {}
			} else if (!prevB && nowB) {
				emitDeviceEvent('B', 'resumed');
				try {
					b.start?.();
					b.setCollect?.(true);
				} catch {}
			}
		}

		prevARef.current = nowA;
		prevBRef.current = nowB;
	}, [entryA?.id, entryB?.id, a, b, emitDeviceEvent]);

	const value: SessionCtx = useMemo(
		() => ({
			writerRef,
			expectedHz,
			entryA,
			entryB,

			// explicit session flags
			sessionActive,
			collecting,
			isCollecting, // back-compat

			startRecording,
			stopRecording,

			//NEw - Pause & Resume
			isPaused: paused,
			pauseRecording,
			resumeRecording,
			togglePause,

			a,
			b,
			sport,
			setSport,
			fatigueA,
			fatigueB,
			fatigueTrendA: safeFatigueTrendA, // or just: trendA
			fatigueTrendB: safeFatigueTrendB, // or just: trendB
			stateA,
			stateB,
		}),
		[
			writerRef,
			expectedHz,
			entryA,
			entryB,
			sessionActive,
			collecting,
			isCollecting,
			startRecording,
			stopRecording,
			paused,
			pauseRecording,
			resumeRecording,
			togglePause,
			a,
			b,
			sport,
			setSport,
			fatigueA,
			fatigueB,
			safeFatigueTrendA,
			safeFatigueTrendB,
			stateA,
			stateB,
		],
	);

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
