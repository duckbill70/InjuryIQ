import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { BleManager, Device, Characteristic, State } from 'react-native-ble-plx';
import { useNotify } from '../notify/useNotify';

export type DevicePosition = 'leftFoot' | 'rightFoot' | 'racket';

export type ConnectedDevice = {
	id: string;
	name?: string | null;
	device: Device;
	services: string[];
	characteristicsByService: Record<string, Characteristic[]>;
	position?: DevicePosition;
	color?: string;
	assignedAt?: Date;
};

type StartScanOpts = { timeoutMs?: number; maxDevices?: number };

export type BleContextValue = {
	scanning: boolean;
	knownServiceUUID: string;
	foundDeviceIds: string[];
	connected: Record<string, ConnectedDevice>;
	
	// Device positioning
	devicesByPosition: {
		leftFoot?: ConnectedDevice;
		rightFoot?: ConnectedDevice;
		racket?: ConnectedDevice;
	};
	
	// Device management
	startScan: (opts?: StartScanOpts) => Promise<void>;
	stopScan: () => void;
	disconnectDevice: (id: string) => Promise<void>;
	assignDevicePosition: (deviceId: string, position: DevicePosition, color?: string) => void;
	unassignDevicePosition: (deviceId: string) => void;
	updateDeviceColor: (deviceId: string, color: string) => void;
	
	// System status
	isPoweredOn: boolean;
	scanOnce: (opts?: StartScanOpts) => Promise<Device[]>;
};

const BleContext = createContext<BleContextValue | undefined>(undefined);

// Keep this lowercase, 128-bit (iOS prefers this)
const KNOWN_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const DEFAULT_SCAN_TIMEOUT_MS = 15_000; // 15s
const MAX_TARGET_DEVICES = 3; // Updated for 3 devices

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
	lastError?: Error;
	manual?: boolean;
};

// Default colors for device positions
const DEFAULT_DEVICE_COLORS = {
	leftFoot: '#FF6B6B',    // Red
	rightFoot: '#4ECDC4',   // Teal
	racket: '#45B7D1',      // Blue
} as const;

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
		const manager = managerRef.current;
		return () => {
			try {
				manager.destroy();
			} catch {}
		};
	}, []);

	// Live-scan de-dupe
	const discoveredIdsRef = useRef<Set<string>>(new Set());

	// Per-device reconnect state
	const retryMapRef = useRef<Record<string, RetryState>>({});

	// Device positioning functions
	const assignDevicePosition = useCallback((deviceId: string, position: DevicePosition, color?: string) => {
		setConnected((prev) => {
			const device = prev[deviceId];
			if (!device) return prev;

			// Check if position is already taken by another device
			const existingDeviceWithPosition = Object.values(prev).find(
				d => d.id !== deviceId && d.position === position
			);

			const updates: Record<string, ConnectedDevice> = { ...prev };

			// If position is taken, clear it from the existing device
			if (existingDeviceWithPosition) {
				updates[existingDeviceWithPosition.id] = {
					...existingDeviceWithPosition,
					position: undefined,
					color: undefined,
				};
			}

			// Assign new position to the device
			updates[deviceId] = {
				...device,
				position,
				color: color || DEFAULT_DEVICE_COLORS[position],
				assignedAt: new Date(),
			};

			return updates;
		});
	}, []);

	const unassignDevicePosition = useCallback((deviceId: string) => {
		setConnected((prev) => {
			const device = prev[deviceId];
			if (!device) return prev;

			return {
				...prev,
				[deviceId]: {
					...device,
					position: undefined,
					color: undefined,
					assignedAt: undefined,
				},
			};
		});
	}, []);

	const updateDeviceColor = useCallback((deviceId: string, color: string) => {
		setConnected((prev) => {
			const device = prev[deviceId];
			if (!device) return prev;

			return {
				...prev,
				[deviceId]: {
					...device,
					color,
				},
			};
		});
	}, []);

	// Derive devices by position
	const devicesByPosition = useMemo(() => {
		const devices = Object.values(connected);
		return {
			leftFoot: devices.find(d => d.position === 'leftFoot'),
			rightFoot: devices.find(d => d.position === 'rightFoot'),
			racket: devices.find(d => d.position === 'racket'),
		};
	}, [connected]);

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
					now.lastError = e instanceof Error ? e : new Error(String(e));
					scheduleReconnect(id);
				}
			}
		}, delay);
	};

	const ensurePoweredOn = useCallback(async () => {
		if (!isPoweredOn) {
			const current = await managerRef.current.state();
			if (current !== State.PoweredOn) {
				throw new Error('Bluetooth is not powered on.');
			}
		}
	}, [isPoweredOn]);

	const stopScan = useCallback(() => {
		try {
			managerRef.current.stopDeviceScan();
		} catch {}
		setScanning(false);
	}, []);

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

		setConnected((prev) => ({ ...prev, [device.id]: entry }));
	};

	const registerDisconnectHandler = (id: string) => {
		managerRef.current.onDeviceDisconnected(id, (error, _dev) => {
			const friendlyName = connectedRef.current[id]?.name || id;
			if (__DEV__) console.warn(`[BLE] onDeviceDisconnected ${friendlyName}`, error?.message ?? '');
			notify({
				title: 'InjuryIQ',
				body: `Device disconnected - ${friendlyName}`,
				dedupeKey: `ble:disconnected`,
				foreground: true, // show even when app is open
				bypassDedupe: __DEV__ ? true : false, // remove later; ensures it's not suppressed while testing
			});
			// Remove from connected but preserve position assignment for sticky behavior
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
			bypassDedupe: __DEV__ ? true : false, // remove later; ensures it's not suppressed while testing
		});
	};

	const startScan: BleContextValue['startScan'] = useCallback(async (opts) => {
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
	}, [scanning, isPoweredOn, stopScan, ensurePoweredOn, connectToDevice]);

	const disconnectDevice = useCallback(async (id: string) => {
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
		}
	}, []);

	const scanOnce: BleContextValue['scanOnce'] = useCallback(async (opts) => {
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
			} catch (e) {
				settle(false, e instanceof Error ? e : new Error(String(e)));
			}
		});
	}, [ensurePoweredOn]);

	useEffect(() => {
		if (__DEV__) {
			console.log('scanning:', scanning);
			console.log('foundDeviceIds:', foundDeviceIds);
			console.log('connected keys:', Object.keys(connected));
			console.log('devicesByPosition:', devicesByPosition);
		}
	}, [foundDeviceIds, scanning, connected, devicesByPosition]);

	const value = useMemo<BleContextValue>(
		() => ({
			scanning,
			knownServiceUUID: KNOWN_SERVICE_UUID,
			foundDeviceIds,
			connected,
			devicesByPosition,
			startScan,
			stopScan,
			disconnectDevice,
			assignDevicePosition,
			unassignDevicePosition,
			updateDeviceColor,
			isPoweredOn,
			scanOnce,
		}),
		[
			scanning,
			foundDeviceIds,
			connected,
			devicesByPosition,
			startScan,
			stopScan,
			disconnectDevice,
			assignDevicePosition,
			unassignDevicePosition,
			updateDeviceColor,
			isPoweredOn,
			scanOnce,
		],
	);

	return <BleContext.Provider value={value}>{children}</BleContext.Provider>;
};

export const useBle = () => {
	const ctx = useContext(BleContext);
	if (!ctx) throw new Error('useBle must be used within <BleProvider>');
	return ctx;
};