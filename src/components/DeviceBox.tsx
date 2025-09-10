import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import type { Device, Characteristic } from 'react-native-ble-plx';
import { useTheme } from '../theme/ThemeContext';
import { useRssi } from '../ble/useRssi';
import { useBatteryPercent } from '../ble/useBatteryPercent';
import { useStateControl, StateMode } from '../ble/useStateControl';
import { useDualImu } from '../ble/DualImuProvider';
import { Activity, Cpu, Lightbulb, Battery } from 'lucide-react-native';

type IconType = React.ComponentType<{ color?: string; size?: number }>;

type ConnectedDeviceLike = {
  id: string;
  name?: string | null;
  device: Device;
  services: string[];
  characteristicsByService: Record<string, Characteristic[]>;
};

type Props = { item: ConnectedDeviceLike; height?: number };

const SIG_BASE = '0000xxxx-0000-1000-8000-00805f9b34fb';
const toLower = (u?: string | null) => (u ? u.toLowerCase() : '');
const isSigBase128 = (u: string) => /^0000[0-9a-f]{4}-0000-1000-8000-00805f9b34fb$/.test(u);
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
  const a16 = to16(a), b16 = to16(b);
  if (a16 && b16) return a16 === b16;
  return toLower(to128(a)) === toLower(to128(b));
};

type ServiceKey = 'fatigue' | 'imuRaw' | 'ledControl' | 'battery';
const SERVICES: Record<ServiceKey, { label: string; Icon: IconType; serviceUuids: string[]; charUuids: string[] }> = {
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
    serviceUuids: ['180f', '0000180f-0000-1000-8000-00805f9b34fb'],
    charUuids: ['2a19', '00002a19-0000-1000-8000-00805f9b34fb'],
  },
};

function findMatchingServiceUuid(deviceServices: string[], wanted: string[]): string | null {
  for (const svc of deviceServices) {
    for (const w of wanted) if (uuidsEqual(svc, w)) return svc.toLowerCase();
  }
  return null;
}
function hasExpectedChar(serviceUuid: string | null, charsBySvc: Record<string, Characteristic[]>, expectedChars: string[]) {
  if (!serviceUuid) return false;
  const list = charsBySvc[serviceUuid] ?? charsBySvc[serviceUuid.toLowerCase()] ?? [];
  if (!list.length) return false;
  return expectedChars.some(want => list.some(c => uuidsEqual(c.uuid, want)));
}

const rssiToBars = (rssi: number | null): number => {
  if (rssi == null) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -85) return 1;
  return 0;
};

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

export default function DeviceBox({ item, height = 175 }: Props) {
  const { theme } = useTheme();

  // RSSI polling
  const rssi = useRssi(item.device, 1000);
  const bars = rssiToBars(rssi);

  // Battery (notify if available; fallback poll)
  const { percent, supported: supportedBat, error: errorBat } = useBatteryPercent(item, { subscribe: true, intervalMs: 15000 });

  // State Control (no subscribe here to avoid duplicate monitors; control box can subscribe)
  const { value: valueState, supported: supportedState, error: errorState } = useStateControl(item, { subscribe: false, intervalMs: 0 });

  // 🔁 IMU stats FROM PROVIDER (no new subscription!)
  const { a, b, entryA, entryB } = useDualImu(); // ensure DeviceBox is rendered inside DualImuProvider
  const session = item.id === entryA?.id ? a : item.id === entryB?.id ? b : null;
  const hz = session?.stats.measuredHz ?? 0;
  const loss = session?.stats.lossPercent ?? 0;

  const serviceStates = useMemo(() => {
    const out: Array<{ key: ServiceKey; label: string; Icon: IconType; present: boolean; active: boolean; }> = [];
    (Object.keys(SERVICES) as ServiceKey[]).forEach(key => {
      const meta = SERVICES[key];
      const matchedSvc = findMatchingServiceUuid(item.services, meta.serviceUuids);
      const present = !!matchedSvc;
      const active = present && hasExpectedChar(matchedSvc, item.characteristicsByService, meta.charUuids);
      out.push({ key, label: meta.label, Icon: meta.Icon, present, active });
    });
    return out;
  }, [item.services, item.characteristicsByService]);

  const primary = theme?.colors?.primary ?? '#1e90ff';
  const muted   = '#9ca3af';
  const border  = '#e5e7eb';

  return (
    <View style={[theme.viewStyles.card, { height, flex: 0.48, flexDirection: 'column', backgroundColor: 'white', opacity: 0.8 }]}>
      {/* Title */}
      <View style={{ alignItems: 'center', marginBottom: 6 }}>
        <Text style={theme.textStyles.body2}>{item.name || 'Unknown device'}</Text>
      </View>

      {/* Center: RSSI */}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 4 }}>
		<SignalBars bars={bars} color={primary} dimColor={border} />
        <Text style={theme.textStyles.body2}>{rssi != null ? `${rssi} dBm` : '—'}</Text>
      </View>

      {/* Battery + IMU Hz/Loss */}
      <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Battery size={20} />
          <Text style={theme.textStyles.body2}>{supportedBat ? (percent ?? '—') : 'N/A'}%</Text>
          {/* <Text style={theme.textStyles.body2}>• {hz.toFixed(1)} Hz</Text>
          <Text style={[theme.textStyles.body2, { color: loss > 5 ? '#ef4444' : '#16a34a' }]}>
            ({loss.toFixed(1)}% loss)
          </Text> */}
        </View>
        {!!errorBat && <Text style={[theme.textStyles.body2, { fontSize: 8, color: 'tomato' }]}>{errorBat}</Text>}
        {!!errorState && <Text style={[theme.textStyles.body2, { fontSize: 8, color: 'tomato' }]}>{errorState}</Text>}
      </View>

      {/* Bottom: service icons (LED tinted by current state) */}
      <View style={{ paddingTop: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
          {serviceStates.map(({ key, Icon, present, active }) => {
            const iconColor = present ? (active ? primary : muted) : border;
            return (
              <View key={key} style={{ alignItems: 'center', minWidth: 44 }}>
                <Icon size={18} color={iconColor} />
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function SignalBars({ bars, color, dimColor }: { bars: number; color?: string; dimColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      {[0, 1, 2, 3].map(i => (
        <View
          key={i}
          style={{
            width: 10,
            height: 6 + i * 6,
            borderRadius: 2,
            backgroundColor: i < bars ? (color || '#2e7d32') : (dimColor || '#cfd8dc'),
            opacity: i < bars ? 1 : 0.6,
          }}
        />
      ))}
    </View>
  );
}
