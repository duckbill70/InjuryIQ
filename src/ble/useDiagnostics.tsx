import { useCallback, useEffect } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';

// StingRay Diagnostics Service UUIDs (from StingRay BLE Services Guide)
const DIAGNOSTICS_SERVICE_UUID = '87654321-4321-8765-4321-210987654321';
const ERROR_CODE_CHARACTERISTIC_UUID = '87654321-4321-8765-4321-210987654322';
const SYSTEM_STATUS_CHARACTERISTIC_UUID = '87654321-4321-8765-4321-210987654325';

// System status data structure (36 bytes from StingRay guide)
interface SystemStatus {
	uptime: number;
	cpuUsage: number;
	memoryUsage: number;
	temperature: number;
	voltageSupply: number;
	errorCount: number;
	warningCount: number;
	lastResetReason: number;
	firmwareVersion: string;
	hardwareRevision: string;
	systemHealth: 'GOOD' | 'WARNING' | 'ERROR';
}

// Error codes from StingRay guide
export enum ErrorCode {
	NO_ERROR = 0,
	SENSOR_FAULT = 1,
	COMMUNICATION_ERROR = 2,
	POWER_FAULT = 3,
	MEMORY_ERROR = 4,
	CALIBRATION_ERROR = 5,
	TEMPERATURE_WARNING = 6,
	LOW_BATTERY = 7,
	FIRMWARE_ERROR = 8,
	HARDWARE_FAULT = 9
}

interface UseDiagnosticsProps {
	deviceId: string;
	onSystemStatusUpdate?: (status: SystemStatus) => void;
	onErrorUpdate?: (errorCode: ErrorCode, description: string) => void;
	enabled?: boolean;
}

export const useDiagnostics = ({
	deviceId,
	onSystemStatusUpdate,
	onErrorUpdate,
	enabled = true
}: UseDiagnosticsProps) => {
	const { connected } = useBle();
	const device = connected[deviceId]?.device;

	// Parse 36-byte system status structure
	const parseSystemStatus = useCallback((base64Data: string): SystemStatus | null => {
		try {
			// Decode base64 to byte array
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

			if (bytes.length < 36) {
				console.warn('System status data too short:', bytes.length);
				return null;
			}

			// Parse 36-byte structure (little-endian)
			const getUint32LE = (offset: number) => {
				// eslint-disable-next-line no-bitwise
				return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
			};

			const getUint16LE = (offset: number) => {
				// eslint-disable-next-line no-bitwise
				return bytes[offset] | (bytes[offset + 1] << 8);
			};

			// Parse version strings (null-terminated)
			const getString = (offset: number, maxLength: number) => {
				let str = '';
				for (let i = 0; i < maxLength && offset + i < bytes.length; i++) {
					const char = bytes[offset + i];
					if (char === 0) break;
					str += String.fromCharCode(char);
				}
				return str;
			};

			const errorCount = getUint16LE(20);
			const warningCount = getUint16LE(22);
			
			// Determine system health
			let systemHealth: 'GOOD' | 'WARNING' | 'ERROR' = 'GOOD';
			if (errorCount > 0) {
				systemHealth = 'ERROR';
			} else if (warningCount > 0) {
				systemHealth = 'WARNING';
			}

			return {
				uptime: getUint32LE(0),
				cpuUsage: bytes[4],
				memoryUsage: bytes[5],
				temperature: bytes[6] - 40, // Offset by 40°C as per StingRay spec
				voltageSupply: getUint16LE(8) / 1000, // Convert mV to V
				errorCount,
				warningCount,
				lastResetReason: bytes[24],
				firmwareVersion: getString(25, 5),
				hardwareRevision: getString(30, 5),
				systemHealth
			};
		} catch (error) {
			console.error('Failed to parse system status:', error);
			return null;
		}
	}, []);

	// Parse error log entry
	const parseErrorLog = useCallback((base64Data: string): { code: ErrorCode; description: string } | null => {
		try {
			// Simple error log format: error code (1 byte) + description (remaining bytes)
			const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
			const bytes: number[] = [];
			
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

			if (bytes.length < 1) return null;

			const errorCode = bytes[0] as ErrorCode;
			let description = '';
			
			// Extract description string
			for (let i = 1; i < bytes.length; i++) {
				if (bytes[i] === 0) break;
				description += String.fromCharCode(bytes[i]);
			}

			return { code: errorCode, description };
		} catch (error) {
			console.error('Failed to parse error log:', error);
			return null;
		}
	}, []);

	// Subscribe to system status notifications
	const subscribeSystemStatus = useCallback(async () => {
		if (!device || !enabled) return;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for system status subscription');
				return;
			}

			await device.monitorCharacteristicForService(
				DIAGNOSTICS_SERVICE_UUID,
				SYSTEM_STATUS_CHARACTERISTIC_UUID,
				(error: BleError | null, characteristic: Characteristic | null) => {
					if (error) {
						// Check if it's a "characteristic not found" error - this is expected if device doesn't support diagnostics
						if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
							console.log('Device does not support diagnostic system status characteristic - this is normal for some devices');
							return;
						}
						console.error('System status monitoring error:', error);
						return;
					}

					if (characteristic?.value) {
						const status = parseSystemStatus(characteristic.value);
						if (status && onSystemStatusUpdate) {
							onSystemStatusUpdate(status);
						}
					}
				}
			);
		} catch (error) {
			// Handle service/characteristic not found gracefully
			if (error instanceof Error && 
				(error.message.includes('Service') || error.message.includes('Characteristic')) && 
				error.message.includes('not found')) {
				console.log('Device does not support diagnostic system status service - this is normal for some devices');
				return;
			}
			console.error('Failed to subscribe to system status:', error);
		}
	}, [device, enabled, parseSystemStatus, onSystemStatusUpdate]);

	// Subscribe to error code notifications
	const subscribeErrorCode = useCallback(async () => {
		if (!device || !enabled) return;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for error code subscription');
				return;
			}

			await device.monitorCharacteristicForService(
				DIAGNOSTICS_SERVICE_UUID,
				ERROR_CODE_CHARACTERISTIC_UUID,
				(error: BleError | null, characteristic: Characteristic | null) => {
					if (error) {
						// Check if it's a "characteristic not found" error - this is expected if device doesn't support diagnostics
						if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
							console.log('Device does not support diagnostic error code characteristic - this is normal for some devices');
							return;
						}
						console.error('Error code monitoring error:', error);
						return;
					}

					if (characteristic?.value) {
						const errorEntry = parseErrorLog(characteristic.value);
						if (errorEntry && onErrorUpdate) {
							onErrorUpdate(errorEntry.code, errorEntry.description);
						}
					}
				}
			);
		} catch (error) {
			// Handle service/characteristic not found gracefully
			if (error instanceof Error && 
				(error.message.includes('Service') || error.message.includes('Characteristic')) && 
				error.message.includes('not found')) {
				console.log('Device does not support diagnostic error code service - this is normal for some devices');
				return;
			}
			console.error('Failed to subscribe to error code:', error);
		}
	}, [device, enabled, parseErrorLog, onErrorUpdate]);

	// Subscribe to all diagnostics
	const subscribe = useCallback(async () => {
		await Promise.all([
			subscribeSystemStatus(),
			subscribeErrorCode()
		]);
	}, [subscribeSystemStatus, subscribeErrorCode]);

	// Unsubscribe from all diagnostics
	const unsubscribe = useCallback(async () => {
		if (!device) return;

		try {
			// Note: react-native-ble-plx doesn't have cancelTransaction
			// The subscriptions will be automatically cleaned up when the device disconnects
		} catch (error) {
			console.error('Failed to unsubscribe from diagnostics:', error);
		}
	}, [device]);

	// Read current system status
	const readSystemStatus = useCallback(async (): Promise<SystemStatus | null> => {
		if (!device) return null;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for system status read');
				return null;
			}

			const characteristic = await device.readCharacteristicForService(
				DIAGNOSTICS_SERVICE_UUID,
				SYSTEM_STATUS_CHARACTERISTIC_UUID
			);

			if (characteristic?.value) {
				return parseSystemStatus(characteristic.value);
			}
		} catch (error) {
			// Handle service/characteristic not found gracefully
			if (error instanceof Error && 
				(error.message.includes('Service') || error.message.includes('Characteristic')) && 
				error.message.includes('not found')) {
				console.log('Device does not support diagnostic service - this is normal for some devices');
				return null;
			}
			console.error('Failed to read system status:', error);
		}

		return null;
	}, [device, parseSystemStatus]);

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
		subscribeSystemStatus,
		subscribeErrorCode,
		readSystemStatus,
		parseSystemStatus,
		parseErrorLog,
		ErrorCode
	};
};