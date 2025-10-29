/* eslint-disable no-bitwise */
import { useCallback, useEffect, useRef } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';
import { decodeBase64ToBytes, encodeBytesToBase64 } from './base64';

// StingRay Statistics/FIFO Service UUIDs (from StingRay BLE Services Guide)
const STATS_SERVICE_UUID = 'fedcba98-7654-3210-fedc-ba9876543210';
const FIFO_STATS_CHARACTERISTIC_UUID = 'fedcba98-7654-3210-fedc-ba9876543211';
const FIFO_CONFIG_CHARACTERISTIC_UUID = 'fedcba98-7654-3210-fedc-ba9876543212';
const FIFO_DUMP_CHARACTERISTIC_UUID = 'fedcba98-7654-3210-fedc-ba9876543213';
const FIFO_TUNING_CHARACTERISTIC_UUID = 'fedcba98-7654-3210-fedc-ba9876543214';

const pushUint32LE = (bytes: number[], value: number) => {
	bytes.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
};

const getUint32LE = (bytes: number[], offset: number) =>
	(bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

const getUint16LE = (bytes: number[], offset: number) => (bytes[offset] | (bytes[offset + 1] << 8)) & 0xffff;

export interface FIFOStatistics {
	currentSize: number;
	maxSamples: number;
	totalSamples: number;
	overflowCount: number;
	collectionRate: number;
	memoryUsedKB: number;
	uptimeSeconds: number;
	systemLoadPercent: number;
}

export interface FIFOConfiguration {
	capacityMinutes: number;
	collectionFreqHz: number;
	timerIntervalMs: number;
}

export interface FIFOTuning {
	debugLevel: number;
	autoOptimize: number;
	compressionMode: number;
	reserved: number;
}

export const isValidConfiguration = (config: FIFOConfiguration): boolean =>
	config.capacityMinutes >= 1 &&
	config.capacityMinutes <= 60 &&
	config.collectionFreqHz >= 1 &&
	config.collectionFreqHz <= 200 &&
	(config.timerIntervalMs === 0 || (config.timerIntervalMs >= 5 && config.timerIntervalMs <= 100));

export const estimateMemoryUsageKB = (config: FIFOConfiguration): number => {
	const samplesTotal = config.capacityMinutes * 60 * config.collectionFreqHz;
	return Math.floor((samplesTotal * 28) / 1024);
};

export const calculateFillPercentage = (stats: FIFOStatistics): number =>
	stats.maxSamples > 0 ? (stats.currentSize / stats.maxSamples) * 100 : 0;

export const calculateOverflowRate = (stats: FIFOStatistics): number =>
	stats.totalSamples > 0 ? (stats.overflowCount / stats.totalSamples) * 100 : 0;

export const calculateEstimatedRemainingMinutes = (stats: FIFOStatistics): number => {
	if (stats.collectionRate === 0 || stats.maxSamples === 0) {
		return 0;
	}
	const samplesRemaining = stats.maxSamples - stats.currentSize;
	return samplesRemaining / stats.collectionRate / 60;
};

const parseStatisticsBytes = (bytes: number[]): FIFOStatistics | null => {
	// Firmware sends 29 bytes (0..28). Docs mention 32 with reserved tail. Accept 29 or 32 only.
	if (!(bytes.length === 29 || bytes.length === 32)) {
		if (__DEV__) console.warn('[Statistics] Unexpected FIFO stats length:', bytes.length);
		return null;
	}

	return {
		currentSize: getUint32LE(bytes, 0),
		maxSamples: getUint32LE(bytes, 4),
		totalSamples: getUint32LE(bytes, 8),
		overflowCount: getUint32LE(bytes, 12),
		collectionRate: getUint32LE(bytes, 16),
		memoryUsedKB: getUint32LE(bytes, 20),
		uptimeSeconds: getUint32LE(bytes, 24),
		systemLoadPercent: bytes[28] ?? 0,
	};
};

// Basic sanity checks to avoid showing bogus initial values
const isLikelyValidStats = (stats: FIFOStatistics): boolean => {
	// collectionRate should be within plausible IMU range; docs/config constrain to <= 200 Hz
	if (stats.collectionRate < 1 || stats.collectionRate > 200) return false;
	// capacity must be known and non-zero
	if (stats.maxSamples <= 0) return false;
	// currentSize cannot exceed capacity
	if (stats.currentSize < 0 || stats.currentSize > stats.maxSamples) return false;
	// system load is a percentage
	if (stats.systemLoadPercent < 0 || stats.systemLoadPercent > 100) return false;
	return true;
};

const parseConfigurationBytes = (bytes: number[]): FIFOConfiguration | null => {
	if (bytes.length < 12) {
		console.warn('FIFO configuration payload too short:', bytes.length);
		return null;
	}

	return {
		capacityMinutes: getUint32LE(bytes, 0),
		collectionFreqHz: getUint32LE(bytes, 4),
		timerIntervalMs: getUint32LE(bytes, 8),
	};
};

const parseTuningBytes = (bytes: number[]): FIFOTuning | null => {
	if (bytes.length < 8) {
		console.warn('FIFO tuning payload too short:', bytes.length);
		return null;
	}

	return {
		debugLevel: getUint16LE(bytes, 0),
		autoOptimize: getUint16LE(bytes, 2),
		compressionMode: getUint16LE(bytes, 4),
		reserved: getUint16LE(bytes, 6),
	};
};

interface UseStatisticsProps {
	deviceId: string;
	onStatisticsUpdate?: (stats: FIFOStatistics) => void;
	enabled?: boolean;
}

export const useStatistics = ({ deviceId, onStatisticsUpdate, enabled = true }: UseStatisticsProps) => {
	const { connected } = useBle();
	const device = connected[deviceId]?.device;

	// De-dupe identical stats to avoid flicker
	const lastStatsRef = useRef<string | null>(null);
	// Track whether we've discovered services/characteristics for this device
	const servicesReadyRef = useRef<boolean>(false);

	// Reset discovery flag when device changes
	useEffect(() => {
		servicesReadyRef.current = false;
	}, [device]);

	const ensureDeviceReady = useCallback(async (): Promise<boolean> => {
		if (!device) return false;
		try {
			const isConnected = await device.isConnected();
			if (!isConnected) return false;
			if (!servicesReadyRef.current) {
				await device.discoverAllServicesAndCharacteristics();
				servicesReadyRef.current = true;
			}
			return true;
		} catch (err) {
			if (__DEV__) console.warn('[Statistics] Device not ready:', err);
			return false;
		}
	}, [device]);

		const delay = useCallback((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), []);

	const parseStatisticsData = useCallback((base64Data: string): FIFOStatistics | null => {
		const bytes = decodeBase64ToBytes(base64Data);
		return parseStatisticsBytes(bytes);
	}, []);

	const parseConfiguration = useCallback((base64Data: string): FIFOConfiguration | null => {
		const bytes = decodeBase64ToBytes(base64Data);
		return parseConfigurationBytes(bytes);
	}, []);

	const parseTuning = useCallback((base64Data: string): FIFOTuning | null => {
		const bytes = decodeBase64ToBytes(base64Data);
		return parseTuningBytes(bytes);
	}, []);

	const subscribe = useCallback(async () => {
		if (!device || !enabled) return;

		try {
			const ready = await ensureDeviceReady();
			if (!ready) {
				if (__DEV__) console.warn('[Statistics] Device not ready for statistics subscription');
				return;
			}

			//if (__DEV__) console.log('[Statistics] Subscribing to FIFO statistics notifications...');

			await device.monitorCharacteristicForService(
				STATS_SERVICE_UUID,
				FIFO_STATS_CHARACTERISTIC_UUID,
				(error: BleError | null, characteristic: Characteristic | null) => {
					if (error) {
						// Filter expected/transient errors to avoid console spam
						const msg = error.message || '';
						if (msg.includes('not found')) {
							if (__DEV__) console.log('[Statistics] Device does not expose FIFO statistics characteristic');
							return;
						}
						if (msg.includes('Operation was cancelled') || msg.includes('read failed')) {
							if (__DEV__) console.debug('[Statistics] Transient monitor error:', msg);
							return;
						}
						console.error('[Statistics] Monitoring error:', error);
						return;
					}

					if (characteristic?.value) {
						const stats = parseStatisticsData(characteristic.value);
						if (stats && isLikelyValidStats(stats)) {
							const sig = JSON.stringify(stats);
							if (sig !== lastStatsRef.current) {
								lastStatsRef.current = sig;
								onStatisticsUpdate?.(stats);
							}
						}
					}
				}
			);
			//if (__DEV__) console.log('[Statistics] Successfully subscribed to FIFO statistics');
		} catch (error) {
			if (
				error instanceof Error &&
				(error.message.includes('Service') || error.message.includes('Characteristic')) &&
				error.message.includes('not found')
			) {
				if (__DEV__) console.log('[Statistics] Device does not support statistics service');
				return;
			}
			console.error('[Statistics] Failed to subscribe to statistics:', error);
		}
	}, [device, enabled, onStatisticsUpdate, parseStatisticsData, ensureDeviceReady]);

	const unsubscribe = useCallback(async () => {
		if (!device) return;
		// react-native-ble-plx cleans up monitors on disconnect or re-subscribe; nothing to do.
	}, [device]);

		const readStatistics = useCallback(async (): Promise<FIFOStatistics | null> => {
		if (!device) return null;

		try {
			const ready = await ensureDeviceReady();
			if (!ready) {
				if (__DEV__) console.warn('[Statistics] Device not ready for statistics read');
				return null;
			}

				let characteristic: Characteristic | null = null;
				try {
					characteristic = await device.readCharacteristicForService(
						STATS_SERVICE_UUID,
						FIFO_STATS_CHARACTERISTIC_UUID
					);
						} catch (e: unknown) {
							const msg: string = (e as Error)?.message || '';
					// Retry once after a short delay for transient iOS stack timing issues
					if (msg.includes('read failed') || msg.includes('Operation was cancelled')) {
						if (__DEV__) console.debug('[Statistics] Read failed, retrying once in 200ms');
						await delay(200);
						try {
							characteristic = await device.readCharacteristicForService(
								STATS_SERVICE_UUID,
								FIFO_STATS_CHARACTERISTIC_UUID
							);
									} catch (e2: unknown) {
										const msg2: string = (e2 as Error)?.message || '';
										if (__DEV__) console.debug('[Statistics] Read retry failed:', msg2 || e2);
							return null;
						}
					} else {
						// Non-transient error; log in dev only
									if (__DEV__) console.warn('[Statistics] Read statistics error:', msg || e);
						return null;
					}
				}

			if (characteristic?.value) {
				const stats = parseStatisticsData(characteristic.value);
				if (stats && isLikelyValidStats(stats)) {
					const sig = JSON.stringify(stats);
					if (sig !== lastStatsRef.current) {
						lastStatsRef.current = sig;
					}
				}
					return stats && isLikelyValidStats(stats) ? stats : null;
			}
		} catch (error) {
				// Fallback catch: treat as transient in dev
				if (__DEV__) console.debug('[Statistics] Failed to read statistics (outer):', error);
		}

		return null;
		}, [device, parseStatisticsData, ensureDeviceReady, delay]);

	const readConfiguration = useCallback(async (): Promise<FIFOConfiguration | null> => {
		if (!device) return null;

		try {
			const ready = await ensureDeviceReady();
			if (!ready) {
				console.warn('Device not ready for configuration read');
				return null;
			}

			const characteristic = await device.readCharacteristicForService(
				STATS_SERVICE_UUID,
				FIFO_CONFIG_CHARACTERISTIC_UUID
			);

			if (characteristic?.value) {
				return parseConfiguration(characteristic.value);
			}
		} catch (error) {
			console.error('Failed to read FIFO configuration:', error);
		}

		return null;
	}, [device, parseConfiguration, ensureDeviceReady]);

	const writeConfiguration = useCallback(
		async (config: FIFOConfiguration): Promise<boolean> => {
			if (!device) return false;
			if (!isValidConfiguration(config)) {
				throw new Error('Invalid FIFO configuration values');
			}

			try {
				const isConnected = await device.isConnected();
				if (!isConnected) {
					console.warn('Device not connected for configuration write');
					return false;
				}

				if (!servicesReadyRef.current) {
					await device.discoverAllServicesAndCharacteristics();
					servicesReadyRef.current = true;
				}

				const bytes: number[] = [];
				pushUint32LE(bytes, config.capacityMinutes);
				pushUint32LE(bytes, config.collectionFreqHz);
				pushUint32LE(bytes, config.timerIntervalMs);

				const encoded = encodeBytesToBase64(bytes);
				await device.writeCharacteristicWithResponseForService(
					STATS_SERVICE_UUID,
					FIFO_CONFIG_CHARACTERISTIC_UUID,
					encoded
				);
				return true;
			} catch (error) {
				console.error('Failed to write FIFO configuration:', error);
				return false;
			}
		},
		[device]
	);

	const requestFifoDump = useCallback(async (): Promise<boolean> => {
		if (!device) return false;

		try {
			const ready = await ensureDeviceReady();
			if (!ready) {
				console.warn('Device not ready for FIFO dump request');
				return false;
			}

			const encoded = encodeBytesToBase64([1]);
			await device.writeCharacteristicWithResponseForService(
				STATS_SERVICE_UUID,
				FIFO_DUMP_CHARACTERISTIC_UUID,
				encoded
			);
			return true;
		} catch (error) {
			console.error('Failed to request FIFO dump:', error);
			return false;
		}
	}, [device, ensureDeviceReady]);

	const readTuning = useCallback(async (): Promise<FIFOTuning | null> => {
		if (!device) return null;

		try {
			const ready = await ensureDeviceReady();
			if (!ready) {
				console.warn('Device not ready for tuning read');
				return null;
			}

			const characteristic = await device.readCharacteristicForService(
				STATS_SERVICE_UUID,
				FIFO_TUNING_CHARACTERISTIC_UUID
			);

			if (characteristic?.value) {
				return parseTuning(characteristic.value);
			}
		} catch (error) {
			console.error('Failed to read FIFO tuning:', error);
		}

		return null;
	}, [device, parseTuning, ensureDeviceReady]);

	const writeTuning = useCallback(
		async (tuning: FIFOTuning): Promise<boolean> => {
			if (!device) return false;

			try {
				const isConnected = await device.isConnected();
				if (!isConnected) {
					console.warn('Device not connected for tuning write');
					return false;
				}

				const bytes: number[] = [];
				bytes.push(tuning.debugLevel & 0xff, (tuning.debugLevel >> 8) & 0xff);
				bytes.push(tuning.autoOptimize & 0xff, (tuning.autoOptimize >> 8) & 0xff);
				bytes.push(tuning.compressionMode & 0xff, (tuning.compressionMode >> 8) & 0xff);
				bytes.push(tuning.reserved & 0xff, (tuning.reserved >> 8) & 0xff);

				const encoded = encodeBytesToBase64(bytes);
				await device.writeCharacteristicWithResponseForService(
					STATS_SERVICE_UUID,
					FIFO_TUNING_CHARACTERISTIC_UUID,
					encoded
				);
				return true;
			} catch (error) {
				console.error('Failed to write FIFO tuning:', error);
				return false;
			}
		},
		[device]
	);

	useEffect(() => {
		if (enabled && device) {
			subscribe();
			return () => {
				unsubscribe();
			};
		}
		return undefined;
	}, [enabled, device, subscribe, unsubscribe]);

	return {
		subscribe,
		unsubscribe,
		readStatistics,
		readConfiguration,
		writeConfiguration,
		requestFifoDump,
		readTuning,
		writeTuning,
		parseStatisticsData,
		parseConfiguration,
		parseTuning,
		calculateFillPercentage,
		calculateOverflowRate,
		calculateEstimatedRemainingMinutes,
		estimateMemoryUsageKB,
	};
};