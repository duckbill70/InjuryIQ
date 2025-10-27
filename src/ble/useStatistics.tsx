import { useCallback, useEffect } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';

// StingRay Statistics/FIFO Service UUIDs (from StingRay BLE Services Guide)
const STATS_SERVICE_UUID = 'fedcba98-7654-3210-fedc-ba9876543210';
const FIFO_STATS_CHARACTERISTIC_UUID = 'fedcba98-7654-3210-fedc-ba9876543211';

// Statistics data structure (32 bytes from StingRay guide)
interface StatisticsData {
	accelerometerSamples: number;
	gyroscopeSamples: number;
	magnetometerSamples: number;
	timestamp: number;
	fifoCount: number;
	overflow: boolean;
	underflow: boolean;
	processedSamples: number;
}

interface UseStatisticsProps {
	deviceId: string;
	onStatisticsUpdate?: (stats: StatisticsData) => void;
	enabled?: boolean;
}

export const useStatistics = ({
	deviceId,
	onStatisticsUpdate,
	enabled = true
}: UseStatisticsProps) => {
	const { connected } = useBle();
	const device = connected[deviceId]?.device;

	// Parse 32-byte statistics data structure
	const parseStatisticsData = useCallback((base64Data: string): StatisticsData | null => {
		try {
			// Decode base64 to byte array manually
			const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
			const bytes: number[] = [];
			
			// Process 4 characters at a time to get 3 bytes
			for (let i = 0; i < base64Data.length; i += 4) {
				const chunk = base64Data.slice(i, i + 4);
				if (chunk.length >= 2) {
					const chars = chunk.split('').map(c => base64chars.indexOf(c));
					if (chars.every(c => c !== -1)) {
						// eslint-disable-next-line no-bitwise
						bytes.push((chars[0] << 2) | (chars[1] >> 4));
						if (chunk.length >= 3) {
							// eslint-disable-next-line no-bitwise
							bytes.push(((chars[1] & 15) << 4) | (chars[2] >> 2));
						}
						if (chunk.length >= 4) {
							// eslint-disable-next-line no-bitwise
							bytes.push(((chars[2] & 3) << 6) | chars[3]);
						}
					}
				}
			}

		if (bytes.length < 20) {
			console.warn('Statistics data too short:', bytes.length, '- need at least 20 bytes');
			return null;
		}

		// Handle different data lengths gracefully
		if (bytes.length < 32) {
			// Note: Device typically sends 27 bytes, which is sufficient for parsing
		}			// Parse 32-byte structure (little-endian)
			const getUint32LE = (offset: number) => {
				// eslint-disable-next-line no-bitwise
				return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
			};

			const getUint16LE = (offset: number) => {
				// eslint-disable-next-line no-bitwise
				return bytes[offset] | (bytes[offset + 1] << 8);
			};

			return {
				accelerometerSamples: getUint32LE(0),
				gyroscopeSamples: getUint32LE(4),
				magnetometerSamples: getUint32LE(8),
				timestamp: getUint32LE(12),
				fifoCount: getUint16LE(16),
				// eslint-disable-next-line no-bitwise
				overflow: (bytes[18] & 0x01) !== 0,
				// eslint-disable-next-line no-bitwise
				underflow: (bytes[18] & 0x02) !== 0,
				processedSamples: getUint32LE(20)
			};
		} catch (error) {
			console.error('Failed to parse statistics data:', error);
			return null;
		}
	}, []);

	// Subscribe to statistics notifications
	const subscribe = useCallback(async () => {
		if (!device || !enabled) return;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for statistics subscription');
				return;
			}

			await device.monitorCharacteristicForService(
				STATS_SERVICE_UUID,
				FIFO_STATS_CHARACTERISTIC_UUID,
				(error: BleError | null, characteristic: Characteristic | null) => {
					if (error) {
						// Check if it's a "characteristic not found" error - this is expected if device doesn't support statistics
						if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
							console.log('Device does not support statistics characteristic - this is normal for some devices');
							return;
						}
						console.error('Statistics monitoring error:', error);
						return;
					}

					if (characteristic?.value) {
						const stats = parseStatisticsData(characteristic.value);
						if (stats && onStatisticsUpdate) {
							onStatisticsUpdate(stats);
						}
					}
				}
			);
		} catch (error) {
			// Handle service/characteristic not found gracefully
			if (error instanceof Error && 
				(error.message.includes('Service') || error.message.includes('Characteristic')) && 
				error.message.includes('not found')) {
				console.log('Device does not support statistics service - this is normal for some devices');
				return;
			}
			console.error('Failed to subscribe to statistics:', error);
		}
	}, [device, enabled, parseStatisticsData, onStatisticsUpdate]);

	// Unsubscribe from statistics notifications
	const unsubscribe = useCallback(async () => {
		if (!device) return;

		try {
			// Note: react-native-ble-plx doesn't have cancelTransaction
			// The subscription will be automatically cleaned up when the device disconnects
			// or when a new monitor is started on the same characteristic
			console.log('Statistics monitoring will stop when device disconnects');
		} catch (error) {
			console.error('Failed to unsubscribe from statistics:', error);
		}
	}, [device]);

	// Read current statistics value
	const readStatistics = useCallback(async (): Promise<StatisticsData | null> => {
		if (!device) return null;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for statistics read');
				return null;
			}

			const characteristic = await device.readCharacteristicForService(
				STATS_SERVICE_UUID,
				FIFO_STATS_CHARACTERISTIC_UUID
			);

			if (characteristic?.value) {
				return parseStatisticsData(characteristic.value);
			}
		} catch (error) {
			console.error('Failed to read statistics:', error);
		}

		return null;
	}, [device, parseStatisticsData]);

	// Auto-subscribe when enabled
	useEffect(() => {
		if (enabled && device) {
			subscribe();
			return () => {
				unsubscribe();
			};
		}
	}, [enabled, device, subscribe, unsubscribe]);

	return {
		subscribe,
		unsubscribe,
		readStatistics,
		parseStatisticsData
	};
};