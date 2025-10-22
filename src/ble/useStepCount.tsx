import { useEffect, useMemo, useRef, useState } from 'react';
import type { Characteristic, Device } from 'react-native-ble-plx';

export type ConnectedDeviceLike = {
	id: string;
	device: Device;
	services: string[];
	characteristicsByService: Record<string, Characteristic[]>;
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

/* ------------------------ Running Speed and Cadence UUIDs ----------------------- */

// Running Speed and Cadence Service
const RSC_SVC_UUIDS = ['1814', '00001814-0000-1000-8000-00805f9b34fb'];
// RSC Measurement characteristic (for step count data)
const RSC_MEASUREMENT_UUIDS = ['2a53', '00002a53-0000-1000-8000-00805f9b34fb'];

/* ------------------------------ Base64 decoder ------------------------------ */

function b64ToBytes(b64: string): Uint8Array {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
	const str = b64.replace(/[^A-Za-z0-9+/=]/g, '');
	const out: number[] = [];
	let i = 0;
	while (i < str.length) {
		const e1 = chars.indexOf(str[i++]);
		const e2 = chars.indexOf(str[i++]);
		const e3 = chars.indexOf(str[i++]);
		const e4 = chars.indexOf(str[i++]);
		// eslint-disable-next-line no-bitwise
		const c1 = (e1 << 2) | (e2 >> 4);
		// eslint-disable-next-line no-bitwise
		const c2 = ((e2 & 15) << 4) | (e3 >> 2);
		// eslint-disable-next-line no-bitwise
		const c3 = ((e3 & 3) << 6) | e4;
		out.push(c1);
		if (e3 !== 64) out.push(c2);
		if (e4 !== 64) out.push(c3);
	}
	return new Uint8Array(out);
}

/* ----------------------------- Error classifier ----------------------------- */

function isCancellationError(err: unknown) {
	const s = String((err as Error)?.message ?? err ?? '');
	return /cancel|cancelled|canceled|aborted|device disconnected|not connected|not found/i.test(s);
}

/* ------------------------------ Char resolution ----------------------------- */

function findStepCountCharacteristic(entry: ConnectedDeviceLike): Characteristic | null {
	// Find a service key matching 0x1814 (Running Speed and Cadence)
	const svcKey =
		entry.services.find(s => RSC_SVC_UUIDS.some(w => sameUuid(s, w))) ??
		entry.services.find(s => sameUuid(s, '00001814-0000-1000-8000-00805f9b34fb')) ??
		entry.services.find(s => sameUuid(s, '1814'));

	if (!svcKey) return null;

	// Try exact, lowercased, and normalized keys
	const candidates =
		entry.characteristicsByService[svcKey] ??
		entry.characteristicsByService[svcKey.toLowerCase()] ??
		entry.characteristicsByService[to128(svcKey)] ??
		[];

	const char = candidates.find(c => RSC_MEASUREMENT_UUIDS.some(w => sameUuid(c.uuid, w)));
	return char ?? null;
}

/* ------------------------- Step Count Data Parser -------------------------- */

interface StepCountData {
	stepCount: number;
	timestamp: number; // when this reading was taken
}

function parseStepCountData(bytes: Uint8Array): StepCountData | null {
	if (bytes.length < 4) return null;
	
	// Assuming your BLE device sends step count as a 32-bit unsigned integer (little-endian)
	// eslint-disable-next-line no-bitwise
	const stepCount = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
	
	return {
		stepCount,
		timestamp: Date.now()
	};
}

/* --------------------------------- The hook -------------------------------- */

export function useStepCount(
	entry: ConnectedDeviceLike | undefined,
	opts?: {
		/** Prefer notifications when available (default true). */
		subscribe?: boolean;
		/** Polling interval (ms) when notifications are unavailable (default 30000). */
		intervalMs?: number;
		/** Max wait for the characteristic to appear after reconnect (default 5000). */
		waitMs?: number;
	}
) {
	const subscribe = opts?.subscribe ?? true;
	const intervalMs = opts?.intervalMs ?? 30000; // 30s polling for step count
	const waitMs = opts?.waitMs ?? 5000;

	const [stepData, setStepData] = useState<StepCountData | null>(null);
	const [supported, setSupported] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	// Resolve characteristic from the current entry snapshot
	const stepChar = useMemo(
		() => (entry ? findStepCountCharacteristic(entry) : null),
		[entry] // new connected device → recompute
	);

	// Keep latest char to avoid acting on stale refs inside async callbacks
	const charRef = useRef<Characteristic | null>(null);
	useEffect(() => { charRef.current = stepChar ?? null; }, [stepChar]);

	useEffect(() => {
		setError(null);

		if (!entry) {
			setSupported(false);
			setStepData(null);
			return;
		}

		let cancelled = false;
		let unsubscribing = false;
		let sub: { remove: () => void } | null = null;
		let intervalId: ReturnType<typeof setInterval> | null = null;

		// Wait for Step Count char to appear after reconnect
		const waitForChar = async (): Promise<Characteristic | null> => {
			const startedAt = Date.now();
			let delay = 100; // ms
			while (!cancelled && Date.now() - startedAt < waitMs) {
				const c = charRef.current ?? (entry ? findStepCountCharacteristic(entry) : null);
				if (c) return c;
				await new Promise<void>(resolve => setTimeout(resolve, delay));
				delay = Math.min(600, Math.floor(delay * 1.6) + Math.floor(Math.random() * 40));
			}
			return charRef.current ?? null;
		};

		const decodeAndSet = (value?: string | null) => {
			if (!value) return;
			const bytes = b64ToBytes(value);
			const parsed = parseStepCountData(bytes);
			if (parsed) {
				setStepData(parsed);
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
			} catch (e: unknown) {
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
				setError(String((e as Error)?.message ?? 'Step count read failed'));
			}
		};

		// Kick an immediate read (waits briefly for char if needed)
		readOnce();

		// Prefer notifications; fall back to polling if monitor fails/unsupported
		const startMonitorOrPoll = async () => {
			const c = await waitForChar();
			if (!c) {
				if (intervalMs > 0) {
					intervalId = setInterval(readOnce, intervalMs);
				}
				return;
			}
			setSupported(true);

			if (subscribe) {
				try {
					sub = c.monitor((err, ch) => {
						if (err) {
							if (!intervalId && intervalMs > 0) {
								intervalId = setInterval(readOnce, intervalMs);
							}
							if (!isCancellationError(err) && !unsubscribing) {
								setError(String(err?.message ?? 'Step count notify failed'));
							}
							return;
						}
						if (!cancelled && ch?.value) decodeAndSet(ch.value);
					});
				} catch (e: unknown) {
					// Notifications not supported → polling
					if (intervalMs > 0) {
						intervalId = setInterval(readOnce, intervalMs);
					}
					if (!isCancellationError(e)) {
						setError(String((e as Error)?.message ?? 'Step count monitor failed'));
					}
				}
			} else if (intervalMs > 0) {
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
	}, [entry, stepChar, subscribe, intervalMs, waitMs]);

	// Convenience getters
	const stepCount = stepData?.stepCount ?? null;
	const lastUpdated = stepData?.timestamp ?? null;

	return { 
		stepCount, 
		stepData, 
		lastUpdated, 
		supported, 
		error 
	};
}