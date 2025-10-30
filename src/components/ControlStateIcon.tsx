import React, { memo } from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { ControlState } from '../ble/useControl';
import { Play, PauseCircle, CheckCircle, Power } from 'lucide-react-native';

/**
 * ControlStateIcon – Icon-only indicator for device control state.
 *
 * States mapped to icons:
 * - RUN -> Play
 * - STANDBY -> PauseCircle
 * - STOP -> CheckCircle (represents "ready")
 * - OFF -> Power
 * - null/undefined -> Grey OFF (Power) placeholder
 *
 * Usage:
 * <ControlStateIcon state={ControlState.RUN} />
 * <ControlStateIcon state={ControlState.STOP} size={28} />
 * <ControlStateIcon state={null} />
 */
export type ControlStateIconProps = {
  /** Control state; null/undefined renders grey OFF placeholder */
  state?: ControlState | null;
  /** Icon size in dp. Default: 24 */
  size?: number;
  /** Icon color. Default: theme.colors.white */
  color?: string;
  /** Placeholder color when state is null/undefined. Default: theme.colors.muted */
  placeholderColor?: string;
  /** Optional wrapper style (positioning/layout) */
  style?: ViewStyle;
  /** Optional a11y label override */
  accessibilityLabel?: string;
};

const ControlStateIconComponent: React.FC<ControlStateIconProps> = ({
  state,
  size = 24,
  color,
  placeholderColor,
  style,
  accessibilityLabel,
}) => {
  const { theme } = useTheme();
  const isPlaceholder = state === null || state === undefined;
  const iconColor = isPlaceholder ? (placeholderColor ?? theme.colors.muted) : (color ?? theme.colors.white);

  const renderIcon = () => {
    switch (state) {
      case ControlState.RUN:
        return <Play size={size} color={iconColor} />;
      case ControlState.STANDBY:
        return <PauseCircle size={size} color={iconColor} />;
      case ControlState.STOP:
        return <CheckCircle size={size} color={iconColor} />;
      case ControlState.OFF:
        return <Power size={size} color={iconColor} />;
      default:
        // Unknown / placeholder: grey OFF
        return <Power size={size} color={iconColor} />;
    }
  };

  const a11y =
    accessibilityLabel ?? (
      isPlaceholder
        ? 'State unavailable'
        : state === ControlState.RUN
          ? 'Running'
          : state === ControlState.STANDBY
            ? 'Standby'
            : state === ControlState.STOP
              ? 'Ready'
              : state === ControlState.OFF
                ? 'Off'
                : 'Unknown state'
    );

  return (
    <View
      accessible
      accessibilityLabel={a11y}
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      {renderIcon()}
    </View>
  );
};

export const ControlStateIcon = memo(ControlStateIconComponent);
export default ControlStateIcon;
