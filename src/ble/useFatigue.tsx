import { useCallback, useEffect, useRef, useState } from 'react';
import { useBle } from './BleProvider';
import type { BleError, Characteristic } from 'react-native-ble-plx';
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
interface UseFatigueProps {
	deviceId: string;
	onFatigueUpdate?: (level: number) => void;
	onHighFatigue?: (level: number) => void;
	highFatigueThreshold?: number;
	enabled?: boolean;
}

export const useFatigue = ({
	deviceId,
	onFatigueUpdate,
	onHighFatigue,
	highFatigueThreshold = 80,
	enabled = true,
}: UseFatigueProps) => {
	const { connected } = useBle();
	const deviceInfo = connected[deviceId];
	const device = deviceInfo?.device;
	const position = deviceInfo?.position;
	const { logFatigue } = useSession();

	const lastLoggedValue = useRef<number | null>(null);
	const lastLogTime = useRef<number>(0);
	const [level, setLevel] = useState<number | null>(null);
	const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
	const [isSupported, setIsSupported] = useState(false);
	const [error, setError] = useState<string | null>(null);

		const parseFatigueLevel = useCallback((base64Value: string): number => {
			try {
				const byte = decodeSingleByte(base64Value);
				return Math.max(0, Math.min(100, byte));
			} catch (err) {
				console.warn('Failed to parse fatigue level:', err);
				return 0;
			}
		}, []);

		const readFatigueLevel = useCallback(async (): Promise<number | null> => {
			if (!device) return null;
			try {
				const isConnected = await device.isConnected();
				if (!isConnected) return null;
				const characteristic = await device.readCharacteristicForService(
					FATIGUE_SERVICE_UUID,
					FATIGUE_LEVEL_CHAR_UUID
				);
				if (characteristic?.value) {
					const fatigueLevel = parseFatigueLevel(characteristic.value);
					setLevel(fatigueLevel);
					setLastUpdate(new Date());
					setError(null);
					return fatigueLevel;
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to read fatigue level');
			}
			return null;
		}, [device, parseFatigueLevel]);

		const subscribe = useCallback(async () => {
			if (!device) return;
			try {
				const isConnected = await device.isConnected();
				if (!isConnected) return;
				   await device.monitorCharacteristicForService(
					   FATIGUE_SERVICE_UUID,
					   FATIGUE_LEVEL_CHAR_UUID,
					   (bleError: BleError | null, characteristic: Characteristic | null) => {
						   if (bleError) {
							   if (bleError.message?.includes('Operation was cancelled')) return;
							   setError(bleError.message);
							   console.warn('Fatigue monitoring error:', bleError.message);
							   return;
						   }
						   if (characteristic?.value) {
							   const fatigueLevel = parseFatigueLevel(characteristic.value);
							   setLevel(fatigueLevel);
							   setLastUpdate(new Date());
							   setError(null);
							   // Debounce: log only if value changed or at least 1s since last log
							   const now = Date.now();
							   if (
								   lastLoggedValue.current !== fatigueLevel ||
								   now - lastLogTime.current > 1000
							   ) {
								   logFatigue(fatigueLevel, position);
								   lastLoggedValue.current = fatigueLevel;
								   lastLogTime.current = now;
							   }
							   onFatigueUpdate?.(fatigueLevel);
							   if (fatigueLevel >= highFatigueThreshold) {
								   onHighFatigue?.(fatigueLevel);
							   }
						   }
					   }
				   );
					} catch (subscribeErr) {
						setError(subscribeErr instanceof Error ? subscribeErr.message : 'Failed to subscribe to fatigue updates');
						console.warn('Fatigue subscription error:', subscribeErr);
					}
		}, [device, position, parseFatigueLevel, logFatigue, onFatigueUpdate, onHighFatigue, highFatigueThreshold]);

		// No-op: BLE cleans up on disconnect
			const unsubscribe = useCallback(async () => {
				// No explicit unsubscribe needed for react-native-ble-plx
				// Could add custom logic if needed
				// console.log('Fatigue monitoring will stop when device disconnects');
			}, []);

		useEffect(() => {
			if (enabled && device) {
				subscribe();
				return () => {
					unsubscribe();
				};
			}
		}, [enabled, device, subscribe, unsubscribe]);

	useEffect(() => {
		setLevel(null);
		setLastUpdate(null);
		setIsSupported(false);
		setError(null);
		unsubscribe();
	}, [device, unsubscribe]);

		useEffect(() => {
			let cancelled = false;
			async function checkService() {
				if (device && typeof device.services === 'function') {
					try {
						const services = await device.services();
						if (!cancelled) {
							setIsSupported(services.some(s => s.uuid.toLowerCase() === FATIGUE_SERVICE_UUID.toLowerCase()));
						}
					} catch (err) {
						if (!cancelled) setIsSupported(false);
					}
				}
			}
			checkService();
			return () => { cancelled = true; };
		}, [device]);

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