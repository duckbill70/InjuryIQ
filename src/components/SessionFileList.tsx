import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import RNFS from 'react-native-fs';
import dayjs from 'dayjs';

import { useTheme } from '../theme/ThemeContext';

// Utility to extract month/year from session filename
function getMonthYearFromFilename(filename: string): string {
  // Expects: session_<timestamp>.jsonl or .ndjson
  const match = filename.match(/session_(\d+)\.(jsonl|ndjson)$/);
  if (match) {
    const timestamp = parseInt(match[1], 10);
    if (!isNaN(timestamp)) {
      return dayjs(timestamp).format('MMMM YYYY');
    }
  }
  return 'Unknown';
}

export const SessionFileList: React.FC = () => {
  const [files, setFiles] = useState<string[]>([]);
  const { theme } = useTheme();

  useEffect(() => {
    (async () => {
      try {
        const list = await RNFS.readDir(RNFS.DocumentDirectoryPath);
        const sessionFiles = list
          .filter(f => f.isFile() && /session_\d+\.(jsonl|ndjson)$/.test(f.name))
          .map(f => f.name)
          .sort((a, b) => b.localeCompare(a)); // newest first
        setFiles(sessionFiles);
      } catch (err) {
        setFiles([]);
      }
    })();
  }, []);

  // Group files by month/year
  const filesByMonth = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const file of files) {
      const month = getMonthYearFromFilename(file);
      if (!groups[month]) groups[month] = [];
      groups[month].push(file);
    }
    // Sort months descending
    return Object.entries(groups).sort((a, b) => dayjs(b[0], 'MMMM YYYY').valueOf() - dayjs(a[0], 'MMMM YYYY').valueOf());
  }, [files]);

  return (
    <ScrollView>
      {filesByMonth.length === 0 && (
        <Text style={styles.empty}>No session files found.</Text>
      )}
      {filesByMonth.map(([month, monthFiles]) => (
        <View key={month}>
          <Text style={theme.textStyles.panelTitle}>{month}</Text>
          {monthFiles.map(file => (
            <View key={file} style={theme.viewStyles.card}>
              <Text style={styles.fileName}>{file}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
    backgroundColor: '#fff',
  },
  monthSection: {
    marginBottom: 18,
  },
  monthHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#333',
  },
  fileRow: {
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  fileName: {
    fontSize: 15,
    color: '#444',
  },
  empty: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
    fontSize: 16,
  },
});
