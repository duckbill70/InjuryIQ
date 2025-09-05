// components/DeviceBox.tsx
import React from 'react';
import { View, Text } from 'react-native';
import type { Device } from 'react-native-ble-plx';
import { useTheme } from '../theme/ThemeContext';
import { useRssi } from '../ble/useRssi';

// If you export ConnectedDevice from your context, import that type instead.
// For a quick drop-in, define a minimal prop shape:
type Props = {
  item: {
    id: string;
    name?: string | null;
    device: Device; // must be a connected Device
    characteristicsByService?: Record<string, unknown>;
  };
  knownServiceUUID: string;
  height?: number;
};

export default function DeviceBox({ item, knownServiceUUID, height = 150 }: Props) {
  const { theme } = useTheme();
  const rssi = useRssi(item.device, 1000); // poll every 1s
  const bars = rssiToBars(rssi);
  const chars = item.characteristicsByService?.[knownServiceUUID] as unknown[] | undefined;

  return (
    <View style={[theme.viewStyles.card, { height, flex: 0.48, flexDirection: 'column' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 4 }}>
        <Text style={theme.textStyles.body}>{item.name || 'Unknown device'}</Text>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <Text style={theme.textStyles.body2}>RSSI: {rssi != null ? `${rssi} dBm` : '—'}</Text>
        <SignalBars bars={bars} />
        {Array.isArray(chars) && (
          <Text style={theme.textStyles.body2}>Chars: {chars.length}</Text>
        )}
      </View>
    </View>
  );
}

function rssiToBars(rssi: number | null): number {
  if (rssi == null) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -85) return 1;
  return 0;
}

function SignalBars({ bars }: { bars: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            width: 10,
            height: 6 + i * 6,
            borderRadius: 2,
            backgroundColor: '#2e7d32',
            opacity: i < bars ? 1 : 0.25,
          }}
        />
      ))}
    </View>
  );
}
