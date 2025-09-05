import { useEffect, useMemo, useRef, useState } from 'react';
import type { Characteristic, Device } from 'react-native-ble-plx';

export type ConnectedDeviceLike = {
  id: string;
  device: Device; // must be CONNECTED
  services: string[];
  characteristicsByService: Record<string, Characteristic[]>;
};

// --- State Control UUIDs (lowercased)
const STATE_SERVICE_UUID = '19b10010-e8f2-537e-4f6c-d104768a1214';
const STATE_CHAR_UUID    = '19b10010-e8f2-537e-4f6c-d104768a1215';

// Modes (keep color references)
export enum StateMode {
  Amber = 0,
  RedPulse = 1,
  GreenPulse = 2,
  BluePulse = 3,
  Red = 4,
  Green = 5,
  Blue = 6,
  Off = 10,
}

// Optional: nice label for UI
export function stateModeLabel(v: number | null | undefined) {
  switch (v) {
    case StateMode.Amber: return 'Amber';
    case StateMode.RedPulse: return 'Red (Pulse)';
    case StateMode.GreenPulse: return 'Green (Pulse)';
    case StateMode.BluePulse: return 'Blue (Pulse)';
    case StateMode.Red: return 'Red';
    case StateMode.Green: return 'Green';
    case StateMode.Blue: return 'Blue';
    case StateMode.Off: return 'Off';
    default: return '—';
  }
}

// --- tiny base64 helpers (RN-safe, no deps)
const B64CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [b1, b2 = 0, b3 = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const trip = (b1 << 16) | (b2 << 8) | b3;
    out +=
      B64CHARS[(trip >> 18) & 63] +
      B64CHARS[(trip >> 12) & 63] +
      (i + 1 < bytes.length ? B64CHARS[(trip >> 6) & 63] : '=') +
      (i + 2 < bytes.length ? B64CHARS[trip & 63] : '=');
  }
  return out;
}
function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = B64CHARS.indexOf(clean[i]);
    const e2 = B64CHARS.indexOf(clean[i + 1]);
    const e3 = B64CHARS.indexOf(clean[i + 2]);
    const e4 = B64CHARS.indexOf(clean[i + 3]);
    const n1 = (e1 << 2) | (e2 >> 4);
    const n2 = ((e2 & 15) << 4) | (e3 >> 2);
    const n3 = ((e3 & 3) << 6) | e4;
    bytes.push(n1);
    if (e3 !== 64) bytes.push(n2);
    if (e4 !== 64) bytes.push(n3);
  }
  return new Uint8Array(bytes);
}

// find characteristic from your discovered map
function findStateChar(entry?: ConnectedDeviceLike | null): Characteristic | null {
  if (!entry) return null;
  const svcKey =
    entry.services.find((s) => s.toLowerCase() === STATE_SERVICE_UUID) ?? STATE_SERVICE_UUID;
  const list =
    entry.characteristicsByService[svcKey] ??
    entry.characteristicsByService[svcKey.toLowerCase()] ??
    [];
  return list.find((c) => c.uuid.toLowerCase() === STATE_CHAR_UUID) ?? null;
}

export function useStateControl(
  entry: ConnectedDeviceLike | undefined,
  opts?: { subscribe?: boolean; intervalMs?: number } // polling fallback if notify not available
) {
  const subscribe = opts?.subscribe ?? true;
  const intervalMs = opts?.intervalMs ?? 0; // 0 = no polling fallback

  const [value, setValue] = useState<number | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const stateChar = useMemo(() => findStateChar(entry), [entry?.id]);
  const charRef = useRef<Characteristic | null>(null);
  useEffect(() => { charRef.current = stateChar ?? null; }, [stateChar?.uuid, entry?.id]);

  useEffect(() => {
    setError(null);
    if (!entry || !stateChar) {
      setSupported(false);
      setValue(null);
      return;
    }
    setSupported(true);

    let cancelled = false;
    let sub: { remove: () => void } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const decode = (b64?: string | null) => {
      if (!b64) return;
      const bytes = b64ToBytes(b64);
      if (bytes.length) setValue(bytes[0]);
    };

    const readOnce = async () => {
      try {
        const fresh = await charRef.current!.read();
        decode(fresh.value);
      } catch (e: any) {
        setError(String(e?.message ?? 'State read failed'));
      }
    };

    // initial read for snappy UI
    readOnce();

    // try notifications
    if (subscribe) {
      try {
        sub = charRef.current!.monitor((err, ch) => {
          if (err) {
            // fallback to polling if requested
            if (intervalMs > 0 && !timer) {
              timer = setInterval(readOnce, intervalMs);
            }
            return;
          }
          if (!cancelled && ch?.value) decode(ch.value);
        });
      } catch {
        // monitor not supported
        if (intervalMs > 0) {
          timer = setInterval(readOnce, intervalMs);
        }
      }
    } else if (intervalMs > 0) {
      timer = setInterval(readOnce, intervalMs);
    }

    return () => {
      cancelled = true;
      if (sub) sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [entry?.id, stateChar?.uuid, subscribe, intervalMs]);

  // write a single byte (0..255)
  const setStateMode = async (mode: number, withResponse = true) => {
    if (!charRef.current) throw new Error('State characteristic not found');
    if (mode < 0 || mode > 255) throw new Error('Mode must be 0..255');
    const data = bytesToB64(new Uint8Array([mode & 0xff]));
    try {
      if (withResponse) await charRef.current.writeWithResponse(data);
      else await charRef.current.writeWithoutResponse(data);
      setValue(mode); // optimistic; notify/read will confirm
    } catch (e: any) {
      setError(String(e?.message ?? 'State write failed'));
      throw e;
    }
  };

  const refresh = async () => {
    if (!charRef.current) throw new Error('State characteristic not found');
    const fresh = await charRef.current.read();
    const bytes = b64ToBytes(fresh.value || '');
    const v = bytes.length ? bytes[0] : null;
    setValue(v);
    return v;
  };

  // handy commands (color-named)
  const commands = {
    amber: () => setStateMode(StateMode.Amber),
    redPulse: () => setStateMode(StateMode.RedPulse),
    greenPulse: () => setStateMode(StateMode.GreenPulse),
    bluePulse: () => setStateMode(StateMode.BluePulse),
    red: () => setStateMode(StateMode.Red),
    green: () => setStateMode(StateMode.Green),
    blue: () => setStateMode(StateMode.Blue),
    off: () => setStateMode(StateMode.Off),
  };

  return { value, supported, error, setStateMode, refresh, commands };
}