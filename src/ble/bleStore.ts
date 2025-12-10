import { create } from 'zustand';
import { Device } from 'react-native-ble-plx';
import { ControlState, SensorLocation } from './useControl';

export type DevicePosition = 'leftFoot' | 'rightFoot';

/**
 * Real-time metrics for a device (updated via characteristic subscriptions)
 */
export interface DeviceMetrics {
  battery: number | null;
  controlState: ControlState;
  fifoPct: number | null;
  isFull: boolean;
  location: SensorLocation;
  snapshotStatus: { slots: boolean[] } | null;
}

/**
 * Complete device state: connectivity + metrics
 */
export interface ConnectedDevice {
  id: string;
  name?: string | null;
  device: Device;
  position?: DevicePosition;
  color?: string;
  assignedAt?: Date;
  metrics: DeviceMetrics;
}

/**
 * Central BLE state store (heavy approach: all data flows through Zustand)
 */
interface BleState {
  // Connectivity state
  connected: Record<string, ConnectedDevice>;
  scanning: boolean;
  isPoweredOn: boolean;

  // Device lifecycle actions
  setConnected: (deviceId: string, device: Device, position?: DevicePosition) => void;
  removeDevice: (deviceId: string) => void;
  assignPosition: (deviceId: string, position: DevicePosition, color?: string) => void;
  unassignPosition: (deviceId: string) => void;
  setScanning: (scanning: boolean) => void;
  setPoweredOn: (isPoweredOn: boolean) => void;

  // Metrics update actions (called from BLE subscription handlers)
  updateMetrics: (deviceId: string, metrics: Partial<DeviceMetrics>) => void;
  setBattery: (deviceId: string, battery: number) => void;
  setControlState: (deviceId: string, state: ControlState) => void;
  setFifoPct: (deviceId: string, pct: number) => void;
  setIsFull: (deviceId: string, isFull: boolean) => void;
  setLocation: (deviceId: string, location: SensorLocation) => void;
  setSnapshotStatus: (deviceId: string, status: { slots: boolean[] } | null) => void;

  // Selectors
  getDeviceByPosition: (position: DevicePosition) => ConnectedDevice | null;
  getConnectedDevices: () => ConnectedDevice[];
  getDeviceById: (deviceId: string) => ConnectedDevice | null;
  getDevicesByPosition: () => Record<DevicePosition, ConnectedDevice | undefined>;
}

const DEFAULT_METRICS: DeviceMetrics = {
  battery: null,
  controlState: ControlState.STOPPED,
  fifoPct: null,
  isFull: false,
  location: SensorLocation.UNKNOWN,
  snapshotStatus: null,
};

/**
 * Zustand store for all BLE state and metrics
 * All device data flows through this central store
 */
export const useBleStore = create<BleState>((set, get) => ({
  // Initial state
  connected: {},
  scanning: false,
  isPoweredOn: false,

  /**
   * Register a newly connected device or update existing
   */
  setConnected: (deviceId, device, position) =>
    set((state) => ({
      connected: {
        ...state.connected,
        [deviceId]: {
          ...state.connected[deviceId], // Preserve existing position/color/metrics if re-connecting
          id: deviceId,
          name: device.localName || device.name,
          device,
          position: position ?? state.connected[deviceId]?.position,
          metrics: state.connected[deviceId]?.metrics || DEFAULT_METRICS,
        },
      },
    })),

  /**
   * Remove a disconnected device
   */
  removeDevice: (deviceId) =>
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [deviceId]: _, ...rest } = state.connected;
      return { connected: rest };
    }),

  /**
   * Assign a device to a position (auto-unassign other devices at that position)
   */
  assignPosition: (deviceId, position, color) =>
    set((state) => {
      const device = state.connected[deviceId];
      if (!device) return state;

      // Clear position from other devices at this position
      const updated = { ...state.connected };
      Object.entries(updated).forEach(([id, dev]) => {
        if (id !== deviceId && dev.position === position) {
          updated[id] = { ...dev, position: undefined };
        }
      });

      // Assign to this device
      updated[deviceId] = {
        ...device,
        position,
        color: color || device.color,
        assignedAt: new Date(),
      };

      return { connected: updated };
    }),

  /**
   * Remove position assignment from a device
   */
  unassignPosition: (deviceId) =>
    set((state) => {
      const device = state.connected[deviceId];
      if (!device) return state;
      return {
        connected: {
          ...state.connected,
          [deviceId]: {
            ...device,
            position: undefined,
            assignedAt: undefined,
          },
        },
      };
    }),

  setScanning: (scanning) => set({ scanning }),
  setPoweredOn: (isPoweredOn) => set({ isPoweredOn }),

  /**
   * Update multiple metrics at once
   */
  updateMetrics: (deviceId, metrics) =>
    set((state) => {
      const device = state.connected[deviceId];
      if (!device) {
        if (__DEV__) console.warn(`[BleStore] updateMetrics: Device ${deviceId.slice(-6)} not found`);
        return state;
      }
      return {
        connected: {
          ...state.connected,
          [deviceId]: {
            ...device,
            metrics: { ...device.metrics, ...metrics },
          },
        },
      };
    }),

  // Convenience methods for single metric updates
  setBattery: (deviceId, battery) => {
    return get().updateMetrics(deviceId, { battery });
  },

  setControlState: (deviceId, state) =>
    get().updateMetrics(deviceId, { controlState: state }),

  setFifoPct: (deviceId, pct) =>
    get().updateMetrics(deviceId, { fifoPct: pct }),

  setIsFull: (deviceId, isFull) =>
    get().updateMetrics(deviceId, { isFull }),

  setLocation: (deviceId, location) =>
    get().updateMetrics(deviceId, { location }),

  setSnapshotStatus: (deviceId, status) =>
    get().updateMetrics(deviceId, { snapshotStatus: status }),

  /**
   * Selector: Get device assigned to a position
   */
  getDeviceByPosition: (position) => {
    const devices = Object.values(get().connected);
    return devices.find((d) => d.position === position) || null;
  },

  /**
   * Selector: Get all connected devices
   */
  getConnectedDevices: () => Object.values(get().connected),

  /**
   * Selector: Get a device by ID
   */
  getDeviceById: (deviceId) => get().connected[deviceId] || null,

  /**
   * Selector: Get devices organized by position
   */
  getDevicesByPosition: () => {
    const connected = get().connected;
    return {
      leftFoot: Object.values(connected).find((d) => d.position === 'leftFoot'),
      rightFoot: Object.values(connected).find((d) => d.position === 'rightFoot'),
    };
  },
}));
