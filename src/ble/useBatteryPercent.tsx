import { useEffect, useMemo, useRef, useState } from 'react';
import type { Characteristic, Device } from 'react-native-ble-plx';

// ---- Your ConnectedDevice-like shape (adjust import/type if you already export it)
export type ConnectedDeviceLike = {
  id: string;
  device: Device; // connected instance
  services: string[]; // list of service UUIDs (16-bit like '180f' or full 128-bit)
  characteristicsByService: Record<string, Characteristic[]>;
};

// ---- UUID helpers (handle 16-bit vs 128-bit)
const SIG_BASE = '0000xxxx-0000-1000-8000-00805f9b34fb';
const toLower = (u?: string | null) => (u ? u.toLowerCase() : '');
const isSigBase128 = (u: string) => /^0000[0-9a-f]{4}-0000-1000-8000-00805f9b34fb$/.test(u);
const to16 = (u: string) => {
  const x = toLower(u);
  if (x.length === 4) return x;
  if (isSigBase128(x)) return x.slice(4, 8);
  return '';
};
const to128 = (u: string) => {
  const x = toLower(u);
  if (x.length === 36) return x;
  if (x.length === 4) return SIG_BASE.replace('xxxx', x);
  return x;
};
const uuidsEqual = (a: string, b: string) => {
  const a16 = to16(a); const b16 = to16(b);
  if (a16 && b16) return a16 === b16;
  return toLower(to128(a)) === toLower(to128(b));
};

// ---- Known Battery UUIDs
const BATTERY_SERVICE_UUIDS = ['180f', '0000180f-0000-1000-8000-00805f9b34fb'];
const BATTERY_CHAR_UUIDS    = ['2a19', '00002a19-0000-1000-8000-00805f9b34fb'];

// ---- Minimal base64 -> bytes (no extra deps)
function b64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  let output: number[] = [];
  let i = 0;
  while (i < str.length) {
    const enc1 = chars.indexOf(str[i++]);
    const enc2 = chars.indexOf(str[i++]);
    const enc3 = chars.indexOf(str[i++]);
    const enc4 = chars.indexOf(str[i++]);

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    output.push(chr1);
    if (enc3 !== 64) output.push(chr2);
    if (enc4 !== 64) output.push(chr3);
  }
  return new Uint8Array(output);
}

function findBatteryCharacteristic(entry: ConnectedDeviceLike): Characteristic | null {
  // Find a matching Battery service on this device
  const svcKey = entry.services.find((svc) =>
    BATTERY_SERVICE_UUIDS.some((want) => uuidsEqual(svc, want))
  );
  if (!svcKey) return null;

  // Get the characteristic list for the matched service
  const list =
    entry.characteristicsByService[svcKey] ??
    entry.characteristicsByService[svcKey.toLowerCase()] ??
    [];

  // Find 0x2A19 within that service
  const char = list.find((c) => BATTERY_CHAR_UUIDS.some((want) => uuidsEqual(c.uuid, want)));
  return char ?? null;
}

export function useBatteryPercent(
  entry: ConnectedDeviceLike | undefined,
  opts?: { subscribe?: boolean; intervalMs?: number }
) {
  const subscribe = opts?.subscribe ?? true;       // try notifications first
  const intervalMs = opts?.intervalMs ?? 15000;    // poll fallback every 15s
  const [percent, setPercent] = useState<number | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // cache the characteristic reference
  const batteryChar = useMemo(() => (entry ? findBatteryCharacteristic(entry) : null), [entry?.id]);

  // keep the latest characteristic in a ref for safety
  const charRef = useRef<Characteristic | null>(null);
  useEffect(() => { charRef.current = batteryChar ?? null; }, [batteryChar?.uuid, entry?.id]);

  useEffect(() => {
    setError(null);
    if (!entry || !batteryChar) {
      setSupported(false);
      setPercent(null);
      return;
    }
    setSupported(true);

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let sub: { remove: () => void } | null = null;

    const decodeAndSet = (value?: string | null) => {
      if (!value) return;
      const bytes = b64ToBytes(value);
      if (bytes.length) {
        const p = Math.max(0, Math.min(100, bytes[0])); // clamp 0..100
        setPercent(p);
      }
    };

    const readOnce = async () => {
      try {
        const fresh = await charRef.current!.read();
        decodeAndSet(fresh.value);
      } catch (e: any) {
        setError(String(e?.message ?? 'Battery read failed'));
      }
    };

    // 1) Do an immediate read for snappy UI
    readOnce();

    // 2) Try to subscribe if requested
    if (subscribe) {
      try {
        sub = charRef.current!.monitor((err, ch) => {
          if (err) {
            // If notifications fail, fall back to polling
            if (!intervalId) {
              intervalId = setInterval(readOnce, intervalMs);
            }
            return;
          }
          if (!cancelled && ch?.value) decodeAndSet(ch.value);
        });
      } catch {
        // monitor not supported — fallback to polling
        intervalId = setInterval(readOnce, intervalMs);
      }
    } else {
      // polling only
      intervalId = setInterval(readOnce, intervalMs);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (sub) sub.remove();
    };
  }, [entry?.id, batteryChar?.uuid, subscribe, intervalMs]);

  return { percent, supported, error };
}
