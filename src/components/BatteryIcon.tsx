import React, { memo } from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import {
  Battery as BatteryEmpty,
  BatteryCharging,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
} from 'lucide-react-native';

/**
 * BatteryIcon – Icon-only battery indicator that can be dropped anywhere.
 *
 * Renders a single icon representing the current battery level. The icon color can be set via the
 * `color` prop (defaults to theme.colors.white). When `charging` is true, a charging icon is shown
 * regardless of the level.
 *
 * Usage example:
 *
 * ```tsx
 * // Inside a component
 * <BatteryIcon level={72} />
 * <BatteryIcon level={18} color="#FFD700" />
 * <BatteryIcon level={45} charging size={28} />
 * ```
 */
export type BatteryIconProps = {
  /** Battery level percentage (0-100). Values are clamped. If null/undefined, a placeholder empty icon is shown. */
  level?: number | null;
  /** When true, shows a charging icon regardless of level. */
  charging?: boolean;
  /** Icon size in dp. Default: 24 */
  size?: number;
  /** Icon color. Default: theme.colors.white */
  color?: string;
  /** Placeholder color used when level is null/undefined. Default: theme.colors.muted */
  placeholderColor?: string;
  /** Rotate the battery icon 90 degrees to make it vertical. Default: false */
  vertical?: boolean;
  /** Optional style applied to the icon container (rarely needed). */
  style?: ViewStyle;
  /** Optional accessibility label override. */
  accessibilityLabel?: string;
};

const clampLevel = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const BatteryIconComponent: React.FC<BatteryIconProps> = ({
  level = 0,
  charging = false,
  size = 30,
  color,
  placeholderColor,
  vertical = false,
  style,
  accessibilityLabel,
}) => {
  const { theme } = useTheme();
  const isPlaceholder = level === null || level === undefined;
  const lvl = clampLevel(level ?? 0);
  const iconColor = isPlaceholder ? (placeholderColor || theme.colors.muted) : (color || theme.colors.white);

  // Choose icon based on level thresholds
  const renderIcon = () => {
    if (!isPlaceholder && charging) return <BatteryCharging size={size} color={iconColor} />;
    if (lvl >= 80) return <BatteryFull size={size} color={iconColor} />;
    if (lvl >= 50) return <BatteryMedium size={size} color={iconColor} />;
    if (lvl >= 20) return <BatteryLow size={size} color={iconColor} />;
    return <BatteryEmpty size={size} color={iconColor} />;
  };

  const a11yLabel =
    accessibilityLabel ?? (isPlaceholder
      ? 'Battery unavailable'
      : charging
        ? `Battery charging at ${lvl} percent`
        : `Battery ${lvl} percent`
    );

  return (
    <View
      accessible
      accessibilityLabel={a11yLabel}
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        vertical && { transform: [{ rotate: '-90deg' }] },
        style,
      ]}
    >
      {renderIcon()}
    </View>
  );
};

export const BatteryIcon = memo(BatteryIconComponent);
export default BatteryIcon;
