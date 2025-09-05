import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import type { Device, Characteristic } from 'react-native-ble-plx';
import { useTheme } from '../theme/ThemeContext';
import { useRssi } from '../ble/useRssi';
import { useBatteryPercent } from '../ble/useBatteryPercent';
import {
	useStateControl,
	StateMode,
	//stateModeLabel,
} from '../ble/useStateControl';

// pick any icon set you already use; example with lucide-react-native:
import { Activity, Cpu, Lightbulb, Battery } from 'lucide-react-native';


type IconType = React.ComponentType<{ color?: string; size?: number }>;

type ConnectedDeviceLike = {
	id: string;
	name?: string | null;
	device: Device; // must be a CONNECTED device instance
	services: string[]; // list of service UUIDs (can be 16b like '180f' or 128b)
	characteristicsByService: Record<string, Characteristic[]>;
};

type Props = { item: ConnectedDeviceLike; height?: number };

// --- UUID helpers ---
const SIG_BASE = '0000xxxx-0000-1000-8000-00805f9b34fb';

const toLower = (u: string | undefined | null) => (u ? u.toLowerCase() : '');
const isSigBase128 = (u: string) =>
	/^0000[0-9a-f]{4}-0000-1000-8000-00805f9b34fb$/.test(u);

const to16 = (u: string) => {
	const x = toLower(u);
	if (x.length === 4) return x; // already 16-bit
	if (isSigBase128(x)) return x.slice(4, 8); // grab the xxxx part
	return '';
};

const to128 = (u: string) => {
	const x = toLower(u);
	if (x.length === 36) return x; // already 128b
	if (x.length === 4) return SIG_BASE.replace('xxxx', x);
	return x;
};

const uuidsEqual = (a: string, b: string) => {
	const a16 = to16(a);
	const b16 = to16(b);
	if (a16 && b16) return a16 === b16;
	return toLower(to128(a)) === toLower(to128(b));
};

// --- Known services & characteristics (lowercase) ---
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
		Icon: Battery,
		// accept both 16b and full 128b
		serviceUuids: ['180f', '0000180f-0000-1000-8000-00805f9b34fb'],
		charUuids: ['2a19', '00002a19-0000-1000-8000-00805f9b34fb'],
	},
};

// Try to find which concrete service UUID from the device matches a known service
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

// Check if a service’s expected characteristic exists on this device
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

// --- Signal bars helper ---
const rssiToBars = (rssi: number | null): number => {
	if (rssi == null) return 0;
	if (rssi >= -55) return 4;
	if (rssi >= -65) return 3;
	if (rssi >= -75) return 2;
	if (rssi >= -85) return 1;
	return 0;
};

// --- Tiny Button ---
function SmallBtn({ label, onPress }: { label: string; onPress: () => void }) {
	return (
		<Text
			onPress={onPress}
			style={{
				paddingHorizontal: 8,
				paddingVertical: 4,
				backgroundColor: '#1e90ff',
				borderRadius: 6,
			}}
		>
			{label}
		</Text>
	);
}

//-- Color Helper Function
function stateModeToTint(mode: number | null | undefined, fallback: string) {
	switch (mode) {
		case StateMode.Amber:
			return '#FFB300'; // amber
		case StateMode.RedPulse:
			return '#EF4444'; // red-500
		case StateMode.Red:
			return '#EF4444'; // red-500
		case StateMode.GreenPulse:
			return '#22C55E'; // green-500
		case StateMode.Green:
			return '#22C55E'; // green-500
		case StateMode.BluePulse:
			return '#3B82F6'; // blue-500
		case StateMode.Blue:
			return '#3B82F6'; // blue-500
		case StateMode.Off:
			return '#9CA3AF'; // gray-400
		default:
			return fallback; // when unknown
	}
}

export default function DeviceBox({ item, height = 250 }: Props) {
	const { theme } = useTheme();
	const rssi = useRssi(item.device, 1000);
	const bars = rssiToBars(rssi);

	//Battery - try notfiy; poll every 15s otherwise
	const {
		percent,
		supported: supportedBat,
		error: errorBat,
	} = useBatteryPercent(item, { subscribe: true, intervalMs: 15000 });

	//State Control
	const {
		value: valueState,
		supported: supportedState,
		error: errorState,
		commands,
		//setStateMode,
	} = useStateControl(item, { subscribe: true, intervalMs: 0 });

	// Precompute which services exist and whether expected chars are present
	const serviceStates = useMemo(() => {
		const out: Array<{
			key: ServiceKey;
			label: string;
			Icon: IconType;
			present: boolean;
			active: boolean; // present + expected characteristic found
		}> = [];

		(Object.keys(SERVICES) as ServiceKey[]).forEach((key) => {
			const meta = SERVICES[key];
			const matchedSvc = findMatchingServiceUuid(
				item.services,
				meta.serviceUuids,
			);
			const present = !!matchedSvc;
			const active =
				present &&
				hasExpectedChar(
					matchedSvc,
					item.characteristicsByService,
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
	}, [item.services, item.characteristicsByService]);

	const primary = theme?.colors?.primary ?? '#1e90ff';
	const muted = '#9ca3af';
	const border = '#e5e7eb';

	return (
		<View
			style={[
				theme.viewStyles.card,
				{
					height,
					flex: 0.48,
					flexDirection: 'column',
					backgroundColor: 'white',
					opacity: 0.8,
				},
			]}
		>
			{/* Title */}
			<View style={{ alignItems: 'center', marginBottom: 6 }}>
				<Text style={theme.textStyles.body2}>
					{item.name || 'Unknown device'}
				</Text>
				{/* <Text style={[theme.textStyles.body2, { color: muted }]} numberOfLines={1}>
          {item.id}
        </Text> */}
			</View>

			{/* Center: RSSI + bars */}
			<View
				style={{
					flex: 1,
					alignItems: 'center',
					justifyContent: 'center',
					gap: 4,
				}}
			>
				<Text style={theme.textStyles.body2}>
					RSSI: {rssi != null ? `${rssi} dBm` : '—'}
				</Text>
				<SignalBars bars={bars} color={primary} dimColor={border} />
			</View>

			{/* Battery */}
			<View style={{ alignItems: 'center', marginTop: 6 }}>
				<Text style={theme.textStyles.body2}>
					Battery:{' '}
					{supportedBat
						? percent != null
							? `${percent}%`
							: '-'
						: 'N/A'}
				</Text>
				{!!errorBat && (
					<Text
						style={[
							theme.textStyles.body2,
							{ fontSize: 8, color: 'tomato' },
						]}
					>
						{errorBat}
					</Text>
				)}
			</View>

			{/* State */}
			<View
				style={{
					borderTopWidth: 1,
					borderTopColor: border,
					paddingTop: 6,
					paddingBottom: 6,
				}}
			>
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<SmallBtn label='Amber' onPress={commands.amber} />
					<SmallBtn label='Red' onPress={commands.redPulse} />
					<SmallBtn label='Green' onPress={commands.greenPulse} />
				</View>
			</View>
			{!!errorState && (
				<Text
					style={[
						theme.textStyles.body2,
						{ fontSize: 8, color: 'tomato' },
					]}
				>
					{errorState}
				</Text>
			)}

			{/* Bottom: service icons */}
			<View
				style={{
					borderTopWidth: 1,
					borderTopColor: border,
					paddingTop: 6,
				}}
			>
				<View
					style={{
						flexDirection: 'row',
						justifyContent: 'space-around',
						alignItems: 'center',
					}}
				>
					{serviceStates.map(
						({ key, label, Icon, present, active }) => {
							let iconColor = present
								? active
									? primary
									: muted
								: border;
							//let textColor = iconColor

							//if State
							if (key === 'ledControl') {
								iconColor = stateModeToTint(
									supportedState ? valueState : null,
									present ? muted : border,
								);
								//textColor = iconColor
							}

							return (
								<View
									key={key}
									style={{
										alignItems: 'center',
										minWidth: 44,
									}}
								>
									<Icon size={18} color={iconColor} />
									<Text
										style={[
											theme.textStyles.body2,
											{
												marginTop: 2,
												color: present
													? active
														? primary
														: muted
													: border,
											},
										]}
									>
										{label}
									</Text>
								</View>
							);
						},
					)}
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
