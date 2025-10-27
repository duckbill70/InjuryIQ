// BLE Service Hooks for StingRay Device Integration
export { useFatigue } from './useFatigue';
export { useStatistics } from './useStatistics';
export { useLEDControl, LEDControlMode } from './useLEDControl';
export { useBattery } from './useBattery';
export { useStepCounter } from './useStepCounter';
export { useDiagnostics, ErrorCode } from './useDiagnostics';

// BLE Provider
export { BleProvider, useBle } from './BleProvider';
export type { 
	DevicePosition, 
	ConnectedDevice, 
	BleContextValue 
} from './BleProvider';