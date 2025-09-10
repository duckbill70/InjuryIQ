//Keeps a circular history + emits downsampled updates (avoids re-render per notify). Useful for sparklines, thresholds, etc.
// hooks/useFatigueTrend.tsx
import { useEffect, useRef, useState } from 'react';
import type { ConnectedDeviceLike } from './useFatigueValue';
import { useFatigueValue } from './useFatigueValue';
 
type Point = { t: number; v: number };
export function useFatigueTrend(
  entry: ConnectedDeviceLike | undefined,
  opts?: { maxPoints?: number; emitEveryMs?: number }
) {
  const maxPoints = opts?.maxPoints ?? 300;
  const emitEveryMs = opts?.emitEveryMs ?? 250;
 
  const { value } = useFatigueValue(entry);
  const bufRef = useRef<Point[]>([]);
  const [snapshot, setSnapshot] = useState<Point[]>([]);
  const lastEmitRef = useRef(0);
 
  useEffect(() => {
    if (value == null) return;
    const now = Date.now();
    const buf = bufRef.current;
    buf.push({ t: now, v: value });
    if (buf.length > maxPoints) buf.splice(0, buf.length - maxPoints);
 
    if (now - lastEmitRef.current >= emitEveryMs) {
      lastEmitRef.current = now;
      // clone to state (cheap & throttled)
      setSnapshot([...buf]);
    }
  }, [value, maxPoints, emitEveryMs]);
 
  // Derived quick stats
  const avg =
    snapshot.length ? snapshot.reduce((s, p) => s + p.v, 0) / snapshot.length : null;
  const latest = snapshot.length ? snapshot[snapshot.length - 1] : null;
 
  return { history: snapshot, latest, avg };
}