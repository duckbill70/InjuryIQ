// hooks/useRssi.tsx
import { useEffect, useState } from 'react';
import type { Device } from 'react-native-ble-plx';

export function useRssi(device: Device | undefined, intervalMs = 1000) {
  const [rssi, setRssi] = useState<number | null>(null);

  useEffect(() => {
    if (!device) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const tick = async () => {
      try {
        const updated = await device.readRSSI(); // returns Device with updated rssi
        if (!cancelled) setRssi(updated.rssi ?? null);
      } catch {
        // Usually means the device disconnected or read not available; stop quietly.
        stop();
      }
    };

    const start = () => {
      tick(); // fire immediately for snappy UI
      timer = setInterval(tick, intervalMs);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [device?.id, intervalMs]);

  return rssi;
}