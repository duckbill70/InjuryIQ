import { create } from 'zustand';
import { Device } from 'react-native-ble-plx';

export type DevicePosition = 'leftFoot' | 'rightFoot';

interface ConnectedDevice {
  device: Device;
  position: DevicePosition | null;
}

interface BleState {
  connected: Record<string, ConnectedDevice>;
  scanning: boolean;
  // Actions
  setConnected: (deviceId: string, device: Device, position: DevicePosition | null) => void;
  removeDevice: (deviceId: string) => void;
  assignPosition: (deviceId: string, position: DevicePosition) => void;
  setScanning: (scanning: boolean) => void;
  // Selectors
  getDeviceByPosition: (position: DevicePosition) => Device | null;
  getConnectedDevices: () => ConnectedDevice[];
}

export const useBleStore = create<BleState>((set: (fn: (state: BleState) => Partial<BleState> | BleState) => void, get: () => BleState) => ({
  connected: {},
  scanning: false,

  setConnected: (deviceId: string, device: Device, position: DevicePosition | null) =>
    set((state: BleState) => ({
      connected: {
        ...state.connected,
        [deviceId]: { device, position },
      },
    })),

  removeDevice: (deviceId: string) =>
    set((state: BleState) => {
      const { [deviceId]: _, ...rest } = state.connected;
      return { connected: rest };
    }),

  assignPosition: (deviceId: string, position: DevicePosition) =>
    set((state: BleState) => ({
      connected: {
        ...state.connected,
        [deviceId]: {
          ...state.connected[deviceId],
          position,
        },
      },
    })),

  setScanning: (scanning: boolean) => set((state: BleState) => ({ ...state, scanning })),

  getDeviceByPosition: (position: DevicePosition) => {
    const devices = Object.values(get().connected) as ConnectedDevice[];
    return devices.find((d) => d.position === position)?.device ?? null;
  },

  getConnectedDevices: () => Object.values(get().connected) as ConnectedDevice[],
}));
