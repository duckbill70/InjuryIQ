import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { useSession } from '../session/SessionProvider';

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

  // Example session header (replace with real data as needed)
  const exampleHeader = {
    startedAt: new Date().toISOString(),
    devices: [],
    locations: [],
    sport: 'tennis',
  };

  return (
    <View style={[theme.viewStyles.panelContainer, { backgroundColor: theme.colors.white }]}> 
      <Text style={styles.title}>Session Control</Text>
      <Text>Status: {isActive ? (isPaused ? 'Paused' : 'Active') : 'Inactive'}</Text>
      <View style={styles.buttonRow}>
        <Button
          title="Start"
          onPress={() => startSession(exampleHeader)}
          disabled={isActive}
        />
        <Button
          title="Pause"
          onPress={pauseSession}
          disabled={!isActive || isPaused}
        />
        <Button
          title="Resume"
          onPress={resumeSession}
          disabled={!isActive || !isPaused}
        />
        <Button
          title="Stop"
          color="#d9534f"
          onPress={() => stopSession()}
          disabled={!isActive}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    margin: 16,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
});
