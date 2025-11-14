// BLE Service Hooks for StingRay Device Integration
export { useFatigue } from './useFatigue';
export { useControl, ControlState } from './useControl';
export { useBattery } from './useBattery';
export { useStepCounter } from './useStepCounter';

// BLE Provider
export { BleProvider, useBle } from './BleProvider';
export type { 
	DevicePosition, 
	ConnectedDevice, 
	BleContextValue 
} from './BleProvider';