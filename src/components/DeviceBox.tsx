import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import type { Device, Characteristic } from 'react-native-ble-plx';
import { useTheme } from '../theme/ThemeContext';
import { useRssi } from '../ble/useRssi';
import { useBatteryPercent } from '../ble/useBatteryPercent';
import { useDeviceManager } from '../ble/DeviceProvider';
import { DevicePosition } from '../ble/BleProvider';
import { Activity, Cpu, Lightbulb } from 'lucide-react-native';
import {
	BatteryWarning,
	BatteryLow,
	BatteryMedium,
	BatteryFull,
	Battery as BatteryIcon,
} from 'lucide-react-native';

type IconType = React.ComponentType<{ color?: string; size?: number }>;

type Props = { 
	position: DevicePosition;
	height?: number; 
	placeholder?: boolean;
};

const SIG_BASE = '0000xxxx-0000-1000-8000-00805f9b34fb';
const toLower = (u?: string | null) => (u ? u.toLowerCase() : '');
const isSigBase128 = (u: string) =>
	/^0000[0-9a-f]{4}-0000-1000-8000-00805f9b34fb$/.test(u);
const to16 = (u: string) => {
	const x = toLower(u);
	if (x.length === 4) return x;
	if (isSigBase128(x)) return x.slice(4, 8);
	return '';
};
const to128 = (u: string) => {
	const x = toLower(u);
	if (x.length === 36) return x;
	if (x.length === 4) return SIG_BASE.replace('xxxx', x);
	return x;
};
const uuidsEqual = (a: string, b: string) => {
	const a16 = to16(a),
		b16 = to16(b);
	if (a16 && b16) return a16 === b16;
	return toLower(to128(a)) === toLower(to128(b));
};

type ServiceKey = 'fatigue' | 'imuRaw' | 'ledControl' | 'battery';
const SERVICES: Record<
	ServiceKey,
	{
		label: string;
		Icon: IconType;
		serviceUuids: string[];
		charUuids: string[];
	}
> = {
	fatigue: {
		label: 'Fatigue',
		Icon: Activity,
		serviceUuids: ['12345678-1234-5678-1234-56789abcdef0'],
		charUuids: ['12345678-1234-5678-1234-56789abcdef1'],
	},
	imuRaw: {
		label: 'IMU',
		Icon: Cpu,
		serviceUuids: ['abcdef01-2345-6789-abcd-ef0123456789'],
		charUuids: ['abcdef01-2345-6789-abcd-ef0123456790'],
	},
	ledControl: {
		label: 'LED',
		Icon: Lightbulb,
		serviceUuids: ['19b10010-e8f2-537e-4f6c-d104768a1214'],
		charUuids: ['19b10010-e8f2-537e-4f6c-d104768a1215'],
	},
	battery: {
		label: 'Batt',
		Icon: BatteryIcon,
		serviceUuids: ['180f', '0000180f-0000-1000-8000-00805f9b34fb'],
		charUuids: ['2a19', '00002a19-0000-1000-8000-00805f9b34fb'],
	},
};

function findMatchingServiceUuid(
	deviceServices: string[],
	wanted: string[],
): string | null {
	for (const svc of deviceServices) {
		for (const w of wanted)
			if (uuidsEqual(svc, w)) return svc.toLowerCase();
	}
	return null;
}
function hasExpectedChar(
	serviceUuid: string | null,
	charsBySvc: Record<string, Characteristic[]>,
	expectedChars: string[],
) {
	if (!serviceUuid) return false;
	const list =
		charsBySvc[serviceUuid] ?? charsBySvc[serviceUuid.toLowerCase()] ?? [];
	if (!list.length) return false;
	return expectedChars.some((want) =>
		list.some((c) => uuidsEqual(c.uuid, want)),
	);
}

const rssiToBars = (rssi: number | null): number => {
	if (rssi == null) return 0;
	if (rssi >= -55) return 4;
	if (rssi >= -65) return 3;
	if (rssi >= -75) return 2;
	if (rssi >= -85) return 1;
	return 0;
};

export default function DeviceBox({ position, placeholder = false }: Props) {
	const { theme } = useTheme();
	const { leftFootDevice, rightFootDevice, racketDevice } = useDeviceManager();

	// Position labels and colors
	const POSITION_LABELS = {
		leftFoot: 'Left Foot',
		rightFoot: 'Right Foot',
		racket: 'Racket'
	};

	const POSITION_COLORS = {
		leftFoot: '#007AFF',   // Blue
		rightFoot: '#FF9500',  // Orange  
		racket: '#34C759'      // Green
	};

	const positionColor = POSITION_COLORS[position];
	const positionLabel = POSITION_LABELS[position];

	// Get the device for this position
	const device = position === 'leftFoot' ? leftFootDevice 
		: position === 'rightFoot' ? rightFootDevice
		: racketDevice;

	// Always call hooks - use position instead of device directly
	const rssi = useRssi(device?.device, 1000);
	const { percent: batteryPercent, supported: supportedBat, error: errorBat } = useBatteryPercent(
		device || { id: '', device: {} as Device, services: [], characteristicsByService: {} }, 
		{ subscribe: !!device, intervalMs: 15000 }
	);
	
	//const stateResult = useStateControl(
	//	item || { id: '', device: {} as Device, services: [], characteristicsByService: {} }, 
	//	{ subscribe: false, intervalMs: 0 }
	//);

	// Compute values with useMemo before early return
	const pct: number | null = device && supportedBat && !errorBat ? batteryPercent ?? null : null;
	const { Icon: BattIcon, color: battColor } = useMemo(() => selectBatteryIcon(pct), [pct]);

	const serviceStates = useMemo(() => {
		if (!device) return [];
		const out: Array<{
			key: ServiceKey;
			label: string;
			Icon: IconType;
			present: boolean;
			active: boolean;
		}> = [];
		(Object.keys(SERVICES) as ServiceKey[]).forEach((key) => {
			const meta = SERVICES[key];
			const matchedSvc = findMatchingServiceUuid(
				device.services,
				meta.serviceUuids,
			);
			const present = !!matchedSvc;
			const active =
				present &&
				hasExpectedChar(
					matchedSvc,
					device.characteristicsByService,
					meta.charUuids,
				);
			out.push({
				key,
				label: meta.label,
				Icon: meta.Icon,
				present,
				active,
			});
		});
		return out;
	}, [device]);

	function selectBatteryIcon(p: number | null) {
		if (p == null)
			return { Icon: BatteryIcon, color: '#9CA3AF', label: '—' };
		if (p <= 15)
			return { Icon: BatteryWarning, color: '#EF4444', label: `${p}%` };
		if (p <= 35)
			return { Icon: BatteryLow, color: '#F59E0B', label: `${p}%` };
		if (p <= 75)
			return { Icon: BatteryMedium, color: '#EAB308', label: `${p}%` };
		return { Icon: BatteryFull, color: '#22C55E', label: `${p}%` };
	}

	// If this is a placeholder or no device, render the placeholder view
	if (placeholder || !device) {
		return (
			<View style={[theme.viewStyles.deviceContainerLarge, theme.viewStyles.placeholder, { borderColor: positionColor, borderWidth: 2 }]}>
				{/* Position Header */}
				<View style={[theme.viewStyles.deviceHeaderLarge, { backgroundColor: positionColor + '20' }]}>
					<Text style={[theme.textStyles.deviceName, theme.textStyles.bold]}>
						{positionLabel}
					</Text>
				</View>
				<View style={theme.viewStyles.placeholderContent}>
					<Text style={theme.textStyles.placeholderText}>No Device</Text>
					<Text style={theme.textStyles.placeholderSubText}>Waiting for connection...</Text>
				</View>
			</View>
		);
	}

	const bars = rssiToBars(rssi);

	return (
		<View style={[theme.viewStyles.deviceContainerLarge, { borderColor: positionColor, borderWidth: 2 }]}>
			{/* Position Header */}
			<View style={[theme.viewStyles.deviceHeaderLarge, { backgroundColor: positionColor + '20' }]}>
				<Text style={[theme.textStyles.deviceName, theme.textStyles.bold]}>
					{positionLabel}
				</Text>
			</View>

			{/* Device Name */}
			<View style={theme.viewStyles.deviceHeader}>
				<Text style={theme.textStyles.deviceName}>
					{device?.name || 'No Device Connected'}
				</Text>
			</View>

			{/* Main Content */}
			<View style={theme.viewStyles.deviceContentLarge}>
				{/* Service Status Icons - Left Side */}
				<View style={theme.viewStyles.servicesSection}>
					{serviceStates.map(({ key, Icon, present, active }) => {
						const iconColor = present
							? active
								? '#22C55E'
								: '#F59E0B'
							: '#E5E7EB';
						return (
							<Icon key={key} size={16} color={iconColor} />
						);
					})}
				</View>

				{/* Main Content Area */}
				<View style={theme.viewStyles.mainContent}>
					{/* Battery Level - Prominent Display */}
					<View style={theme.viewStyles.batterySection}>
						<BattIcon size={28} color={battColor} />
						<Text style={[theme.textStyles.batteryPercentage, { color: battColor }]}>
							{supportedBat ? batteryPercent ?? '—' : 'N/A'}%
						</Text>
					</View>

					{/* Signal Strength */}
					<View style={theme.viewStyles.signalSection}>
						<SignalBars
							bars={bars}
							color="#22C55E"
							dimColor="#E5E7EB"
						/>
						<Text style={theme.textStyles.signalText}>
							{rssi != null ? `${rssi} dBm` : '—'}
						</Text>
					</View>
				</View>
			</View>
		</View>
	);
}

function SignalBars({
	bars,
	color,
	dimColor,
}: {
	bars: number;
	color?: string;
	dimColor?: string;
}) {
	return (
		<View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
			{[0, 1, 2, 3].map((i) => (
				<View
					key={i}
					style={{
						width: 10,
						height: 6 + i * 6,
						borderRadius: 2,
						backgroundColor:
							i < bars
								? color || '#2e7d32'
								: dimColor || '#cfd8dc',
						opacity: i < bars ? 1 : 0.6,
					}}
				/>
			))}
		</View>
	);
}
