/* eslint-disable no-bitwise */
import { useCallback, useEffect, useRef } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';
import { decodeBase64ToBytes } from './base64';

import { useSession } from '../session/SessionProvider';

// StingRay Step Counter Service UUIDs (from StingRay BLE Services Guide)
const STEP_SERVICE_UUID = '1814'; // Running Speed and Cadence Service (Standard)
const STEP_COUNT_CHARACTERISTIC_UUID = '2a53'; // RSC Feature (repurposed for step count)

interface UseStepCounterProps {
	deviceId: string;
	onStepCountUpdate?: (stepCount: number) => void;
	enabled?: boolean;
}

export const useStepCounter = ({ deviceId, onStepCountUpdate, enabled = true }: UseStepCounterProps) => {
	const { connected } = useBle();
	const device = connected[deviceId]?.device;
	const deviceInfo = connected[deviceId]; // This should have .position if your BLE provider sets it
	const position = deviceInfo?.position;

	const { logStep } = useSession();

		const lastStepCountRef = useRef<number | null>(null);

		// Parse step count from base64 (should be 4 bytes little-endian)
		const parseStepCount = useCallback((base64Data: string): number => {
			const bytes = decodeBase64ToBytes(base64Data);
			if (bytes.length < 3) {
				console.warn('Step count data too short:', bytes.length);
				return 0;
			}

			let stepCount = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
			if (bytes.length >= 4) {
				stepCount |= bytes[3] << 24;
			}
			return stepCount >>> 0;
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

			await device.monitorCharacteristicForService(STEP_SERVICE_UUID, STEP_COUNT_CHARACTERISTIC_UUID, (error: BleError | null, characteristic: Characteristic | null) => {
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
							if (lastStepCountRef.current !== null && stepCount < lastStepCountRef.current) {
								// Counter reset (likely due to LED OFF / device reset)
								logStep({ type: 'reset', value: stepCount }, position);
							} else {
								logStep(stepCount, position);
							}
							lastStepCountRef.current = stepCount;
							onStepCountUpdate?.(stepCount);
						}
			});
		} catch (error) {
			// Handle service/characteristic not found gracefully
			if (error instanceof Error && (error.message.includes('Service') || error.message.includes('Characteristic')) && error.message.includes('not found')) {
				console.log('Device does not support step counter service - this is normal for some devices');
				return;
			}
			console.error('Failed to subscribe to step counter:', error);
		}
	}, [device, position, enabled, parseStepCount, onStepCountUpdate, logStep]);

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

			const characteristic = await device.readCharacteristicForService(STEP_SERVICE_UUID, STEP_COUNT_CHARACTERISTIC_UUID);

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
		parseStepCount,
	};
};
