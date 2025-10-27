import AsyncStorage from '@react-native-async-storage/async-storage';

// Device position persistence utilities
const DEVICE_POSITIONS_KEY = 'ble_device_positions';
const KNOWN_DEVICES_KEY = 'ble_known_devices';

export interface PersistedDeviceInfo {
	id: string;
	name?: string;
	position?: 'leftFoot' | 'rightFoot' | 'racket';
	color?: string;
	lastSeen: number;
	macAddress?: string; // For iOS, this might be the device identifier
}

export interface DevicePositionMap {
	[deviceId: string]: PersistedDeviceInfo;
}

// Save device positions to persistent storage
export const saveDevicePositions = async (devices: DevicePositionMap): Promise<void> => {
	try {
		await AsyncStorage.setItem(DEVICE_POSITIONS_KEY, JSON.stringify(devices));
	} catch (error) {
		console.warn('[BLE] Failed to save device positions:', error);
	}
};

// Load device positions from persistent storage
export const loadDevicePositions = async (): Promise<DevicePositionMap> => {
	try {
		const data = await AsyncStorage.getItem(DEVICE_POSITIONS_KEY);
		return data ? JSON.parse(data) : {};
	} catch (error) {
		console.warn('[BLE] Failed to load device positions:', error);
		return {};
	}
};

// Save known devices list
export const saveKnownDevices = async (devices: PersistedDeviceInfo[]): Promise<void> => {
	try {
		await AsyncStorage.setItem(KNOWN_DEVICES_KEY, JSON.stringify(devices));
	} catch (error) {
		console.warn('[BLE] Failed to save known devices:', error);
	}
};

// Load known devices list
export const loadKnownDevices = async (): Promise<PersistedDeviceInfo[]> => {
	try {
		const data = await AsyncStorage.getItem(KNOWN_DEVICES_KEY);
		return data ? JSON.parse(data) : [];
	} catch (error) {
		console.warn('[BLE] Failed to load known devices:', error);
		return [];
	}
};

// Update device info in persistent storage
export const updatePersistedDevice = async (
	deviceId: string, 
	updates: Partial<PersistedDeviceInfo>
): Promise<void> => {
	try {
		const currentDevices = await loadDevicePositions();
		const existing = currentDevices[deviceId] || { id: deviceId, lastSeen: Date.now() };
		
		currentDevices[deviceId] = {
			...existing,
			...updates,
			lastSeen: Date.now(),
		};
		
		await saveDevicePositions(currentDevices);
	} catch (error) {
		console.warn('[BLE] Failed to update persisted device:', error);
	}
};

// Remove device from persistent storage
export const removePersistedDevice = async (deviceId: string): Promise<void> => {
	try {
		const currentDevices = await loadDevicePositions();
		delete currentDevices[deviceId];
		await saveDevicePositions(currentDevices);
	} catch (error) {
		console.warn('[BLE] Failed to remove persisted device:', error);
	}
};

// Get devices that should be auto-reconnected (seen within last 7 days)
export const getAutoReconnectDevices = async (): Promise<PersistedDeviceInfo[]> => {
	try {
		const devices = await loadDevicePositions();
		const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
		
		return Object.values(devices).filter(device => 
			device.lastSeen > sevenDaysAgo && device.position
		);
	} catch (error) {
		console.warn('[BLE] Failed to get auto-reconnect devices:', error);
		return [];
	}
};

// Clear old device entries (older than 30 days)
export const cleanupOldDevices = async (): Promise<void> => {
	try {
		const devices = await loadDevicePositions();
		const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
		
		const cleanedDevices: DevicePositionMap = {};
		
		Object.entries(devices).forEach(([id, device]) => {
			if (device.lastSeen > thirtyDaysAgo) {
				cleanedDevices[id] = device;
			}
		});
		
		await saveDevicePositions(cleanedDevices);
		console.log('[BLE] Cleaned up old device entries');
	} catch (error) {
		console.warn('[BLE] Failed to cleanup old devices:', error);
	}
};