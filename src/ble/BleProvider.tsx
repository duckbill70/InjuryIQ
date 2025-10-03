import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { BleManager, Device, Characteristic, State } from 'react-native-ble-plx';
import { useNotify } from '../notify/useNotify';

type ConnectedDevice = {
	id: string;
	name?: string | null;
	device: Device;
	services: string[];
	characteristicsByService: Record<string, Characteristic[]>;
};

type StartScanOpts = { timeoutMs?: number; maxDevices?: number };

type BleContextValue = {
	scanning: boolean;
	knownServiceUUID: string;
	foundDeviceIds: string[];
	connected: Record<string, ConnectedDevice>; // unchanged
	// NEW: sticky role outputs (use these instead of guessing from Object.values)
	entryA?: ConnectedDevice;
	entryB?: ConnectedDevice;

	startScan: (opts?: StartScanOpts) => Promise<void>;
	stopScan: () => void;
	disconnectDevice: (id: string) => Promise<void>;
	isPoweredOn: boolean;
	scanOnce: (opts?: StartScanOpts) => Promise<Device[]>;
};

const BleContext = createContext<BleContextValue | undefined>(undefined);

// Keep this lowercase, 128-bit (iOS prefers this)
const KNOWN_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const DEFAULT_SCAN_TIMEOUT_MS = 15_000; // 15s
const MAX_TARGET_DEVICES = 2;

// ---- Backoff helpers ----
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

function expoBackoff(attempt: number) {
	const pow = Math.min(attempt, 10); // cap exponent growth
	const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, pow));
	const jitter = Math.floor(Math.random() * 500); // +0..500ms jitter
	return base + jitter;
}

type RetryState = {
	attempt: number;
	timer?: ReturnType<typeof setTimeout> | null;
	lastError?: any;
	manual?: boolean;
};

export const BleProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
	const managerRef = useRef(new BleManager());

	// UI/state
	const [scanning, setScanning] = useState(false);
	const [foundDeviceIds, setFoundDeviceIds] = useState<string[]>([]);
	const [connected, setConnected] = useState<Record<string, ConnectedDevice>>({});
	const [isPoweredOn, setIsPoweredOn] = useState(false);

	//to use Notify
	const { notify } = useNotify();

	// Refs for stable access
	const connectedRef = useRef<Record<string, ConnectedDevice>>({});
	useEffect(() => {
		connectedRef.current = connected;
	}, [connected]);

	// Track BLE adapter state
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

	// Live-scan de-dupe
	const discoveredIdsRef = useRef<Set<string>>(new Set());

	// Per-device reconnect state
	const retryMapRef = useRef<Record<string, RetryState>>({});

	// ---------- NEW: Sticky roles ----------
	// We remember which device id is A / B and never swap them.
	const roleAIdRef = useRef<string | null>(null);
	const roleBIdRef = useRef<string | null>(null);

	const ensureRoleForId = (id: string) => {
		// If already assigned to A or B, done
		if (roleAIdRef.current === id || roleBIdRef.current === id) return;

		// Assign first available role
		if (!roleAIdRef.current) {
			roleAIdRef.current = id;
			return;
		}
		if (!roleBIdRef.current) {
			roleBIdRef.current = id;
			return;
		}
		// If both roles are already taken by OTHER ids, we do nothing:
		// app expects max 2, so any extras are unassigned (not exposed as entryA/B).
	};

	const clearRetryTimer = (id: string) => {
		const r = retryMapRef.current[id];
		if (r?.timer) {
			clearTimeout(r.timer);
			r.timer = null;
		}
	};

	const scheduleReconnect = (id: string) => {
		const st = (retryMapRef.current[id] ??= {
			attempt: 0,
			timer: null,
			manual: false,
		});

		clearRetryTimer(id);
		const delay = expoBackoff(st.attempt);
		st.attempt += 1;

		if (__DEV__) console.log(`[BLE] scheduleReconnect(${id}) in ${delay}ms (attempt ${st.attempt})`);

		st.timer = setTimeout(async () => {
			try {
				await tryReconnect(id);
				const now = retryMapRef.current[id];
				if (now) now.attempt = 0;
			} catch (e) {
				if (__DEV__) console.warn(`[BLE] reconnect failed for ${id}`, e);
				const now = retryMapRef.current[id];
				if (now) {
					now.lastError = e;
					scheduleReconnect(id);
				}
			}
		}, delay);
	};

	const ensurePoweredOn = async () => {
		if (!isPoweredOn) {
			const current = await managerRef.current.state();
			if (current !== State.PoweredOn) {
				throw new Error('Bluetooth is not powered on.');
			}
		}
	};

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

		const entry: ConnectedDevice = {
			id: device.id,
			name: device.name,
			device,
			services: services.map((s) => s.uuid.toLowerCase()),
			characteristicsByService,
		};

		// Assign/ensure sticky role BEFORE writing to state so entryA/entryB derive correctly
		ensureRoleForId(device.id);

		setConnected((prev) => ({ ...prev, [device.id]: entry }));
	};

	const registerDisconnectHandler = (id: string) => {
		managerRef.current.onDeviceDisconnected(id, (error, dev) => {
			const friendlyName = connectedRef.current[id]?.name || id;
			if (__DEV__) console.warn(`[BLE] onDeviceDisconnected ${friendlyName}`, error?.message ?? '');
			notify({
				title: 'InjuryIQ',
				body: `Device disconnected - ${friendlyName}`,
				dedupeKey: `ble:disconnected`,
				foreground: true, // show even when app is open
				bypassDedupe: __DEV__ ? true : false, // remove later; ensures it’s not suppressed while testing
			});
			// NOTE: we remove from connected, BUT we DO NOT clear roleAId/roleBId.
			setConnected((prev) => {
				const next = { ...prev };
				delete next[id];
				return next;
			});
			scheduleReconnect(id);
		});
	};

	const connectToDevice = async (device: Device, opts?: { manual?: boolean }) => {
		const manager = managerRef.current;
		if (connectedRef.current[device.id]) return;

		(retryMapRef.current[device.id] ??= {
			attempt: 0,
			timer: null,
			manual: !!opts?.manual,
		}).manual = !!opts?.manual;

		const connectedDevice = await manager.connectToDevice(device.id, {
			autoConnect: false,
		});

		if (Platform.OS === 'android') {
			try {
				await connectedDevice.requestMTU(185);
			} catch {}
		}

		registerDisconnectHandler(device.id);
		await discoverAllForDevice(connectedDevice);

		clearRetryTimer(device.id);
		if (retryMapRef.current[device.id]) retryMapRef.current[device.id].attempt = 0;
	};

	const tryReconnect = async (id: string) => {
		await ensurePoweredOn();
		if (connectedRef.current[id]) return;

		const d = await managerRef.current.connectToDevice(id, {
			autoConnect: false,
		});
		if (Platform.OS === 'android') {
			try {
				await d.requestMTU(185);
			} catch {}
		}
		registerDisconnectHandler(id);
		await discoverAllForDevice(d);
		const friendlyName = d.name || id;
		if (__DEV__) console.log(`[BLE] reconnected ${friendlyName}`);
		notify({
			title: 'InjuryIQ',
			body: `Device reconnected - ${friendlyName}`,
			dedupeKey: `ble:reconnected`,
			foreground: true, // show even when app is open
			bypassDedupe: __DEV__ ? true : false, // remove later; ensures it’s not suppressed while testing
		});
	};

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

		managerRef.current.startDeviceScan([KNOWN_SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
			if (error) {
				clearTimeout(timeout);
				stopScan();
				console.warn('Scan error:', error);
				return;
			}
			if (!device) return;

			const id = device.id;
			if (discoveredIdsRef.current.has(id)) return;
			discoveredIdsRef.current.add(id);
			setFoundDeviceIds(Array.from(discoveredIdsRef.current));

			// Eager connect
			connectToDevice(device, { manual: true }).catch((e) => console.warn('Connect failed', e));

			if (discoveredIdsRef.current.size >= maxDevices) {
				clearTimeout(timeout);
				stopScan();
			}
		});
	};

	const disconnectDevice = async (id: string) => {
		const manager = managerRef.current;
		clearRetryTimer(id);
		delete retryMapRef.current[id];

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
			// IMPORTANT: do NOT clear roleAId/roleBId — sticky roles persist
		}
	};

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
				if (ok) resolve(payload as Device[]);
				else reject(payload as Error);
			};

			const timer = setTimeout(() => settle(true, results), timeoutMs);

			try {
				managerRef.current.startDeviceScan([KNOWN_SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
					if (error) {
						console.warn('scanOnce error:', error);
						return settle(false, error);
					}
					if (!device) return;
					const id = device.id;
					if (localSet.has(id)) return;
					localSet.add(id);
					results.push(device);
					setFoundDeviceIds(Array.from(localSet));
					if (results.length >= maxDevices) settle(true, results);
				});
			} catch (e: any) {
				settle(false, e);
			}
		});
	};

	// Derive sticky entries A/B from role ids + current connections
	const entryA = roleAIdRef.current ? connected[roleAIdRef.current] ?? undefined : undefined;
	const entryB = roleBIdRef.current ? connected[roleBIdRef.current] ?? undefined : undefined;

	useEffect(() => {
		if (__DEV__) {
			console.log('scanning:', scanning);
			console.log('foundDeviceIds:', foundDeviceIds);
			console.log('connected keys:', Object.keys(connected));
			console.log('roles:', { A: roleAIdRef.current, B: roleBIdRef.current });
		}
	}, [foundDeviceIds, scanning, connected]);

	const value = useMemo<BleContextValue>(
		() => ({
			scanning,
			knownServiceUUID: KNOWN_SERVICE_UUID,
			foundDeviceIds,
			connected,
			entryA,
			entryB,
			startScan,
			stopScan,
			disconnectDevice,
			isPoweredOn,
			scanOnce,
		}),
		[scanning, foundDeviceIds, connected, isPoweredOn, entryA, entryB],
	);

	return <BleContext.Provider value={value}>{children}</BleContext.Provider>;
};

export const useBle = () => {
	const ctx = useContext(BleContext);
	if (!ctx) throw new Error('useBle must be used within <BleProvider>');
	return ctx;
};
