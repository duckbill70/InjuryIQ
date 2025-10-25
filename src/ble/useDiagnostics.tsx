import { useEffect, useMemo, useRef, useState } from 'react';
import type { Characteristic, Device } from 'react-native-ble-plx';

/** Shape your BleProvider hands to consumers (matches your ConnectedDevice) */
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

/* --------------------------- Diagnostics UUIDs --------------------------- */

const DIAGNOSTICS_SVC_UUID = '87654321-4321-8765-4321-210987654321';
// Optimized to 2 characteristics (from 5)
const ERROR_CODE_CHAR_UUID = '87654321-4321-8765-4321-210987654322';
const SYSTEM_STATUS_CHAR_UUID = '87654321-4321-8765-4321-210987654325';

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

/* ------------------------------ Characteristic resolution ------------------------------ */

function findDiagnosticsCharacteristics(entry: ConnectedDeviceLike): {
	errorCode: Characteristic | null;
	systemStatus: Characteristic | null;
} {
	// Find diagnostics service
	const svcKey = entry.services.find(s => sameUuid(s, DIAGNOSTICS_SVC_UUID));
	
	if (!svcKey) {
		return {
			errorCode: null,
			systemStatus: null
		};
	}

	const candidates = 
		entry.characteristicsByService[svcKey] ??
		entry.characteristicsByService[svcKey.toLowerCase()] ??
		[];

	return {
		errorCode: candidates.find(c => sameUuid(c.uuid, ERROR_CODE_CHAR_UUID)) ?? null,
		systemStatus: candidates.find(c => sameUuid(c.uuid, SYSTEM_STATUS_CHAR_UUID)) ?? null
	};
}

/* ----------------------------- Data Parsers ----------------------------- */

// Error codes from the new specification
const ERROR_DESCRIPTIONS: Record<number, string> = {
	0: 'No Error',
	1: 'IMU Initialization Failed',
	2: 'IMU Data Read Failure', 
	3: 'BLE Initialization Failed',
	4: 'BLE Connection Lost',
	5: 'Flash Write Failed',
	6: 'Flash Read Failed',
	7: 'Battery Read Failed',
	8: 'Low Battery',
	9: 'System Overload',
	10: 'Watchdog Reset',
	11: 'Serial Debug Enabled',
	12: 'TensorFlow Disabled',
	13: 'Connection Supervision Timeout',
	14: 'Signal Strength Too Low',
	15: 'MTU Negotiation Failed',
	16: 'BLE Characteristic Write Failed',
	17: 'BLE Transmission Backpressure',
	255: 'Unknown Error'
};

// LED Mode descriptions
const LED_MODE_DESCRIPTIONS: Record<number, string> = {
	0: 'Standby (Amber)',
	1: 'Active (Pulsing Red)',
	2: 'Active (Pulsing Green)', 
	3: 'Active (Pulsing Blue)',
	4: 'Active (Solid Red)',
	5: 'Active (Solid Green)',
	6: 'Active (Solid Blue)',
	10: 'Low Power (Off)'
};

interface SystemStatus {
	bleStatus: number;
	imuStatus: number;
	ledMode: number;
	batteryLevel: number;
	uptime: number;
	imuSamplesSent: number;
	imuSamplesDropped: number;
	totalErrorCount: number;
	totalDisconnectCount: number;
	bleWriteFailures: number;
	maxLoopTime: number;
	reserved: Uint8Array;
	// Computed properties
	imuEfficiency: number;
	isHealthy: boolean;
}

interface DiagnosticsData {
	errorCode: number;
	errorDescription: string;
	systemStatus: SystemStatus | null;
	lastUpdate: Date;
}

function parseSystemStatus(bytes: Uint8Array): SystemStatus | null {
	if (bytes.length < 36) return null; // Minimum size for new expanded 36-byte structure
	
	// Parse expanded 36-byte packed struct (little endian) with BLE monitoring data
	const bleStatus = bytes[0];
	const imuStatus = bytes[1];
	const ledMode = bytes[2];
	const batteryLevel = bytes[3];
	
	// eslint-disable-next-line no-bitwise
	const uptime = (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
	// eslint-disable-next-line no-bitwise
	const imuSamplesSent = (bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24)) >>> 0;
	// eslint-disable-next-line no-bitwise
	const imuSamplesDropped = (bytes[12] | (bytes[13] << 8) | (bytes[14] << 16) | (bytes[15] << 24)) >>> 0;
	// eslint-disable-next-line no-bitwise
	const totalErrorCount = (bytes[16] | (bytes[17] << 8) | (bytes[18] << 16) | (bytes[19] << 24)) >>> 0;
	// eslint-disable-next-line no-bitwise
	const totalDisconnectCount = (bytes[20] | (bytes[21] << 8) | (bytes[22] << 16) | (bytes[23] << 24)) >>> 0;
	// eslint-disable-next-line no-bitwise
	const bleWriteFailures = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16) | (bytes[27] << 24)) >>> 0;
	// eslint-disable-next-line no-bitwise
	const maxLoopTime = (bytes[28] | (bytes[29] << 8) | (bytes[30] << 16) | (bytes[31] << 24)) >>> 0;
	// Reserved bytes 32-35 (4 bytes)
	const reserved = bytes.slice(32, 36);
	
	// Calculate computed properties
	const total = imuSamplesSent + imuSamplesDropped;
	const imuEfficiency = total > 0 ? (imuSamplesSent / total) * 100.0 : 100.0;
	const isHealthy = bleStatus >= 1 && imuStatus === 1 && batteryLevel > 10; // BLE available/connected + IMU ready + battery OK
	
	return {
		bleStatus,
		imuStatus,
		ledMode,
		batteryLevel,
		uptime,
		imuSamplesSent,
		imuSamplesDropped,
		totalErrorCount,
		totalDisconnectCount,
		bleWriteFailures,
		maxLoopTime,
		reserved,
		imuEfficiency,
		isHealthy
	};
}

function getErrorDescription(errorCode: number): string {
	return ERROR_DESCRIPTIONS[errorCode] ?? `Undefined Error (${errorCode})`;
}

function getLedModeDescription(ledMode: number): string {
	return LED_MODE_DESCRIPTIONS[ledMode] ?? `Unknown Mode (${ledMode})`;
}

/* --------------------------------- The hook -------------------------------- */

export function useDiagnostics(
	entry: ConnectedDeviceLike | undefined,
	opts?: {
		/** Prefer notifications when available (default true). */
		subscribe?: boolean;
		/** Polling interval (ms) when notifications are unavailable (default 10000). */
		intervalMs?: number;
		/** Max wait for characteristics to appear after reconnect (default 5000). */
		waitMs?: number;
	}
) {
	const subscribe = opts?.subscribe ?? true;
	const intervalMs = opts?.intervalMs ?? 10000; // 10s polling for diagnostics
	const waitMs = opts?.waitMs ?? 5000;

	const [diagnosticsData, setDiagnosticsData] = useState<DiagnosticsData | null>(null);
	const [supported, setSupported] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	// Resolve characteristics from the current entry snapshot
	const diagnosticsChars = useMemo(
		() => (entry ? findDiagnosticsCharacteristics(entry) : {
			errorCode: null,
			systemStatus: null
		}),
		[entry] // new connected device → recompute
	);

	// Keep latest chars to avoid acting on stale refs inside async callbacks
	const charsRef = useRef<typeof diagnosticsChars>(diagnosticsChars);
	useEffect(() => { 
		charsRef.current = diagnosticsChars; 
	}, [diagnosticsChars]);

	useEffect(() => {
		setError(null);

		if (!entry) {
			setSupported(false);
			setDiagnosticsData(null);
			return;
		}

		let cancelled = false;
		let unsubscribing = false;
		const subscriptions: Array<{ remove: () => void }> = [];
		let intervalId: ReturnType<typeof setInterval> | null = null;

		// Wait for characteristics to appear after reconnect
		const waitForChars = async () => {
			const startedAt = Date.now();
			let delay = 100; // ms
			while (!cancelled && Date.now() - startedAt < waitMs) {
				const chars = charsRef.current ?? (entry ? findDiagnosticsCharacteristics(entry) : null);
				if (chars && (chars.errorCode || chars.systemStatus)) {
					return chars;
				}
				await new Promise<void>(resolve => setTimeout(resolve, delay));
				delay = Math.min(600, Math.floor(delay * 1.6) + Math.floor(Math.random() * 40));
			}
			return charsRef.current;
		};

		const readAllCharacteristics = async () => {
			try {
				const chars = charsRef.current ?? (await waitForChars());
				if (!chars || (!chars.errorCode && !chars.systemStatus)) {
					setSupported(false);
					return;
				}

				setSupported(true);

				// Read both characteristics in parallel
				const promises: Promise<void>[] = [];
				let errorCode = 0;
				let systemStatus: SystemStatus | null = null;

				if (chars.errorCode) {
					promises.push(
						chars.errorCode.read().then(char => {
							if (char.value) {
								const bytes = b64ToBytes(char.value);
								if (bytes.length > 0) errorCode = bytes[0];
							}
						}).catch(() => {}) // Silent fail for individual chars
					);
				}

				if (chars.systemStatus) {
					promises.push(
						chars.systemStatus.read().then(char => {
							if (char.value) {
								const bytes = b64ToBytes(char.value);
								systemStatus = parseSystemStatus(bytes);
							}
						}).catch(() => {})
					);
				}

				await Promise.all(promises);

				if (!cancelled) {
					setDiagnosticsData({
						errorCode,
						errorDescription: getErrorDescription(errorCode),
						systemStatus,
						lastUpdate: new Date()
					});
					setError(null);
				}

			} catch (e: unknown) {
				if (isCancellationError(e)) return;
				setError(String((e as Error)?.message ?? 'Diagnostics read failed'));
			}
		};

		// Kick an immediate read
		readAllCharacteristics();

		// Set up notifications for real-time updates
		const setupNotifications = async () => {
			const chars = await waitForChars();
			if (!chars) {
				if (intervalMs > 0) {
					intervalId = setInterval(readAllCharacteristics, intervalMs);
				}
				return;
			}

			if (subscribe) {
				try {
					// Monitor error code for immediate error notifications
					if (chars.errorCode) {
						const sub = chars.errorCode.monitor((err, ch) => {
							if (err) {
								if (!isCancellationError(err) && !unsubscribing) {
									setError(String(err?.message ?? 'Error code notify failed'));
								}
								return;
							}
							if (!cancelled && ch?.value) {
								// Re-read all characteristics when error code changes
								readAllCharacteristics();
							}
						});
						subscriptions.push(sub);
					}

					// Monitor system status for health updates
					if (chars.systemStatus) {
						const sub = chars.systemStatus.monitor((err, ch) => {
							if (err) {
								if (!isCancellationError(err) && !unsubscribing) {
									setError(String(err?.message ?? 'System status notify failed'));
								}
								return;
							}
							if (!cancelled && ch?.value) {
								// Re-read all characteristics when system status changes
								readAllCharacteristics();
							}
						});
						subscriptions.push(sub);
					}

				} catch (e: unknown) {
					if (!isCancellationError(e)) {
						setError(String((e as Error)?.message ?? 'Diagnostics monitor failed'));
					}
				}
			}

			// Always poll periodically as backup
			if (intervalMs > 0) {
				intervalId = setInterval(readAllCharacteristics, intervalMs);
			}
		};

		setupNotifications();

		return () => {
			cancelled = true;
			unsubscribing = true;
			subscriptions.forEach(sub => {
				try { sub.remove(); } catch {}
			});
			if (intervalId) clearInterval(intervalId);
			unsubscribing = false;
		};
	}, [entry, diagnosticsChars, subscribe, intervalMs, waitMs]);

	return {
		diagnosticsData,
		errorCode: diagnosticsData?.errorCode ?? null,
		errorDescription: diagnosticsData?.errorDescription ?? null,
		systemStatus: diagnosticsData?.systemStatus ?? null,
		lastUpdate: diagnosticsData?.lastUpdate ?? null,
		supported,
		error,
		// Helper functions
		getErrorDescription,
		getLedModeDescription
	};
}