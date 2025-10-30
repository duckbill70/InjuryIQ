import React, { memo } from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * FifoFillBadge – Small outlined box showing FIFO buffer fill as text.
 *
 * - Displays "FULL" when value is 100 (or more)
 * - Otherwise displays "NN%" (clamped 0–100)
 * - Shows "--%" when value is null/undefined
 * - Outline and text default to white for good contrast over varied backgrounds
 *
 * Usage:
 * <FifoFillBadge value={42} />
 * <FifoFillBadge value={100} fontSize={12} />
 * <FifoFillBadge value={null} fontSize={10} />
 */
export type FifoFillBadgeProps = {
  /** Percent full [0..100]; null renders unknown placeholder */
  value?: number | null;
  /** Text size in dp. Default: 12 */
  fontSize?: number;
  /** Border/text color. Default: theme.colors.white */
  color?: string;
  /** Corner radius. Default: 6 */
  radius?: number;
  /** Optional padding X/Y. Defaults: 6/2 */
  paddingHorizontal?: number;
  paddingVertical?: number;
  /** Optional style for the outer container */
  style?: ViewStyle;
  /** Optional accessibility label override */
  accessibilityLabel?: string;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const FifoFillBadgeComponent: React.FC<FifoFillBadgeProps> = ({
  value,
  fontSize = 12,
  color,
  radius = 6,
  paddingHorizontal = 6,
  paddingVertical = 2,
  style,
  accessibilityLabel,
}) => {
  const { theme } = useTheme();
  const col = color ?? theme.colors.white;
  const isUnknown = value === null || value === undefined;
  const pct = isUnknown ? 0 : clamp(value);

  const label = isUnknown ? '--%' : pct >= 100 ? 'FULL' : `${pct}%`;
  const a11y =
    accessibilityLabel ?? (isUnknown ? 'Buffer fill unknown' : pct >= 100 ? 'Buffer full' : `Buffer ${pct} percent full`);

  return (
    <View
      accessible
      accessibilityLabel={a11y}
      style={[
        {
          borderWidth: 1.5,
          borderColor: col,
          borderRadius: radius,
          paddingHorizontal,
          paddingVertical,
          backgroundColor: 'transparent',
          position: 'relative',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {/* Invisible layout text to reserve space for the widest label */}
      <Text style={{ color: 'transparent', fontSize, fontWeight: '600' }}>FULL</Text>
      {/* Visible overlay label */}
      <Text
        style={{
          position: 'absolute',
          color: col,
          fontSize,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </View>
  );
};

export const FifoFillBadge = memo(FifoFillBadgeComponent);
export default FifoFillBadge;
