import { DevicePosition } from './BleProvider';
import { PersistedDeviceInfo, loadDevicePositions, updatePersistedDevice } from './devicePersistence';

// Default colors for device positions
export const DEFAULT_DEVICE_COLORS = {
	leftFoot: '#FF6B6B',    // Red
	rightFoot: '#4ECDC4',   // Teal  
	racket: '#45B7D1',      // Blue
} as const;

// Position priority for auto-assignment (preferred order)
const POSITION_PRIORITY: DevicePosition[] = ['leftFoot', 'rightFoot', 'racket'];

// Position labels for UI
export const POSITION_LABELS = {
	leftFoot: 'Left Foot',
	rightFoot: 'Right Foot',
	racket: 'Racket'
} as const;

export interface AutoAssignmentConfig {
	preferPreviousPosition: boolean; // Try to maintain previous device positions
	allowPositionSwapping: boolean; // Allow devices to swap positions if needed
	assignByDiscoveryOrder: boolean; // Assign positions based on discovery order
}

// Default auto-assignment configuration
export const DEFAULT_AUTO_ASSIGNMENT_CONFIG: AutoAssignmentConfig = {
	preferPreviousPosition: true,
	allowPositionSwapping: false,
	assignByDiscoveryOrder: true,
};

/**
 * Auto-assign position to a newly connected device
 * @param deviceId Device identifier
 * @param deviceName Optional device name
 * @param currentlyAssigned Currently assigned devices by position
 * @param config Auto-assignment configuration
 * @returns Suggested position or null if no position available
 */
export const autoAssignDevicePosition = async (
	deviceId: string,
	deviceName?: string | null,
	currentlyAssigned: Partial<Record<DevicePosition, string>> = {},
	config: AutoAssignmentConfig = DEFAULT_AUTO_ASSIGNMENT_CONFIG
): Promise<{ position: DevicePosition; color: string } | null> => {
	try {
		// Load persisted device information
		const persistedDevices = await loadDevicePositions();
		const deviceInfo = persistedDevices[deviceId];

		// Check if device has a previous position preference
		if (config.preferPreviousPosition && deviceInfo?.position) {
			const preferredPosition = deviceInfo.position;
			const currentAssignee = currentlyAssigned[preferredPosition];
			
			// If preferred position is available, use it
			if (!currentAssignee) {
				return {
					position: preferredPosition,
					color: deviceInfo.color || DEFAULT_DEVICE_COLORS[preferredPosition]
				};
			}
			
			// If position swapping is allowed, consider it
			if (config.allowPositionSwapping && currentAssignee !== deviceId) {
				// Could implement position swapping logic here if needed
				// For now, we'll fall through to find next available position
			}
		}

		// Find next available position in priority order
		for (const position of POSITION_PRIORITY) {
			const currentAssignee = currentlyAssigned[position];
			if (!currentAssignee || currentAssignee === deviceId) {
				// Update persistent storage with new assignment
				await updatePersistedDevice(deviceId, {
					name: deviceName || undefined,
					position,
					color: DEFAULT_DEVICE_COLORS[position],
				});

				return {
					position,
					color: DEFAULT_DEVICE_COLORS[position]
				};
			}
		}

		// No available positions
		return null;
	} catch (error) {
		console.warn('[AutoAssign] Failed to auto-assign device position:', error);
		return null;
	}
};

/**
 * Get suggested positions for manual assignment
 * @param currentlyAssigned Currently assigned devices by position
 * @returns Available positions with colors
 */
export const getAvailablePositions = (
	currentlyAssigned: Partial<Record<DevicePosition, string>> = {}
): Array<{ position: DevicePosition; label: string; color: string; available: boolean }> => {
	return POSITION_PRIORITY.map(position => ({
		position,
		label: POSITION_LABELS[position],
		color: DEFAULT_DEVICE_COLORS[position],
		available: !currentlyAssigned[position]
	}));
};

/**
 * Validate if a device can be assigned to a specific position
 * @param deviceId Device identifier
 * @param position Target position
 * @param currentlyAssigned Currently assigned devices by position
 * @returns Whether assignment is valid
 */
export const canAssignToPosition = (
	deviceId: string,
	position: DevicePosition,
	currentlyAssigned: Partial<Record<DevicePosition, string>> = {}
): boolean => {
	const currentAssignee = currentlyAssigned[position];
	return !currentAssignee || currentAssignee === deviceId;
};

/**
 * Generate device summary for debugging/logging
 * @param persistedDevices Persisted device information
 * @param currentlyConnected Currently connected device IDs
 * @returns Device summary string
 */
export const generateDeviceSummary = (
	persistedDevices: Record<string, PersistedDeviceInfo>,
	currentlyConnected: string[]
): string => {
	const connectedCount = currentlyConnected.length;
	const persistedCount = Object.keys(persistedDevices).length;
	
	const positionCounts = POSITION_PRIORITY.reduce((acc, pos) => {
		acc[pos] = Object.values(persistedDevices).filter(d => d.position === pos).length;
		return acc;
	}, {} as Record<DevicePosition, number>);

	return [
		`Connected: ${connectedCount}/${POSITION_PRIORITY.length}`,
		`Persisted: ${persistedCount}`,
		`Positions: L:${positionCounts.leftFoot} R:${positionCounts.rightFoot} T:${positionCounts.racket}`
	].join(' | ');
};