// hooks/useFatigueValue.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Characteristic, Device } from 'react-native-ble-plx';
 
export type ConnectedDeviceLike = {
  id: string;
  device: Device;
  services: string[];
  characteristicsByService: Record<string, Characteristic[]>;
};
 
// --- UUIDs (lowercased)
const FATIGUE_SERVICE = '12345678-1234-5678-1234-56789abcdef0';
const FATIGUE_CHAR    = '12345678-1234-5678-1234-56789abcdef1';
 
// base64 -> bytes (tiny, RN-safe)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function b64ToBytes(b64: string): Uint8Array {
  const s = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const e1 = B64.indexOf(s[i]), e2 = B64.indexOf(s[i+1]), e3 = B64.indexOf(s[i+2]), e4 = B64.indexOf(s[i+3]);
    const n1 = (e1 << 2) | (e2 >> 4);
    const n2 = ((e2 & 15) << 4) | (e3 >> 2);
    const n3 = ((e3 & 3) << 6) | e4;
    out.push(n1);
    if (e3 !== 64) out.push(n2);
    if (e4 !== 64) out.push(n3);
  }
  return new Uint8Array(out);
}
 
function findFatigueChar(entry?: ConnectedDeviceLike | null): Characteristic | null {
  if (!entry) return null;
  const svcKey = entry.services.find(s => s.toLowerCase() === FATIGUE_SERVICE) ?? FATIGUE_SERVICE;
  const list = entry.characteristicsByService[svcKey] ?? entry.characteristicsByService[svcKey.toLowerCase()] ?? [];
  return list.find(c => c.uuid.toLowerCase() === FATIGUE_CHAR) ?? null;
}
 
export function useFatigueValue(entry: ConnectedDeviceLike | undefined) {
  const [value, setValue] = useState<number | null>(null);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
 
  const char = useMemo(() => findFatigueChar(entry), [entry?.id]);
  const charRef = useRef<Characteristic | null>(null);
  useEffect(() => { charRef.current = char ?? null; }, [char?.uuid, entry?.id]);
 
  useEffect(() => {
    setError(null);
    if (!entry || !char) {
      setSupported(false); setValue(null);
      return;
    }
    setSupported(true);
 
    let sub: { remove: () => void } | null = null;
 
    const decode = (b64?: string | null) => {
      if (!b64) return;
      const bytes = b64ToBytes(b64);
      if (bytes.length) setValue(bytes[0]); // unsigned 0..255
    };
 
    const readOnce = async () => {
      try {
        const fresh = await charRef.current!.read();
        decode(fresh.value);
      } catch (e: any) {
        setError(String(e?.message ?? 'Fatigue read failed'));
      }
    };
 
    readOnce();
    try {
      sub = charRef.current!.monitor((err, ch) => {
        if (err) return;
        if (ch?.value) decode(ch.value);
      });
    } catch {
      // If monitor not supported, stick with on-demand reads only.
    }
 
    return () => { if (sub) sub.remove(); };
  }, [entry?.id, char?.uuid]);
 
  const refresh = async () => {
    if (!charRef.current) throw new Error('Fatigue characteristic not found');
    const fresh = await charRef.current.read();
    const bytes = b64ToBytes(fresh.value || '');
    const v = bytes.length ? bytes[0] : null;
    setValue(v);
    return v;
  };
 
  return { value, supported, error, refresh };
}