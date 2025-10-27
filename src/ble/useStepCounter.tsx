import { useCallback, useEffect } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';

// StingRay Step Counter Service UUIDs (from StingRay BLE Services Guide)
const STEP_SERVICE_UUID = '1814'; // Running Speed and Cadence Service (Standard)
const STEP_COUNT_CHARACTERISTIC_UUID = '2a53'; // RSC Feature (repurposed for step count)

interface UseStepCounterProps {
	deviceId: string;
	onStepCountUpdate?: (stepCount: number) => void;
	enabled?: boolean;
}

export const useStepCounter = ({
	deviceId,
	onStepCountUpdate,
	enabled = true
}: UseStepCounterProps) => {
	const { connected } = useBle();
	const device = connected[deviceId]?.device;

	// Parse step count from base64 (should be 4 bytes little-endian)
	const parseStepCount = useCallback((base64Data: string): number => {
		try {
			// For React Native, use a simple manual base64 decoder
			// since Buffer may not be available in all environments
			const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
			const bytes: number[] = [];
			
			// Remove padding
			let cleanBase64 = base64Data;
			while (cleanBase64.endsWith('=')) {
				cleanBase64 = cleanBase64.slice(0, -1);
			}
			
			// Decode in 4-character chunks
			for (let i = 0; i < cleanBase64.length; i += 4) {
				const chunk = cleanBase64.slice(i, i + 4).padEnd(4, 'A'); // Pad with 'A' (value 0)
				const values = chunk.split('').map(c => base64chars.indexOf(c));
				
				if (values.every(v => v !== -1)) {
					// Convert 4 base64 values to 3 bytes
					// eslint-disable-next-line no-bitwise
					const byte1 = (values[0] << 2) | (values[1] >> 4);
					// eslint-disable-next-line no-bitwise  
					const byte2 = ((values[1] & 0x0F) << 4) | (values[2] >> 2);
					// eslint-disable-next-line no-bitwise
					const byte3 = ((values[2] & 0x03) << 6) | values[3];
					
					bytes.push(byte1);
					if (i + 1 < cleanBase64.length) bytes.push(byte2);
					if (i + 2 < cleanBase64.length) bytes.push(byte3);
				}
			}
			
			// For "AAAAAA==", we expect 4 bytes: the first chunk "AAAA" gives 3 bytes,
			// and the second chunk "AA" (padded to "AAAA") gives 1 more byte
			// But we need to limit based on the original padding
			const originalPaddingCount = base64Data.length - cleanBase64.length;
			if (originalPaddingCount > 0) {
				// Remove bytes that were added due to padding
				const expectedBytes = Math.ceil((cleanBase64.length * 6) / 8);
				while (bytes.length > expectedBytes) {
					bytes.pop();
				}
			}

			// Expected 4 bytes for step count, but accept 3+ for compatibility
			if (bytes.length < 3) {
				console.warn('Step count data too short:', bytes.length);
				return 0;
			}

			// Parse little-endian unsigned integer (3 or 4 bytes)
			let stepCount = 0;
			if (bytes.length >= 3) {
				// eslint-disable-next-line no-bitwise
				stepCount = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
				
				// If we have a 4th byte, include it
				if (bytes.length >= 4) {
					// eslint-disable-next-line no-bitwise
					stepCount |= (bytes[3] << 24);
				}
			}
			
			// Ensure non-negative value (unsigned)
			// eslint-disable-next-line no-bitwise
			const result = stepCount >>> 0;
			
			return result;
		} catch (error) {
			console.error('Failed to parse step count:', error);
			return 0;
		}
	}, []);

	// Subscribe to step count notifications
	const subscribe = useCallback(async () => {
		if (!device || !enabled) return;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for step counter subscription');
				return;
			}

			await device.monitorCharacteristicForService(
				STEP_SERVICE_UUID,
				STEP_COUNT_CHARACTERISTIC_UUID,
				(error: BleError | null, characteristic: Characteristic | null) => {
					if (error) {
						// Check if it's a "characteristic not found" error - this is expected if device doesn't support step counting
						if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
							console.log('Device does not support step counter characteristic - this is normal for some devices');
							return;
						}
						console.error('Step counter monitoring error:', error);
						return;
					}

					if (characteristic?.value) {
						const stepCount = parseStepCount(characteristic.value);
						if (onStepCountUpdate) {
							onStepCountUpdate(stepCount);
						}
					}
				}
			);
		} catch (error) {
			// Handle service/characteristic not found gracefully
			if (error instanceof Error && 
				(error.message.includes('Service') || error.message.includes('Characteristic')) && 
				error.message.includes('not found')) {
				console.log('Device does not support step counter service - this is normal for some devices');
				return;
			}
			console.error('Failed to subscribe to step counter:', error);
		}
	}, [device, enabled, parseStepCount, onStepCountUpdate]);

	// Unsubscribe from step count notifications
	const unsubscribe = useCallback(async () => {
		if (!device) return;

		try {
			// Note: react-native-ble-plx doesn't have cancelTransaction
			// The subscription will be automatically cleaned up when the device disconnects
			console.log('Step counter monitoring will stop when device disconnects');
		} catch (error) {
			console.error('Failed to unsubscribe from step counter:', error);
		}
	}, [device]);

	// Read current step count
	const readStepCount = useCallback(async (): Promise<number | null> => {
		if (!device) return null;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for step count read');
				return null;
			}

			const characteristic = await device.readCharacteristicForService(
				STEP_SERVICE_UUID,
				STEP_COUNT_CHARACTERISTIC_UUID
			);

			if (characteristic?.value) {
				return parseStepCount(characteristic.value);
			}
		} catch (error) {
			console.error('Failed to read step count:', error);
		}

		return null;
	}, [device, parseStepCount]);

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
		readStepCount,
		parseStepCount
	};
};