import { useEffect } from 'react';
import { useBattery } from './useBattery';
import { useControl } from './useControl';
import { useFatigue } from './useFatigue';
import { useStepCounter } from './useStepCounter';

/**
 * Hook to register all BLE subscriptions for a device
 * This ensures subscriptions are registered whenever a device is connected
 * All data flows through useBleStore
 */
export const useDeviceSubscriptions = ({ deviceId, enabled = true }: { deviceId: string; enabled?: boolean }) => {
	// Register battery subscription (publishes to store)
	useBattery({
		deviceId,
		enabled,
	});

	// Register control subscriptions (publishes to store)
	useControl({
		deviceId,
		enabled,
	});

	// Register fatigue subscription (logs to session)
	useFatigue({
		deviceId,
		enabled,
	});

	// Register step counter subscription (logs to session)
	useStepCounter({
		deviceId,
		enabled,
	});
};
