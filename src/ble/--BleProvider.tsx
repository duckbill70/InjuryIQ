import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { BleManager, Device, Characteristic, State } from 'react-native-ble-plx';

type DiscoveredChars = {
  serviceUUID: string;
  characteristics: Characteristic[];
};

type ConnectedDevice = {
  id: string;
  name?: string | null;
  device: Device;
  services: string[]; // list of service UUIDs
  characteristicsByService: Record<string, Characteristic[]>;
};

type StartScanOpts = { timeoutMs?: number; maxDevices?: number };

type BleContextValue = {
  scanning: boolean;
  knownServiceUUID: string;
  foundDeviceIds: string[];
  connected: Record<string, ConnectedDevice>;
  startScan: (opts?: StartScanOpts) => Promise<void>;
  stopScan: () => void;
  disconnectDevice: (id: string) => Promise<void>;
  isPoweredOn: boolean;
  /**
   * Scan once and resolve with up to N unique devices that advertise the known service.
   * No connections are made. The scan is stopped automatically on resolve/reject.
   */
  scanOnce: (opts?: StartScanOpts) => Promise<Device[]>;
};

const BleContext = createContext<BleContextValue | undefined>(undefined);

// Keep this lowercase, 128-bit (iOS prefers this)
const KNOWN_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const DEFAULT_SCAN_TIMEOUT_MS = 15_000; // 15s
const MAX_TARGET_DEVICES = 2;

export const BleProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const managerRef = useRef(new BleManager());

  // UI/state
  const [scanning, setScanning] = useState(false);
  const [foundDeviceIds, setFoundDeviceIds] = useState<string[]>([]);
  const [connected, setConnected] = useState<Record<string, ConnectedDevice>>({});
  const [isPoweredOn, setIsPoweredOn] = useState(false);

  // De-dupe guard for the live scan path
  const discoveredIdsRef = useRef<Set<string>>(new Set());

  // Keep a ref of connected so callbacks never read stale state
  const connectedRef = useRef<Record<string, ConnectedDevice>>({});
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  // Logging (dev only)
  useEffect(() => {
    if (__DEV__) {
      console.log('scanning:', scanning);
      console.log('foundDeviceIds:', foundDeviceIds);
      console.log('connected:', connected);
    }
  }, [foundDeviceIds, scanning, connected]);

  // Track BLE adapter state (important on iOS)
  useEffect(() => {
    const sub = managerRef.current.onStateChange((newState: State) => {
      setIsPoweredOn(newState === State.PoweredOn);
    }, true);
    return () => sub.remove();
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      try {
        managerRef.current.destroy();
      } catch {}
    };
  }, []);

  const stopScan = () => {
    try {
      managerRef.current.stopDeviceScan();
    } catch {}
    setScanning(false);
  };

  const discoverAllForDevice = async (device: Device) => {
    const manager = managerRef.current;
    await manager.discoverAllServicesAndCharacteristicsForDevice(device.id);
    const services = await manager.servicesForDevice(device.id);

    const characteristicsByService: Record<string, Characteristic[]> = {};
    for (const svc of services) {
      const chars = await manager.characteristicsForDevice(device.id, svc.uuid);
      characteristicsByService[svc.uuid.toLowerCase()] = chars;
    }

    const connectedEntry: ConnectedDevice = {
      id: device.id,
      name: device.name,
      device,
      services: services.map((s) => s.uuid.toLowerCase()),
      characteristicsByService,
    };

    setConnected((prev) => ({ ...prev, [device.id]: connectedEntry }));
  };

  const connectToDevice = async (device: Device) => {
    const manager = managerRef.current;

    // Already connected?
    if (connectedRef.current[device.id]) return;

    const connectedDevice = await manager.connectToDevice(device.id, { autoConnect: false });

    if (Platform.OS === 'android') {
      try {
        await connectedDevice.requestMTU(185);
      } catch {}
    }
    await discoverAllForDevice(connectedDevice);
  };

  const ensurePoweredOn = async () => {
    if (!isPoweredOn) {
      const current = await managerRef.current.state();
      if (current !== State.PoweredOn) {
        throw new Error('Bluetooth is not powered on.');
      }
    }
  };

  /**
   * UI live-scan: updates context state as devices arrive; no connects here.
   */
  const startScan: BleContextValue['startScan'] = async (opts) => {
    if (scanning) return;

    await ensurePoweredOn();

    const timeoutMs = opts?.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;
    const maxDevices = opts?.maxDevices ?? MAX_TARGET_DEVICES;

    discoveredIdsRef.current.clear();
    setFoundDeviceIds([]);
    setScanning(true);

    const timeout = setTimeout(() => {
      stopScan();
    }, timeoutMs);

    managerRef.current.startDeviceScan(
      [KNOWN_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          clearTimeout(timeout);
          stopScan();
          console.warn('Scan error:', error);
          return;
        }
        if (!device) return;

        const id = device.id;

        // De-dupe via ref (avoids stale state races)
        if (discoveredIdsRef.current.has(id)) return;
        discoveredIdsRef.current.add(id);

        // Reflect in state for UI
        setFoundDeviceIds(Array.from(discoveredIdsRef.current));

        // If you later re-enable connect during live scan, do it here:
        connectToDevice(device).catch(e => console.warn('Connect failed', e));

        const reachedTarget = discoveredIdsRef.current.size >= maxDevices;
        if (reachedTarget) {
          clearTimeout(timeout);
          stopScan();
        }
      }
    );
  };

  const disconnectDevice = async (id: string) => {
    const manager = managerRef.current;
    try {
      await manager.cancelDeviceConnection(id);
    } catch {
      // ignore if already disconnected
    } finally {
      setConnected((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setFoundDeviceIds((prev) => prev.filter((x) => x !== id));
      discoveredIdsRef.current.delete(id);
    }
  };

  /**
   * scanOnce: resolves with up to N unique devices that advertise the known service.
   * - No connections are made.
   * - Stops scanning and cleans up on resolve or timeout/error.
   * - Safe against duplicate advertising callbacks.
   */
  const scanOnce: BleContextValue['scanOnce'] = async (opts) => {
    await ensurePoweredOn();

    const timeoutMs = opts?.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;
    const maxDevices = opts?.maxDevices ?? MAX_TARGET_DEVICES;

    return new Promise<Device[]>((resolve, reject) => {
      const localSet = new Set<string>();
      const results: Device[] = [];
      let settled = false;

      const settle = (ok: boolean, payload?: Device[] | Error) => {
        if (settled) return;
        settled = true;
        try {
          managerRef.current.stopDeviceScan();
        } catch {}
        clearTimeout(timer);
        if (ok) {
          resolve(payload as Device[]);
        } else {
          reject(payload as Error);
        }
      };

      const timer = setTimeout(() => {
        // Time’s up: resolve with whatever we have
        settle(true, results);
      }, timeoutMs);

      try {
        managerRef.current.startDeviceScan(
          [KNOWN_SERVICE_UUID],
          { allowDuplicates: false },
          (error, device) => {
            if (error) {
              console.warn('scanOnce error:', error);
              return settle(false, error);
            }
            if (!device) return;

            const id = device.id;
            if (localSet.has(id)) return;

            localSet.add(id);
            results.push(device);

            // Keep the UI in sync (optional; comment out if you want this fully detached from UI)
            setFoundDeviceIds(Array.from(localSet));

            if (results.length >= maxDevices) {
              settle(true, results);
            }
          }
        );
      } catch (e: any) {
        settle(false, e);
      }
    });
  };

  const value = useMemo<BleContextValue>(
    () => ({
      scanning,
      knownServiceUUID: KNOWN_SERVICE_UUID,
      foundDeviceIds,
      connected,
      startScan,
      stopScan,
      disconnectDevice,
      isPoweredOn,
      scanOnce,
    }),
    [scanning, foundDeviceIds, connected, isPoweredOn]
  );

  return <BleContext.Provider value={value}>{children}</BleContext.Provider>;
};

export const useBle = () => {
  const ctx = useContext(BleContext);
  if (!ctx) throw new Error('useBle must be used within <BleProvider>');
  return ctx;
};
