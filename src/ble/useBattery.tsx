import { useCallback, useEffect } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';
import { decodeSingleByte } from './base64';

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
			const level = decodeSingleByte(base64Data);
			return Math.max(0, Math.min(100, level));
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
						if (__DEV__) console.log('Device does not support battery level characteristic - this is normal for some devices');
						return;
					}
					// Suppress expected disconnect/cancellation errors - device is reconnecting
					if (error.message?.includes('was disconnected') || error.message?.includes('was cancelled')) {
						return;
					}
					console.error('Battery monitoring error:', error);
					return;
				}					if (characteristic?.value) {
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
				if (__DEV__) console.log('Device does not support battery service - this is normal for some devices');
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
			//console.log('Battery monitoring will stop when device disconnects');
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
				if (__DEV__) console.log('Device does not support battery service - this is normal for some devices');
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