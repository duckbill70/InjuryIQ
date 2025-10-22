import React, { useRef } from 'react';
import { View, Pressable, Animated } from 'react-native';

import { useSession } from '../session/SessionProvider';
import { useStateControl, StateMode } from '../ble/useStateControl';
import { useTheme } from '../theme/ThemeContext';
import FootIcon from './FootIcon';

const modeSequence = [
	StateMode.Amber,
	//StateMode.RedPulse,
	//StateMode.GreenPulse,
	//StateMode.BluePulse,
	StateMode.Red,
	StateMode.Green,
	StateMode.Blue,
	StateMode.Off,
];

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

interface DeviceButtonProps {
	onPress: () => void;
	disabled: boolean;
	color: string;
	side: 'left' | 'right';
	size?: number;
}

const DeviceButton: React.FC<DeviceButtonProps> = ({ onPress, disabled, color, side, size = 80 }) => {
	const { theme } = useTheme();
	const scaleValue = useRef(new Animated.Value(1)).current;

	const handlePressIn = () => {
		Animated.spring(scaleValue, {
			toValue: 0.95,
			useNativeDriver: true,
		}).start();
	};

	const handlePressOut = () => {
		Animated.spring(scaleValue, {
			toValue: 1,
			useNativeDriver: true,
		}).start();
	};

	return (
		<Pressable
			onPress={onPress}
			onPressIn={handlePressIn}
			onPressOut={handlePressOut}
			disabled={disabled}
			style={({ pressed }) => [
				theme.viewStyles.deviceButton,
				{
					backgroundColor: pressed ? 'rgba(0,0,0,0.08)' : 'white',
					borderColor: color,
					borderWidth: 1,
					transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
				}
			]}
		>
			<Animated.View style={{ transform: [{ scale: scaleValue }] }}>
				<FootIcon size={size} color={color} side={side} />
			</Animated.View>
		</Pressable>
	);
};

export default function DeviceStatusPanel() {
	const { theme } = useTheme();
	const { entryA, entryB, a, b } = useSession();
	
	// State control hooks per device (LED/state service)
	const stateA = useStateControl(entryA, { subscribe: true });
	const stateB = useStateControl(entryB, { subscribe: true });

	const recording = !!(a?.collect || b?.collect);

	return (
		<View style={[theme.viewStyles.panelContainer, { backgroundColor: 'white', opacity: 0.9 }]}>
			<View style={theme.viewStyles.devicesRow}>
				{/*--- Left Device ---*/}
				<DeviceButton
					disabled={recording}
					onPress={() => {
						const currentIndex = modeSequence.indexOf(stateA.value ?? StateMode.Off);
						const nextIndex = (currentIndex + 1) % modeSequence.length;
						const nextMode = modeSequence[nextIndex];
						stateA.setStateMode?.(nextMode);
						if (__DEV__) console.log(`stateA.value: ${nextMode}`);
					}}
					color={stateModeToTint(stateA.value, theme?.colors?.muted)}
					side='left'
				/>

				{/*--- Right Device ---*/}
				<DeviceButton
					disabled={recording}
					onPress={() => {
						const currentIndex = modeSequence.indexOf(stateB.value ?? StateMode.Off);
						const nextIndex = (currentIndex + 1) % modeSequence.length;
						const nextMode = modeSequence[nextIndex];
						stateB.setStateMode?.(nextMode);
						if (__DEV__) console.log(`stateB.value: ${nextMode}`);
					}}
					color={stateModeToTint(stateB.value, theme?.colors?.muted)}
					side='right'
				/>
			</View>
		</View>
	);
}
