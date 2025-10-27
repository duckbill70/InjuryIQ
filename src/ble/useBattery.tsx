import { useCallback, useEffect } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';

// Standard Bluetooth Battery Service UUIDs
const BATTERY_SERVICE_UUID = '180f';
const BATTERY_LEVEL_CHARACTERISTIC_UUID = '2a19';

interface UseBatteryProps {
	deviceId: string;
	onBatteryUpdate?: (level: number) => void;
	enabled?: boolean;
}

export const useBattery = ({
	deviceId,
	onBatteryUpdate,
	enabled = true
}: UseBatteryProps) => {
	const { connected } = useBle();
	const device = connected[deviceId]?.device;

	// Parse battery level from base64 (single byte, 0-100%)
	const parseBatteryLevel = useCallback((base64Data: string): number => {
		try {
			// Decode first byte to get battery percentage
			const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
			if (base64Data.length < 2) return 0;
			
			const char1 = base64chars.indexOf(base64Data[0]);
			const char2 = base64chars.indexOf(base64Data[1]);
			if (char1 === -1 || char2 === -1) return 0;
			
			// eslint-disable-next-line no-bitwise
			const level = (char1 << 2) | (char2 >> 4);
			
			// Clamp to valid percentage range
			return Math.max(0, Math.min(100, level));
		} catch (error) {
			console.error('Failed to parse battery level:', error);
			return 0;
		}
	}, []);

	// Subscribe to battery level notifications
	const subscribe = useCallback(async () => {
		if (!device || !enabled) return;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for battery subscription');
				return;
			}

			await device.monitorCharacteristicForService(
				BATTERY_SERVICE_UUID,
				BATTERY_LEVEL_CHARACTERISTIC_UUID,
				(error: BleError | null, characteristic: Characteristic | null) => {
					if (error) {
						// Check if it's a "characteristic not found" error - this means device doesn't support battery service
						if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
							console.log('Device does not support battery level characteristic - this is normal for some devices');
							return;
						}
						console.error('Battery monitoring error:', error);
						return;
					}

					if (characteristic?.value) {
						const level = parseBatteryLevel(characteristic.value);
						if (onBatteryUpdate) {
							onBatteryUpdate(level);
						}
					}
				}
			);
		} catch (error) {
			// Handle service/characteristic not found gracefully
			if (error instanceof Error && 
				(error.message.includes('Service') || error.message.includes('Characteristic')) && 
				error.message.includes('not found')) {
				console.log('Device does not support battery service - this is normal for some devices');
				return;
			}
			console.error('Failed to subscribe to battery level:', error);
		}
	}, [device, enabled, parseBatteryLevel, onBatteryUpdate]);

	// Unsubscribe from battery level notifications
	const unsubscribe = useCallback(async () => {
		if (!device) return;

		try {
			// Note: react-native-ble-plx doesn't have cancelTransaction
			// The subscription will be automatically cleaned up when the device disconnects
			console.log('Battery monitoring will stop when device disconnects');
		} catch (error) {
			console.error('Failed to unsubscribe from battery level:', error);
		}
	}, [device]);

	// Read current battery level
	const readBatteryLevel = useCallback(async (): Promise<number | null> => {
		if (!device) return null;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for battery read');
				return null;
			}

			const characteristic = await device.readCharacteristicForService(
				BATTERY_SERVICE_UUID,
				BATTERY_LEVEL_CHARACTERISTIC_UUID
			);

			if (characteristic?.value) {
				return parseBatteryLevel(characteristic.value);
			}
		} catch (error) {
			// Handle service/characteristic not found gracefully
			if (error instanceof Error && 
				(error.message.includes('Service') || error.message.includes('Characteristic')) && 
				error.message.includes('not found')) {
				console.log('Device does not support battery service - this is normal for some devices');
				return null;
			}
			console.error('Failed to read battery level:', error);
		}

		return null;
	}, [device, parseBatteryLevel]);

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
		readBatteryLevel,
		parseBatteryLevel
	};
};