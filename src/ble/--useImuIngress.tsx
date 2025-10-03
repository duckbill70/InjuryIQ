import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Characteristic, Device } from 'react-native-ble-plx';

export type ConnectedDeviceLike = {
  id: string;
  device: Device;
  services: string[];
  characteristicsByService: Record<string, Characteristic[]>;
};

const IMU_SERVICE = 'abcdef01-2345-6789-abcd-ef0123456789';
const IMU_CHAR    = 'abcdef01-2345-6789-abcd-ef0123456790';

type RawPacket = { t: number; b64: string };

export type IngressOptions = {
  expectedHz: number;
  autoStart?: boolean;
  collect?: boolean;
  batchSize?: number;
  maxBuffer?: number;
  statsWindowMs?: number;
  statsEmitMs?: number;
  onBatch?: (batch: RawPacket[]) => void;
  debugTg?: string;
};

export type IngressState = {
  isStreaming: boolean;
  collect: boolean;
  last?: RawPacket | null;
  stats: {
    measuredHz: number;
    lossRatio: number;
    lossPercent: number;
    windowSec: number;
    packetsInWindow: number;
    totalPackets: number;
  };
};

function findImuChar(entry?: ConnectedDeviceLike | null): Characteristic | null {
  if (!entry) return null;
  const svcKey = entry.services.find(s => s.toLowerCase() === IMU_SERVICE) ?? IMU_SERVICE;
  const list =
    entry.characteristicsByService[svcKey] ??
    entry.characteristicsByService[svcKey.toLowerCase()] ??
    [];
  return list.find(c => c.uuid.toLowerCase() === IMU_CHAR) ?? null;
}

export function useImuIngress(entry: ConnectedDeviceLike | undefined, opts: IngressOptions) {
  const expectedHz        = Math.max(0, opts.expectedHz || 0);
  const autoStart         = opts.autoStart ?? true;
  const initialCollect    = opts.collect ?? false;
  const batchSize         = opts.batchSize ?? 64;
  const maxBuffer         = opts.maxBuffer ?? 10000;
  const statsWindowMs     = opts.statsWindowMs ?? 2000;
  const statsEmitMs       = opts.statsEmitMs ?? 1000;
  const onBatch           = opts.onBatch;

  const [isStreaming, setIsStreaming] = useState(false);
  const [collect, setCollect] = useState<boolean>(initialCollect);
  const [last, setLast] = useState<RawPacket | null>(null);
  const [stats, setStats] = useState<IngressState['stats']>({
    measuredHz: 0,
    lossRatio: 0,
    lossPercent: 0,
    windowSec: statsWindowMs / 1000,
    packetsInWindow: 0,
    totalPackets: 0,
  });

  const tag = opts.debugTg ?? entry?.id ?? 'imu';

  // Resolve characteristic when services appear (including after reconnect).
  const char = useMemo(() => findImuChar(entry), [entry?.id]);
  const charRef = useRef<Characteristic | null>(null);
  useEffect(() => {
    charRef.current = char ?? null;
  }, [char?.uuid, entry?.id]);

  const collectingRef = useRef<boolean>(initialCollect);
  useEffect(() => { collectingRef.current = collect; }, [collect]);

  const subRef = useRef<{ remove: () => void } | null>(null);
  const bufRef = useRef<RawPacket[]>([]);
  const totalPacketsRef = useRef(0);
  const appendCountRef = useRef(0);
  const winRef = useRef<number[]>([]);
  const lastStatsEmitRef = useRef(0);

  const activeUuidRef = useRef<string | null>(null);
  const unsubscribingRef = useRef(false);

  const setCollecting = (v: boolean) => {
    if (__DEV__) console.log(`[${tag}] setCollecting(${v})`);
    setCollect(v);
  };

  const updateStats = (now: number) => {
    const win = winRef.current;
    const windowStart = now - statsWindowMs;
    while (win.length && win[0] < windowStart) win.shift();
    const receivedInWindow = win.length;
    const windowSec = statsWindowMs / 1000;
    const measuredHz = receivedInWindow / windowSec;
    const lossRatio = expectedHz > 0 ? Math.max(0, 1 - measuredHz / expectedHz) : 0;
    const lossPercent = Math.min(100, Math.max(0, lossRatio * 100));
    if (now - lastStatsEmitRef.current >= statsEmitMs) {
      lastStatsEmitRef.current = now;
      setStats({
        measuredHz,
        lossRatio,
        lossPercent,
        windowSec,
        packetsInWindow: receivedInWindow,
        totalPackets: totalPacketsRef.current,
      });
    }
  };

  const flush = useCallback(() => {
    if (!collectingRef.current || !onBatch) return;
    const out = bufRef.current.splice(0, bufRef.current.length);
    if (out.length) onBatch(out);
    if (__DEV__) console.log(`[${tag}] flush() emitted=${out.length}`);
  }, [onBatch, tag]);

  function isCancellationError(err: unknown): boolean {
    if (!err) return true;
    const s = String((err as any)?.message ?? (err as any));
    return /cancel|cancelled|canceled|aborted/i.test(s);
  }

  const onNotification = useCallback((err: any, ch?: Characteristic | null) => {
    if (err) {
      if (unsubscribingRef.current || isCancellationError(err)) {
        if (__DEV__) console.log(`[${tag}] monitor cancelled (expected during stop)`);
        return;
      }
      if (__DEV__) console.log(`[${tag}] monitor error:`, err);
      return;
    }
    if (!ch?.value) return;

    totalPacketsRef.current += 1;

    const now = Date.now();
    winRef.current.push(now);
    updateStats(now);
    setLast({ t: now, b64: ch.value });

    if (collectingRef.current) {
      const buf = bufRef.current;
      buf.push({ t: now, b64: ch.value });
      if (buf.length > maxBuffer) buf.splice(0, buf.length - maxBuffer);
      if (buf.length >= batchSize) {
        const out = buf.splice(0, buf.length);
        onBatch?.(out);
        appendCountRef.current += out.length;
      }
    }
  }, [batchSize, maxBuffer, onBatch, statsWindowMs, statsEmitMs, expectedHz, tag]);

  const start = useCallback(() => {
    const c = charRef.current;
    if (!c) {
      if (__DEV__) console.log(`[${tag}] start(): IMU characteristic not found yet`);
      return;
    }
    if (activeUuidRef.current === c.uuid && subRef.current) {
      if (__DEV__) console.log(`[${tag}] start(): already streaming`);
      return;
    }
    // Switch if uuid changed
    if (subRef.current) {
      try {
        unsubscribingRef.current = true;
        subRef.current.remove();
      } finally {
        unsubscribingRef.current = false;
        subRef.current = null;
      }
    }
    try {
      if (__DEV__) console.log(`[${tag}] start(): subscribing to IMU notifications`);
      subRef.current = c.monitor(onNotification);
      activeUuidRef.current = c.uuid;
      setIsStreaming(true);
    } catch (e) {
      if (__DEV__) console.error(`[${tag}] start(): monitor threw:`, e);
      subRef.current = null;
      activeUuidRef.current = null;
      setIsStreaming(false);
    }
  }, [onNotification, tag]);

  const stop = useCallback(() => {
    if (!subRef.current) {
      if (__DEV__) console.log(`[${tag}] stop(): noop (not streaming)`);
      setIsStreaming(false);
      flush();
      return;
    }
    if (__DEV__) console.log(`[${tag}] stop(): unsubscribing`);
    try {
      unsubscribingRef.current = true;
      subRef.current.remove();
    } catch {} finally {
      unsubscribingRef.current = false;
      subRef.current = null;
      activeUuidRef.current = null;
      setIsStreaming(false);
    }
    flush();
  }, [flush, tag]);

  const drain = (): RawPacket[] => {
    const out = bufRef.current.splice(0, bufRef.current.length);
    if (__DEV__) console.log(`[${tag}] drain(): ${out.length} rows`);
    return out;
  };

  const resetStats = () => {
    winRef.current = [];
    totalPacketsRef.current = 0;
    appendCountRef.current = 0;
    lastStatsEmitRef.current = 0;
    setStats(s => ({
      ...s,
      measuredHz: 0,
      lossRatio: 0,
      lossPercent: 0,
      packetsInWindow: 0,
      totalPackets: 0,
    }));
    if (__DEV__) console.log(`[${tag}] resetStats()`);
  };

  // Auto start/stop on characteristic availability (including after reconnect)
  useEffect(() => {
    if (!autoStart) return;
    const uuid = charRef.current?.uuid ?? null;

    if (!uuid) {
      if (isStreaming) stop();
      return;
    }
    if (isStreaming && activeUuidRef.current === uuid) {
      return;
    }
    start();

    return () => {
      if (activeUuidRef.current === uuid) {
        stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, char?.uuid, autoStart]);

  return {
    isStreaming,
    collect,
    setCollect: setCollecting,
    start,
    stop,
    flush,
    drain,
    resetStats,
    last,
    stats,
  } as const;
}
