import React, { memo } from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { ControlState } from '../ble/useControl';
import { useBleStore } from '../ble/bleStore';
import { Play, Square, CircleHelp, Camera, Download, MapPin } from 'lucide-react-native';

/**
 * ControlStateIcon – Icon-only indicator for device control state.
 *
 * States mapped to icons:
 * - RUNNING -> Play (triangle)
 * - STOPPED -> Square
 * - SNAPSHOTTING -> Camera
 * - DUMPING -> Download
 * - SHOWING_LOCATION -> MapPin
 * - UNKNOWN -> CircleHelp
 * - null/undefined -> Grey CircleHelp placeholder
 *
 * Usage:
 * <ControlStateIcon state={ControlState.RUNNING} />
 * <ControlStateIcon state={ControlState.SHOWING_LOCATION} size={28} />
 * <ControlStateIcon state={null} />
 */
export type ControlStateIconProps = {
  /** Device ID to read control state from bleStore. If provided, takes precedence over state prop. */
  deviceId?: string;
  /** Control state; null/undefined renders grey OFF placeholder. Used if deviceId is not provided. */
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
  deviceId,
  state: propState,
  size = 24,
  color,
  placeholderColor,
  style,
  accessibilityLabel,
}) => {
  const { theme } = useTheme();
  
  // Always call the hook (rules of hooks), but only use result if deviceId is provided
  const storeState = useBleStore((s) => deviceId ? s.connected[deviceId]?.metrics?.controlState : undefined);
  const state = deviceId ? storeState : propState;
  
  const isPlaceholder = state === null || state === undefined;
  const iconColor = isPlaceholder ? (placeholderColor ?? theme.colors.muted) : (color ?? theme.colors.white);

  const renderIcon = () => {
    switch (state) {
      case ControlState.RUNNING:
        return <Play size={size} color={iconColor} fill={iconColor} />;
      case ControlState.STOPPED:
        return <Square size={size} color={iconColor} fill={iconColor} />;
      case ControlState.SNAPSHOTTING:
        return <Camera size={size} color={iconColor} fill={iconColor} />;
      case ControlState.DUMPING:
        return <Download size={size} color={iconColor} />;
      case ControlState.SHOWING_LOCATION:
        return <MapPin size={size} color={iconColor} fill={iconColor} />;
      case ControlState.UNKNOWN:
      default:
        // Unknown / placeholder
        return <CircleHelp size={size} color={iconColor} />;
    }
  };

  const a11y =
    accessibilityLabel ?? (
      isPlaceholder
        ? 'State unavailable'
        : state === ControlState.RUNNING
          ? 'Running'
          : state === ControlState.STOPPED
            ? 'Stopped'
            : state === ControlState.SNAPSHOTTING
              ? 'Snapshotting'
              : state === ControlState.DUMPING
                ? 'Dumping'
                : state === ControlState.SHOWING_LOCATION
                  ? 'Showing Location'
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
