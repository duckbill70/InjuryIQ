// useBatteryPercent.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Characteristic, Device } from 'react-native-ble-plx';

/** Shape your BleProvider hands to consumers (matches your ConnectedDevice) */
export type ConnectedDeviceLike = {
  id: string;                            // BLE device id
  device: Device;                        // connected instance
  services: string[];                    // discovered service UUIDs
  characteristicsByService: Record<string, Characteristic[]>; // keyed by service uuid
};

/* ----------------------- UUID helpers (16-bit/128-bit) ----------------------- */

const SIG_BASE = '0000xxxx-0000-1000-8000-00805f9b34fb';
const toLower = (u?: string | null) => (u ? u.toLowerCase() : '');
const isSig128 = (u: string) => /^0000[0-9a-f]{4}-0000-1000-8000-00805f9b34fb$/.test(u);

const to16 = (u: string) => {
  const x = toLower(u);
  if (x.length === 4) return x;
  if (isSig128(x)) return x.slice(4, 8);
  return '';
};

const to128 = (u: string) => {
  const x = toLower(u);
  if (x.length === 36) return x;
  if (x.length === 4) return SIG_BASE.replace('xxxx', x);
  return x;
};

const sameUuid = (a: string, b: string) => {
  const a16 = to16(a), b16 = to16(b);
  if (a16 && b16) return a16 === b16;
  return toLower(to128(a)) === toLower(to128(b));
};

/* --------------------------- Battery UUIDs (GATT) --------------------------- */

const BAT_SVC_UUIDS  = ['180f', '0000180f-0000-1000-8000-00805f9b34fb'];
const BAT_CHAR_UUIDS = ['2a19', '00002a19-0000-1000-8000-00805f9b34fb'];

/* ------------------------------ Base64 decoder ------------------------------ */

function b64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  let i = 0;
  while (i < str.length) {
    const e1 = chars.indexOf(str[i++]);
    const e2 = chars.indexOf(str[i++]);
    const e3 = chars.indexOf(str[i++]);
    const e4 = chars.indexOf(str[i++]);
    const c1 = (e1 << 2) | (e2 >> 4);
    const c2 = ((e2 & 15) << 4) | (e3 >> 2);
    const c3 = ((e3 & 3) << 6) | e4;
    out.push(c1);
    if (e3 !== 64) out.push(c2);
    if (e4 !== 64) out.push(c3);
  }
  return new Uint8Array(out);
}

/* ----------------------------- Error classifier ----------------------------- */

function isCancellationError(err: unknown) {
  const s = String((err as any)?.message ?? err ?? '');
  return /cancel|cancelled|canceled|aborted|device disconnected|not connected|not found/i.test(s);
}

/* ------------------------------ Char resolution ----------------------------- */

function findBatteryCharacteristic(entry: ConnectedDeviceLike): Characteristic | null {
  // Find a service key matching 0x180F
  const svcKey =
    entry.services.find(s => BAT_SVC_UUIDS.some(w => sameUuid(s, w))) ??
    entry.services.find(s => sameUuid(s, '0000180f-0000-1000-8000-00805f9b34fb')) ??
    entry.services.find(s => sameUuid(s, '180f'));

  if (!svcKey) return null;

  // Try exact, lowercased, and normalized keys
  const candidates =
    entry.characteristicsByService[svcKey] ??
    entry.characteristicsByService[svcKey.toLowerCase()] ??
    entry.characteristicsByService[to128(svcKey)] ??
    [];

  const char = candidates.find(c => BAT_CHAR_UUIDS.some(w => sameUuid(c.uuid, w)));
  return char ?? null;
}

/* --------------------------------- The hook -------------------------------- */

export function useBatteryPercent(
  entry: ConnectedDeviceLike | undefined,
  opts?: {
    /** Prefer notifications when available (default true). */
    subscribe?: boolean;
    /** Polling interval (ms) when notifications are unavailable (default 15000). */
    intervalMs?: number;
    /** Max wait for the characteristic to appear after reconnect (default 5000). */
    waitMs?: number;
  }
) {
  const subscribe = opts?.subscribe ?? true;
  const intervalMs = opts?.intervalMs ?? 15000;
  const waitMs = opts?.waitMs ?? 5000;

  const [percent, setPercent] = useState<number | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve characteristic from the current entry snapshot (BleProvider rebuilds entry on reconnect)
  const batteryChar = useMemo(
    () => (entry ? findBatteryCharacteristic(entry) : null),
    [entry?.id] // new connected device → recompute
  );

  // Keep latest char to avoid acting on stale refs inside async callbacks
  const charRef = useRef<Characteristic | null>(null);
  useEffect(() => { charRef.current = batteryChar ?? null; }, [batteryChar?.uuid, entry?.id]);

  useEffect(() => {
    setError(null);

    if (!entry) {
      setSupported(false);
      setPercent(null);
      return;
    }

    let cancelled = false;
    let unsubscribing = false;
    let sub: { remove: () => void } | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Wait for Battery Level char to appear after reconnect (short capped backoff)
    const waitForChar = async (): Promise<Characteristic | null> => {
      const startedAt = Date.now();
      let delay = 100; // ms
      while (!cancelled && Date.now() - startedAt < waitMs) {
        const c = charRef.current ?? (entry ? findBatteryCharacteristic(entry) : null);
        if (c) return c;
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(600, Math.floor(delay * 1.6) + Math.floor(Math.random() * 40));
      }
      return charRef.current ?? null;
    };

    const decodeAndSet = (value?: string | null) => {
      if (!value) return;
      const bytes = b64ToBytes(value);
      if (bytes.length) {
        const p = Math.max(0, Math.min(100, bytes[0]));
        setPercent(p);
        setError(null); // successful value clears any transient error
      }
    };

    const readOnce = async () => {
      try {
        const c = charRef.current ?? (await waitForChar());
        if (!c) { setSupported(false); return; }
        setSupported(true);
        const fresh = await c.read();
        if (!cancelled && c === charRef.current) decodeAndSet(fresh.value);
      } catch (e: any) {
        if (isCancellationError(e)) return; // ignore transient disconnects/races
        // Some firmwares reject early reads; one quiet retry helps.
        try {
          const c2 = charRef.current;
          if (c2) {
            const fresh2 = await c2.read();
            if (!cancelled && c2 === charRef.current) decodeAndSet(fresh2.value);
            return;
          }
        } catch {}
        setError(String(e?.message ?? 'Battery read failed'));
      }
    };

    // Kick an immediate read (waits briefly for char if needed)
    readOnce();

    // Prefer notifications; fall back to polling if monitor fails/unsupported
    const startMonitorOrPoll = async () => {
      const c = await waitForChar();
      if (!c) {
        intervalId = setInterval(readOnce, intervalMs);
        return;
      }
      setSupported(true);

      if (subscribe) {
        try {
          sub = c.monitor((err, ch) => {
            if (err) {
              if (!intervalId) intervalId = setInterval(readOnce, intervalMs);
              if (!isCancellationError(err) && !unsubscribing) {
                setError(String(err?.message ?? 'Battery notify failed'));
              }
              return;
            }
            if (!cancelled && ch?.value) decodeAndSet(ch.value);
          });
        } catch (e: any) {
          // Notifications not supported → polling
          intervalId = setInterval(readOnce, intervalMs);
          if (!isCancellationError(e)) setError(String(e?.message ?? 'Battery monitor failed'));
        }
      } else {
        intervalId = setInterval(readOnce, intervalMs);
      }
    };

    startMonitorOrPoll();

    return () => {
      cancelled = true;
      unsubscribing = true;
      try { sub?.remove?.(); } catch {}
      if (intervalId) clearInterval(intervalId);
      unsubscribing = false;
    };
  }, [entry?.id, batteryChar?.uuid, subscribe, intervalMs, waitMs]);

  return { percent, supported, error };
}
