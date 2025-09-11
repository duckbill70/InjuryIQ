// providers/DualImuProvider.tsx
import React, { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Characteristic, Device } from 'react-native-ble-plx';
import { useImuIngress } from '../ble/useImuIngress';

export type ConnectedDeviceLike = {
  id: string;
  device: Device;
  services: string[];
  characteristicsByService: Record<string, Characteristic[]>;
};

type RawPacket = { t: number; b64: string };

type Session = ReturnType<typeof useImuIngress>;

type Ctx = {
  a: Session | null;
  b: Session | null;
  entryA?: ConnectedDeviceLike;
  entryB?: ConnectedDeviceLike;

  // helpers for UI
  isStreamingAny: boolean;
  isCollectingAny: boolean;

  // controls
  startAll: () => void;
  stopAll: () => void;
  setCollectAll: (v: boolean) => void;
  resetStatsAll: () => void;

  // tail handling (use before closing writer)
  drainAll: () => { a: RawPacket[]; b: RawPacket[] };
  flushAll: () => void;
};

const DualImuContext = createContext<Ctx | null>(null);

type Props = {
  entryA?: ConnectedDeviceLike;
  entryB?: ConnectedDeviceLike;
  expectedHzA: number;
  expectedHzB?: number;
  onBatchA?: (batch: RawPacket[]) => void;
  onBatchB?: (batch: RawPacket[]) => void;
  autoStart?: boolean; // default true
  collect?: boolean;   // default false
  children: ReactNode;
};

export function DualImuProvider({
  entryA,
  entryB,
  expectedHzA,
  expectedHzB,
  onBatchA,
  onBatchB,
  autoStart = true,
  collect = false,
  children,
}: Props) {
  const a = useImuIngress(entryA, {
    expectedHz: expectedHzA,
    autoStart,
    collect,
    onBatch: onBatchA,
    batchSize: 64,
    statsWindowMs: 2000,
    statsEmitMs: 1000,
    maxBuffer: 10000,
    debugTg: `A:${entryA?.id.slice(-4)}`
  });

  const b = useImuIngress(entryB, {
    expectedHz: expectedHzB ?? expectedHzA,
    autoStart,
    collect,
    onBatch: onBatchB,
    batchSize: 64,
    statsWindowMs: 2000,
    statsEmitMs: 1000,
    maxBuffer: 10000,
    debugTg: `B:${entryB?.id.slice(-4)}`
  });

  const value = useMemo<Ctx>(() => {
    const hasA = !!entryA;
    const hasB = !!entryB;

    const isStreamingAny = (hasA && a.isStreaming) || (hasB && b.isStreaming);
    const isCollectingAny = (hasA && a.collect) || (hasB && b.collect);

    return {
      a: hasA ? a : null,
      b: hasB ? b : null,
      entryA,
      entryB,

      isStreamingAny,
      isCollectingAny,

      startAll: () => { if (hasA) a.start(); if (hasB) b.start(); },
      stopAll:  () => { if (hasA) a.stop();  if (hasB) b.stop();  },
      setCollectAll: (v: boolean) => { if (hasA) a.setCollect(v); if (hasB) b.setCollect(v); },
      resetStatsAll: () => { if (hasA) a.resetStats(); if (hasB) b.resetStats(); },

      drainAll: () => ({
        a: hasA ? a.drain() : [],
        b: hasB ? b.drain() : [],
      }),

      // push any buffered data out to onBatch sinks immediately
      flushAll: () => { if (hasA) a.flush(); if (hasB) b.flush(); },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryA?.id, entryB?.id, a, b]);

  return <DualImuContext.Provider value={value}>{children}</DualImuContext.Provider>;
}

export function useDualImu() {
  const ctx = useContext(DualImuContext);
  if (!ctx) throw new Error('useDualImu must be used inside <DualImuProvider>');
  return ctx;
}
