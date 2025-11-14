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
	const deviceInfo = connected[deviceId];
	const device = deviceInfo?.device;
	const position = deviceInfo?.position;
	const { logStep } = useSession();

	const lastStepCountRef = useRef<number | null>(null);
	const subscriptionRef = useRef<{ remove: () => void } | null>(null);
	
	// Use refs for callbacks to maintain stability
	const onStepCountUpdateRef = useRef(onStepCountUpdate);
	const logStepRef = useRef(logStep);
	const positionRef = useRef(position);
	
	useEffect(() => {
		onStepCountUpdateRef.current = onStepCountUpdate;
		logStepRef.current = logStep;
		positionRef.current = position;
	}, [onStepCountUpdate, logStep, position]);

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

	// Read current step count
	const readStepCount = useCallback(async (): Promise<number | null> => {
		if (!device) return null;

		try {
			const isConnected = await device.isConnected();
			if (!isConnected) return null;

			const characteristic = await device.readCharacteristicForService(
				STEP_SERVICE_UUID,
				STEP_COUNT_CHARACTERISTIC_UUID
			);

			if (characteristic?.value) {
				return parseStepCount(characteristic.value);
			}
		} catch (error) {
			// Silently handle service/characteristic not found - device may not support step counter
			if (error instanceof Error && 
				(error.message.includes('Service') || error.message.includes('Characteristic')) && 
				error.message.includes('not found')) {
				return null;
			}
			console.error('Failed to read step count:', error);
		}

		return null;
	}, [device, parseStepCount]);

	// Subscribe to step count notifications
	const subscribe = useCallback(async () => {
		if (!device) return;
		
		try {
			const isConnected = await device.isConnected();
			if (!isConnected) return;

			const subscription = device.monitorCharacteristicForService(
				STEP_SERVICE_UUID,
				STEP_COUNT_CHARACTERISTIC_UUID,
				(error: BleError | null, characteristic: Characteristic | null) => {
					if (error) {
						// Silently ignore cancellation and disconnect errors
						if (error.message?.includes('was cancelled') || 
							error.message?.includes('was disconnected') ||
							error.message?.includes('Operation was cancelled')) {
							return;
						}
						// Silently ignore characteristic not found - device may not support step counter
						if (error.message?.includes('Characteristic') && error.message?.includes('not found')) {
							return;
						}
						console.warn('Step counter monitoring error:', error.message);
						return;
					}
					
					if (characteristic?.value) {
						const stepCount = parseStepCount(characteristic.value);
						
						// Log step count changes
						if (lastStepCountRef.current !== null && stepCount < lastStepCountRef.current) {
							// Counter reset (likely due to device reset)
							logStepRef.current?.({ type: 'reset', value: stepCount }, positionRef.current);
						} else {
							logStepRef.current?.(stepCount, positionRef.current);
						}
						
						lastStepCountRef.current = stepCount;
						onStepCountUpdateRef.current?.(stepCount);
					}
				}
			);
			
			subscriptionRef.current = subscription;
		} catch (error) {
			// Silently handle service/characteristic not found - device may not support step counter
			if (error instanceof Error && 
				(error.message.includes('Service') || error.message.includes('Characteristic')) && 
				error.message.includes('not found')) {
				return;
			}
			console.warn('Failed to subscribe to step counter:', error);
		}
	}, [device, parseStepCount]);

	// Unsubscribe from step count notifications
	const unsubscribe = useCallback(() => {
		if (subscriptionRef.current) {
			subscriptionRef.current.remove();
			subscriptionRef.current = null;
		}
	}, []);

	// Auto-subscribe when enabled
	useEffect(() => {
		if (enabled && device) {
			subscribe();
			return () => {
				unsubscribe();
			};
		}
	}, [enabled, device, subscribe, unsubscribe]);

	// Cleanup on device change
	useEffect(() => {
		return () => {
			unsubscribe();
		};
	}, [device, unsubscribe]);

	return {
		subscribe,
		unsubscribe,
		readStepCount,
		parseStepCount,
	};
};
