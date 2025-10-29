import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Play, Pause, SkipForward, Square } from 'lucide-react-native';

import { useTheme } from '../theme/ThemeContext';
import { useSession, type Sport } from '../session/SessionProvider';

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
  const {
    isActive,
    isPaused,
    startSession,
    stopSession,
    pauseSession,
    resumeSession
  } = useSession();

  const { theme } = useTheme();

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
    const sport: Sport = 'hiking'; // Can be: 'tennis' | 'running' | 'hiking' | 'padel'
    startSession({
      startedAt: new Date().toISOString(),
      sport,
    });
  };

  return (
    <View style={[theme.viewStyles.panelContainer, { backgroundColor: theme.colors.white }]}> 
      <Text style={[theme.textStyles.panelTitle, { marginBottom: 12 }]}>Session Control</Text>
      <Text style={[theme.textStyles.body, { textAlign: 'center', marginBottom: 12 }]}>
        Status: {isActive ? (isPaused ? 'Paused' : 'Active') : 'Inactive'}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', gap: 8, marginTop: 8 }}>
        {/* Start Button */}
        <Pressable
          onPress={handleStart}
          disabled={isActive}
          style={({ pressed }) => [
            buttonBaseStyle,
            { backgroundColor: theme.colors.good },
            isActive && { opacity: BUTTON_STYLES.disabledOpacity },
            pressed && !isActive && { 
              opacity: BUTTON_STYLES.pressedOpacity, 
              transform: [{ scale: BUTTON_STYLES.pressedScale }] 
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
            { backgroundColor: theme.colors.warn },
            (!isActive || isPaused) && { opacity: BUTTON_STYLES.disabledOpacity },
            pressed && isActive && !isPaused && { 
              opacity: BUTTON_STYLES.pressedOpacity, 
              transform: [{ scale: BUTTON_STYLES.pressedScale }] 
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
            { backgroundColor: theme.colors.primary },
            (!isActive || !isPaused) && { opacity: BUTTON_STYLES.disabledOpacity },
            pressed && isActive && isPaused && { 
              opacity: BUTTON_STYLES.pressedOpacity, 
              transform: [{ scale: BUTTON_STYLES.pressedScale }] 
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
            { backgroundColor: theme.colors.danger },
            !isActive && { opacity: BUTTON_STYLES.disabledOpacity },
            pressed && isActive && { 
              opacity: BUTTON_STYLES.pressedOpacity, 
              transform: [{ scale: BUTTON_STYLES.pressedScale }] 
            },
          ]}
        >
          <Square size={BUTTON_STYLES.iconSize} color={theme.colors.white} fill={theme.colors.white} />
        </Pressable>
      </View>
    </View>
  );
};
