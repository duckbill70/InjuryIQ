import { useCallback, useEffect } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';

// StingRay LED Control Service UUIDs (from StingRay BLE Services Guide)
const LED_SERVICE_UUID = '19b10010-e8f2-537e-4f6c-d104768a1214';
const LED_CONTROL_CHARACTERISTIC_UUID = '19b10010-e8f2-537e-4f6c-d104768a1215';

// LED Control modes from StingRay guide (CORRECTED to match actual firmware)
export enum LEDControlMode {
	AMBER = 0,           // Standby mode - solid amber LED
	PULSE_RED = 1,       // Active mode - pulsing red LED
	PULSE_GREEN = 2,     // Active mode - pulsing green LED  
	PULSE_BLUE = 3,      // Active mode - pulsing blue LED
	SOLID_RED = 4,       // Active mode - solid red LED
	SOLID_GREEN = 5,     // Active mode - solid green LED
	SOLID_BLUE = 6,      // Active mode - solid blue LED
	OFF = 10             // Low power mode - all LEDs off
}

interface UseLEDControlProps {
	deviceId: string;
	onLEDStatusUpdate?: (mode: LEDControlMode) => void;
	enabled?: boolean;
}

export const useLEDControl = ({
	deviceId,
	onLEDStatusUpdate,
	enabled = true
}: UseLEDControlProps) => {
	const { connected } = useBle();
	const device = connected[deviceId]?.device;

	// Parse single byte LED mode
	const parseLEDMode = useCallback((base64Data: string): LEDControlMode => {
		try {
			// Decode first character to get mode byte
			const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
			if (base64Data.length < 2) return LEDControlMode.OFF;
			
			const char1 = base64chars.indexOf(base64Data[0]);
			const char2 = base64chars.indexOf(base64Data[1]);
			if (char1 === -1 || char2 === -1) return LEDControlMode.OFF;
			
			// eslint-disable-next-line no-bitwise
			const mode = (char1 << 2) | (char2 >> 4);
			
			// Validate mode is within enum range
			if (mode >= 0 && mode <= 10) {
				return mode as LEDControlMode;
			}
			
			return LEDControlMode.OFF;
		} catch (error) {
			console.error('Failed to parse LED mode:', error);
			return LEDControlMode.OFF;
		}
	}, []);

	// Encode LED mode to base64 for writing
	const encodeLEDMode = useCallback((mode: LEDControlMode): string => {
		try {
			const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
			const modeValue = Math.max(0, Math.min(10, mode)); // Clamp to valid range
			
			// Encode single byte to base64
			// eslint-disable-next-line no-bitwise
			const char1 = base64chars[modeValue >> 2];
			// eslint-disable-next-line no-bitwise
			const char2 = base64chars[(modeValue & 3) << 4];
			
			return char1 + char2 + '=='; // Pad with == for single byte
		} catch (error) {
			console.error('Failed to encode LED mode:', error);
			return 'AA=='; // Default to OFF mode
		}
	}, []);

	// Subscribe to LED status notifications
	const subscribe = useCallback(async () => {
		if (!device || !enabled) return;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for LED control subscription');
				return;
			}

			await device.monitorCharacteristicForService(
				LED_SERVICE_UUID,
				LED_CONTROL_CHARACTERISTIC_UUID,
				(error: BleError | null, characteristic: Characteristic | null) => {
					if (error) {
						// Check if it's a "characteristic not found" error - this is expected if device doesn't support LED control
						if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
							console.log('Device does not support LED control characteristic - this is normal for some devices');
							return;
						}
						console.error('LED control monitoring error:', error);
						return;
					}

					if (characteristic?.value) {
						const mode = parseLEDMode(characteristic.value);
						if (onLEDStatusUpdate) {
							onLEDStatusUpdate(mode);
						}
					}
				}
			);
		} catch (error) {
			// Handle service/characteristic not found gracefully
			if (error instanceof Error && 
				(error.message.includes('Service') || error.message.includes('Characteristic')) && 
				error.message.includes('not found')) {
				console.log('Device does not support LED control service - this is normal for some devices');
				return;
			}
			console.error('Failed to subscribe to LED control:', error);
		}
	}, [device, enabled, parseLEDMode, onLEDStatusUpdate]);

	// Unsubscribe from LED status notifications
	const unsubscribe = useCallback(async () => {
		if (!device) return;

		try {
			// Note: react-native-ble-plx doesn't have cancelTransaction
			// The subscription will be automatically cleaned up when the device disconnects
			console.log('LED control monitoring will stop when device disconnects');
		} catch (error) {
			console.error('Failed to unsubscribe from LED control:', error);
		}
	}, [device]);

	// Read current LED mode
	const readLEDMode = useCallback(async (): Promise<LEDControlMode | null> => {
		if (!device) return null;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for LED mode read');
				return null;
			}

			const characteristic = await device.readCharacteristicForService(
				LED_SERVICE_UUID,
				LED_CONTROL_CHARACTERISTIC_UUID
			);

			if (characteristic?.value) {
				return parseLEDMode(characteristic.value);
			}
		} catch (error) {
			console.error('Failed to read LED mode:', error);
		}

		return null;
	}, [device, parseLEDMode]);

	// Set LED mode
	const setLEDMode = useCallback(async (mode: LEDControlMode): Promise<boolean> => {
		if (!device) return false;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) {
				console.warn('Device not connected for LED mode write');
				return false;
			}

			const encodedMode = encodeLEDMode(mode);
			await device.writeCharacteristicWithResponseForService(
				LED_SERVICE_UUID,
				LED_CONTROL_CHARACTERISTIC_UUID,
				encodedMode
			);

			return true;
		} catch (error) {
			console.error('Failed to set LED mode:', error);
			return false;
		}
	}, [device, encodeLEDMode]);

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
		readLEDMode,
		setLEDMode,
		parseLEDMode,
		encodeLEDMode,
		LEDControlMode
	};
};