import { useEffect, useState, useRef, useCallback } from 'react';
import { useBle } from './BleProvider';
import { Subscription } from 'react-native-ble-plx';

import { useSession } from '../session/SessionProvider';

// Manual base64 decode for single byte (avoiding Node/Browser API issues)
const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const decodeSingleByte = (base64: string): number => {
	try {
		if (base64.length < 2) return 0;
		const char1 = base64chars.indexOf(base64[0]);
		const char2 = base64chars.indexOf(base64[1]);
		if (char1 === -1 || char2 === -1) return 0;
		// eslint-disable-next-line no-bitwise
		return (char1 << 2) | (char2 >> 4);
	} catch {
		return 0;
	}
};

// Service and characteristic UUIDs from StingRay guide
const FATIGUE_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const FATIGUE_LEVEL_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';

export interface FatigueData {
	level: number | null; // 0-100 percentage
	lastUpdate: Date | null;
	isSupported: boolean;
	error: string | null;
}

export interface UseFatigueOptions {
	deviceId?: string;
	position?: 'leftFoot' | 'rightFoot' | 'racket';
	autoSubscribe?: boolean;
	onFatigueUpdate?: (level: number) => void;
	onHighFatigue?: (level: number) => void;
	highFatigueThreshold?: number; // Default 80%
}

/**
 * Hook for monitoring fatigue level from StingRay device
 * Based on StingRay BLE Services Guide - Fatigue Monitoring Service
 */
export function useFatigue(options: UseFatigueOptions = {}): FatigueData & {
	subscribe: () => void;
	unsubscribe: () => void;
	readFatigueLevel: () => Promise<number | null>;
} {
	const { 
		deviceId, 
		position, 
		autoSubscribe = true,
		onFatigueUpdate,
		onHighFatigue,
		highFatigueThreshold = 80
	} = options;

	const { connected, devicesByPosition } = useBle();

	const { logFatigue } = useSession();
	
	// Determine which device to use
	const device = deviceId 
		? connected[deviceId]
		: position 
		? devicesByPosition[position]
		: null;

	const [level, setLevel] = useState<number | null>(null);
	const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
	const [isSupported, setIsSupported] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const subscriptionRef = useRef<Subscription | null>(null);
	const isSubscribedRef = useRef(false);

	// Find fatigue characteristic
	const fatigueCharacteristic = device?.characteristicsByService[FATIGUE_SERVICE_UUID.toLowerCase()]
		?.find(char => char.uuid.toLowerCase() === FATIGUE_LEVEL_CHAR_UUID.toLowerCase());

	// Parse fatigue level from BLE data
	const parseFatigueLevel = (base64Value: string): number => {
		try {
			// Use our custom base64 decoder for single byte
			const byte = decodeSingleByte(base64Value);
			
			// Fatigue level is a single uint8_t (0-100)
			return Math.max(0, Math.min(100, byte));
		} catch (err) {
			console.warn('Failed to parse fatigue level:', err);
			return 0;
		}
	};

	// Read fatigue level once
	const readFatigueLevel = async (): Promise<number | null> => {
		if (!device?.device || !fatigueCharacteristic) {
			setError('Device or characteristic not available');
			return null;
		}

		try {
			const characteristic = await device.device.readCharacteristicForService(
				FATIGUE_SERVICE_UUID,
				FATIGUE_LEVEL_CHAR_UUID
			);
			
			if (characteristic.value) {
				const fatigueLevel = parseFatigueLevel(characteristic.value);
				setLevel(fatigueLevel);
				setLastUpdate(new Date());
				setError(null);
				return fatigueLevel;
			}
			return null;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to read fatigue level';
			setError(errorMessage);
			console.warn('Fatigue read error:', errorMessage);
			return null;
		}
	};

	// Subscribe to fatigue notifications
	const subscribe = useCallback(() => {
		if (!device?.device || !fatigueCharacteristic || isSubscribedRef.current) {
			return;
		}

		try {
			subscriptionRef.current = device.device.monitorCharacteristicForService(
				FATIGUE_SERVICE_UUID,
				FATIGUE_LEVEL_CHAR_UUID,
				(monitorError, characteristic) => {
					if (monitorError) {
						// Filter out common cancellation errors during device transitions
						if (monitorError.message?.includes('Operation was cancelled')) {
							// This is normal during device connection/disconnection - don't spam console
							return;
						}
						setError(monitorError.message);
						console.warn('Fatigue monitoring error:', monitorError.message);
						return;
					}

					if (characteristic?.value) {
						const fatigueLevel = parseFatigueLevel(characteristic.value);
						setLevel(fatigueLevel);
						setLastUpdate(new Date());
						setError(null);
						logFatigue(fatigueLevel);

						// Trigger callbacks
						onFatigueUpdate?.(fatigueLevel);
						if (fatigueLevel >= highFatigueThreshold) {
							onHighFatigue?.(fatigueLevel);
						}
					}
				}
			);

			isSubscribedRef.current = true;
			setIsSupported(true);
			
			if (__DEV__) {
				console.log(`[useFatigue] Subscribed to device ${device.id}`);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to subscribe to fatigue updates';
			setError(errorMessage);
			console.warn('Fatigue subscription error:', errorMessage);
		}
	}, [device, fatigueCharacteristic, onFatigueUpdate, onHighFatigue, highFatigueThreshold, logFatigue]);

	// Unsubscribe from notifications
	const unsubscribe = useCallback(() => {
		if (subscriptionRef.current) {
			subscriptionRef.current.remove();
			subscriptionRef.current = null;
			isSubscribedRef.current = false;
			
			if (__DEV__) {
				console.log(`[useFatigue] Unsubscribed from device ${device?.id}`);
			}
		}
	}, [device?.id]);

	// Auto-subscribe when device becomes available
	useEffect(() => {
		if (autoSubscribe && device && fatigueCharacteristic && !isSubscribedRef.current) {
			subscribe();
		}

		return () => {
			unsubscribe();
		};
	}, [device, fatigueCharacteristic, autoSubscribe, subscribe, unsubscribe]);

	// Reset state when device changes
	useEffect(() => {
		setLevel(null);
		setLastUpdate(null);
		setIsSupported(false);
		setError(null);
		unsubscribe();
	}, [device?.id, unsubscribe]);

	// Check if service is supported
	useEffect(() => {
		if (device) {
			const hasService = device.services.includes(FATIGUE_SERVICE_UUID.toLowerCase());
			setIsSupported(hasService && !!fatigueCharacteristic);
		}
	}, [device, fatigueCharacteristic]);

	return {
		level,
		lastUpdate,
		isSupported,
		error,
		subscribe,
		unsubscribe,
		readFatigueLevel,
	};
}