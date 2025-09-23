import React, { createContext, useContext, useMemo, useRef, useState, useCallback, ReactNode, useEffect } from 'react';
import { useBle } from '../ble/BleProvider';
import { useStateControl, StateMode } from '../ble/useStateControl';
import { DualImuProvider, useDualImu } from '../imu/DualImuProvider';
import { createCombinedImuWriter, type CombinedWriter, type RawPacket } from '../imu/combinedImuWriter';
import { useAuth } from '../auth/AuthProvider';
import { useFatigueValue } from '../ble/useFatigueValue';
import { useFatigueTrend } from '../ble/useFatigueTrend';

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
  isCollecting: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
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

type SportType = 'hiking' | 'running' | 'tennis' | 'padel';

/** Optional writer extension we’ll call if present */
type DeviceEvent =
  | { t: number; which: 'A' | 'B'; event: 'dropped' | 'resumed' }
  | { t: number; event: 'session_start' | 'session_stop' };

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
  const { connected } = useBle();
  const { user } = useAuth();

  const arr = Object.values(connected);
  const devA = arr[0];
  const devB = arr[1];

  const writerRef = useRef<CombinedWriter | null>(null);

  // wire through your batch appenders (unchanged)
  const onBatchA = useCallback((batch: RawPacket[]) => writerRef.current?.onBatchA?.(batch), []);
  const onBatchB = useCallback((batch: RawPacket[]) => writerRef.current?.onBatchB?.(batch), []);

  return (
    <DualImuProvider
      entryA={devA}
      entryB={devB}
      expectedHzA={expectedHz}
      autoStart
      onBatchA={onBatchA}
      onBatchB={onBatchB}
    >
      <SessionBody
        expectedHz={expectedHz}
        writerRef={writerRef}
        userMeta={{ uid: user?.uid ?? null, email: user?.email ?? null }}
      >
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
}: {
  children: ReactNode;
  expectedHz: number;
  writerRef: React.MutableRefObject<CombinedWriter | null>;
  userMeta: { uid: string | null; email: string | null };
}) {
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

  // Track intent so we only emit events while "recording"
  const intendedRecordingRef = useRef(false);

  // Convenience emitter (no-op if writer doesn’t implement it)
  const emitDeviceEvent = useCallback(
    (which: 'A' | 'B', event: 'dropped' | 'resumed') => {
      const wr = writerRef.current as CombinedWriterWithEvents | null;
      wr?.onDeviceEvent?.({ t: Date.now(), which, event });
    },
    [writerRef],
  );
  const emitSessionEvent = useCallback(
    (event: 'session_start' | 'session_stop') => {
      const wr = writerRef.current as CombinedWriterWithEvents | null;
      wr?.onDeviceEvent?.({ t: Date.now(), event });
    },
    [writerRef],
  );

  const startRecording = useCallback(async () => {
    if (isCollectingAny || intendedRecordingRef.current) {
      intendedRecordingRef.current = true;
      return;
    }
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
      emitSessionEvent('session_start');
      if (__DEV__) console.log('[CTRL] writer started at', writerRef.current.path);
    } catch (err) {
      if (__DEV__) console.error('[CTRL] writer start failed:', err);
      writerRef.current = null;
      intendedRecordingRef.current = false;
      return;
    }

    // 2) Subscribe streams (safe if already active)
    try {
      startAll();
    } catch (err) {
      if (__DEV__) console.error('[CTRL] startAll() error:', err);
    }

    // 3) Start collecting
    setCollectAll(true);
  }, [isCollectingAny, expectedHz, entryA?.id, entryB?.id, startAll, setCollectAll, user?.uid, stateA.value, stateB.value, sport, emitSessionEvent]);

  const stopRecording = useCallback(async () => {
    intendedRecordingRef.current = false;

    // Stop collecting
    setCollectAll(false);

    // Drain any tails
    try {
      const { a: tailA, b: tailB } = drainAll();
      writerRef.current?.onBatchA?.(tailA);
      writerRef.current?.onBatchB?.(tailB);
    } catch {}

    // Stop streams
    try {
      stopAll();
    } catch {}

    emitSessionEvent('session_stop');

    try {
      await writerRef.current?.stop?.();
    } catch {}
    writerRef.current = null;
  }, [drainAll, stopAll, setCollectAll, emitSessionEvent]);

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
        try { a.setCollect?.(false); } catch {}
      } else if (!prevA && nowA) {
        // A resumed → restart A collecting
        emitDeviceEvent('A', 'resumed');
        try { a.start?.(); a.setCollect?.(true); } catch {}
      }

      // B transitions
      if (prevB && !nowB) {
        emitDeviceEvent('B', 'dropped');
        try { b.setCollect?.(false); } catch {}
      } else if (!prevB && nowB) {
        emitDeviceEvent('B', 'resumed');
        try { b.start?.(); b.setCollect?.(true); } catch {}
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
      isCollecting: isCollectingAny && intendedRecordingRef.current,
      startRecording,
      stopRecording,
      a,
      b,
      sport,
      setSport,
      fatigueA,
      fatigueB,
      fatigueTrendA: safeFatigueTrendA, // or just: trendA
      fatigueTrendB: safeFatigueTrendB, // or just: trendB
      stateA,
      stateB
    }),
    [writerRef, expectedHz, entryA, entryB, isCollectingAny, startRecording, stopRecording, a, b, sport, setSport, fatigueA, fatigueB, stateA, stateB, safeFatigueTrendA, safeFatigueTrendB],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
