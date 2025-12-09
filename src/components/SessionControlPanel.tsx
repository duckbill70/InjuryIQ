import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator, Animated } from 'react-native';
import { Play, Pause, SkipForward, Square, Mountain, Footprints, Circle, CircleDot } from 'lucide-react-native';

import { useTheme } from '../theme/ThemeContext';
import { useSession, type Sport } from '../session/SessionProvider';
// import { useBle } from '../ble/BleProvider';
import { useBleStore } from '../ble/bleStore';
import { useNotify } from '../notify/useNotify';
import { DeviceManager } from './DeviceManager';
import { AlertOverlay } from './AlertOverlay';

// Button styling constants - matching PowerStateCycler
const BUTTON_STYLES = {
	size: 60,
	iconSize: 32,
	borderRadius: 6,
	borderWidth: 2,
	disabledOpacity: 0.4,
	pressedOpacity: 0.7,
	pressedScale: 0.95,
};

export const SessionControlPanel: React.FC = () => {
	const { isActive, isPaused, startSession, stopSession, pauseSession, resumeSession } = useSession();
	const { theme } = useTheme();
	// BLE state from Zustand
	const scanning = useBleStore((s) => s.scanning);
	const setScanning = useBleStore((s) => s.setScanning);
	const getDeviceByPosition = useBleStore((s) => s.getDeviceByPosition);
	const { notify } = useNotify();
	const [selectedSport, setSelectedSport] = useState<Sport>('hiking');
	const [bleWarning, setBleWarning] = useState<string | null>(null);
	const [startError, setStartError] = useState<string | null>(null);
	const didInitScanRef = useRef(false);

	// Animation for active state
	const pulseAnim = useRef(new Animated.Value(1)).current;
	const rotateAnim = useRef(new Animated.Value(0)).current;

	const sports: Sport[] = ['hiking', 'running', 'tennis', 'padel'];

	// Map sports to their icons
	const getSportIcon = (sport: Sport) => {
		switch (sport) {
			case 'hiking':
				return Mountain;
			case 'running':
				return Footprints;
			case 'tennis':
				return Circle;
			case 'padel':
				return CircleDot;
		}
	};

	// Shared button base style
	const buttonBaseStyle = {
		width: BUTTON_STYLES.size,
		height: BUTTON_STYLES.size,
		borderRadius: BUTTON_STYLES.borderRadius,
		alignItems: 'center' as const,
		justifyContent: 'center' as const,
		borderWidth: BUTTON_STYLES.borderWidth,
		borderColor: theme.colors.white,
	};

	// Minimal session header - devices and locations are auto-populated by SessionProvider
	const handleStart = () => {
		const left = getDeviceByPosition('leftFoot');
		const right = getDeviceByPosition('rightFoot');
		if (!left || !right) {
			setStartError('Both left and right devices must be assigned before starting a session.');
			return;
		}
		setStartError(null);
		startSession({
			startedAt: new Date().toISOString(),
			sport: selectedSport,
		});
	};

	// Pulse animation when session is active and running
	useEffect(() => {
		if (isActive && !isPaused) {
			// Pulsing animation
			const pulse = Animated.loop(
				Animated.sequence([
					Animated.timing(pulseAnim, {
						toValue: 1.2,
						duration: 800,
						useNativeDriver: true,
					}),
					Animated.timing(pulseAnim, {
						toValue: 1,
						duration: 800,
						useNativeDriver: true,
					}),
				]),
			);

			// Rotation animation
			const rotate = Animated.loop(
				Animated.timing(rotateAnim, {
					toValue: 1,
					duration: 3000,
					useNativeDriver: true,
				}),
			);

			pulse.start();
			rotate.start();

			return () => {
				pulse.stop();
				rotate.stop();
			};
		} else {
			pulseAnim.setValue(1);
			rotateAnim.setValue(0);
		}
	}, [isActive, isPaused, pulseAnim, rotateAnim]);

	// Run a single BLE scan when this panel first loads.
	// On iOS, if Bluetooth is not available, retry a few times before warning.
	// BLE scan logic can be implemented here if needed, using Zustand actions
	// For now, scanning state is toggled via setScanning

	return (
		<View style={[theme.viewStyles.panelContainer, { backgroundColor: theme.colors.black, paddingHorizontal: 20, paddingVertical: 30 }]}>
			{/* Sport Selector - disabled when session is active */}
			<View style={{ marginBottom: 30 }}>
				<View style={{ flexDirection: 'row', justifyContent: 'space-evenly', gap: 8, flexWrap: 'wrap' }}>
					{sports.map((sport) => {
						const IconComponent = getSportIcon(sport);
						return (
							<Pressable
								key={sport}
								onPress={() => setSelectedSport(sport)}
								disabled={isActive}
								style={({ pressed }) => [
									buttonBaseStyle,
									{
										backgroundColor: selectedSport === sport ? theme.colors.primary : theme.colors.deepGreen,
										shadowColor: selectedSport === sport ? theme.colors.primary : theme.colors.deepGreen,
										shadowOffset: { width: 0, height: 3 },
										shadowOpacity: 0.4,
										shadowRadius: 4,
										elevation: 4,
									},
									isActive && { opacity: BUTTON_STYLES.disabledOpacity },
									pressed &&
										!isActive && {
											opacity: BUTTON_STYLES.pressedOpacity,
											transform: [{ scale: BUTTON_STYLES.pressedScale }],
											shadowOpacity: 0.2,
										},
								]}
							>
								<IconComponent size={BUTTON_STYLES.iconSize} color={theme.colors.white} strokeWidth={2} />
							</Pressable>
						);
					})}
				</View>
			</View>

			{/* Session Control Buttons - fixed prominent location, Start only enabled if both devices assigned */}
			<View style={{ flexDirection: 'row', justifyContent: 'space-evenly', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
				{/* Start Button */}
				<Pressable
					onPress={handleStart}
					disabled={isActive || !getDeviceByPosition('leftFoot') || !getDeviceByPosition('rightFoot')}
					style={({ pressed }) => [
						buttonBaseStyle,
						{
							backgroundColor: theme.colors.good,
							shadowColor: theme.colors.good,
							shadowOffset: { width: 0, height: 3 },
							shadowOpacity: 0.4,
							shadowRadius: 4,
							elevation: 4,
						},
						(isActive || !getDeviceByPosition('leftFoot') || !getDeviceByPosition('rightFoot')) && { opacity: BUTTON_STYLES.disabledOpacity },
						pressed &&
							!isActive && getDeviceByPosition('leftFoot') && getDeviceByPosition('rightFoot') && {
								opacity: BUTTON_STYLES.pressedOpacity,
								transform: [{ scale: BUTTON_STYLES.pressedScale }],
								shadowOpacity: 0.2,
							},
					]}
				>
					<Play size={BUTTON_STYLES.iconSize} color={theme.colors.white} fill={theme.colors.white} />
				</Pressable>

				{/* Pause Button */}
				<Pressable
					onPress={pauseSession}
					disabled={!isActive || isPaused}
					style={({ pressed }) => [
						buttonBaseStyle,
						{
							backgroundColor: theme.colors.amber,
							shadowColor: theme.colors.amber,
							shadowOffset: { width: 0, height: 3 },
							shadowOpacity: 0.4,
							shadowRadius: 4,
							elevation: 4,
						},
						(!isActive || isPaused) && { opacity: BUTTON_STYLES.disabledOpacity },
						pressed &&
							isActive &&
							!isPaused && {
								opacity: BUTTON_STYLES.pressedOpacity,
								transform: [{ scale: BUTTON_STYLES.pressedScale }],
								shadowOpacity: 0.2,
							},
					]}
				>
					<Pause size={BUTTON_STYLES.iconSize} color={theme.colors.white} fill={theme.colors.white} />
				</Pressable>

				{/* Resume Button */}
				<Pressable
					onPress={resumeSession}
					disabled={!isActive || !isPaused}
					style={({ pressed }) => [
						buttonBaseStyle,
						{
							backgroundColor: theme.colors.primary,
							shadowColor: theme.colors.primary,
							shadowOffset: { width: 0, height: 3 },
							shadowOpacity: 0.4,
							shadowRadius: 4,
							elevation: 4,
						},
						(!isActive || !isPaused) && { opacity: BUTTON_STYLES.disabledOpacity },
						pressed &&
							isActive &&
							isPaused && {
								opacity: BUTTON_STYLES.pressedOpacity,
								transform: [{ scale: BUTTON_STYLES.pressedScale }],
								shadowOpacity: 0.2,
							},
					]}
				>
					<SkipForward size={BUTTON_STYLES.iconSize} color={theme.colors.white} fill={theme.colors.white} />
				</Pressable>

				{/* Stop Button */}
				<Pressable
					onPress={() => stopSession()}
					disabled={!isActive}
					style={({ pressed }) => [
						buttonBaseStyle,
						{
							backgroundColor: theme.colors.danger,
							shadowColor: theme.colors.danger,
							shadowOffset: { width: 0, height: 3 },
							shadowOpacity: 0.4,
							shadowRadius: 4,
							elevation: 4,
						},
						!isActive && { opacity: BUTTON_STYLES.disabledOpacity },
						pressed &&
							isActive && {
								opacity: BUTTON_STYLES.pressedOpacity,
								transform: [{ scale: BUTTON_STYLES.pressedScale }],
								shadowOpacity: 0.2,
							},
					]}
				>
					<Square size={BUTTON_STYLES.iconSize} color={theme.colors.white} fill={theme.colors.white} />
				</Pressable>
			</View>
			{/* Show error if trying to start without both devices */}
			{startError && (
				<Text style={{ color: theme.colors.danger, textAlign: 'center', marginBottom: 8, fontWeight: '600' }}>{startError}</Text>
			)}

			{/* Session Status - Interactive Graphic */}
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 60, marginBottom: 40 }}>
				<View style={{ alignItems: 'center' }}>
					{/* Status Circle with Animation */}
					<Animated.View
						style={{
							width: 80,
							height: 80,
							borderRadius: 40,
							backgroundColor: isActive ? (isPaused ? theme.colors.amber : theme.colors.good) : theme.colors.muted,
							alignItems: 'center',
							justifyContent: 'center',
							shadowColor: isActive ? (isPaused ? theme.colors.amber : theme.colors.good) : 'transparent',
							shadowOffset: { width: 0, height: 4 },
							shadowOpacity: 0.6,
							shadowRadius: 8,
							elevation: 6,
							transform: [
								{ scale: (isActive && !isPaused ? pulseAnim : 1) as unknown as Animated.AnimatedNode },
								{
									rotate:
										isActive && !isPaused
											? rotateAnim.interpolate({
													inputRange: [0, 1],
													outputRange: ['0deg', '360deg'],
											  })
											: '0deg',
								},
							],
						}}
					>
						{/* Inner circle */}
						<View
							style={{
								width: 50,
								height: 50,
								borderRadius: 25,
								backgroundColor: theme.colors.white,
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							{isActive ? (
								isPaused ? (
									<Pause size={28} color={theme.colors.amber} fill={theme.colors.amber} />
								) : (
									<View
										style={{
											width: 20,
											height: 20,
											borderRadius: 10,
											backgroundColor: theme.colors.good,
										}}
									/>
								)
							) : (
								<View
									style={{
										width: 20,
										height: 20,
										borderRadius: 3,
										backgroundColor: theme.colors.muted,
									}}
								/>
							)}
						</View>
					</Animated.View>

					{/* Status Label */}
					<Text
						style={[
							theme.textStyles.body,
							{
								textAlign: 'center',
								color: 'white',
								marginTop: 12,
								fontWeight: '600',
								fontSize: 14,
								lineHeight: 16,
							},
						]}
					>
						{isActive ? (isPaused ? 'Paused' : 'Recording') : 'Ready'}
					</Text>
				</View>
			</View>

			{/* Devices */}
			<DeviceManager />


			{/* BLE Warning overlay */}
			<AlertOverlay
				visible={!!bleWarning}
				message={bleWarning || ''}
				onDismiss={() => setBleWarning(null)}
			/>

			{/* Scanning overlay - covers entire view */}
			{scanning && (
				<View
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.5)',
						alignItems: 'center',
						justifyContent: 'center',
						borderRadius: theme.viewStyles.panelContainer.borderRadius,
					}}
				>
					<ActivityIndicator size='large' color={theme.colors.white} />
				</View>
			)}
		</View>
	);
};
