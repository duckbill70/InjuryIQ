import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { IconButton } from 'react-native-paper';
import RNFS from 'react-native-fs';
import dayjs from 'dayjs';
import Share from 'react-native-share';

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
	const [files, setFiles] = useState<{ name: string; path: string }[]>([]);
	const { theme } = useTheme();

	useEffect(() => {
		(async () => {
			try {
				const list = await RNFS.readDir(RNFS.DocumentDirectoryPath);
				const sessionFiles = list
					.filter((f) => f.isFile() && /session_\d+\.(jsonl|ndjson)$/.test(f.name))
					.map((f) => ({ name: f.name, path: f.path }))
					.sort((a, b) => b.name.localeCompare(a.name)); // newest first
				setFiles(sessionFiles);
			} catch (err) {
				setFiles([]);
			}
		})();
	}, []);

	// Group files by month/year
	const filesByMonth = useMemo(() => {
		const groups: Record<string, { name: string; path: string }[]> = {};
		for (const file of files) {
			const month = getMonthYearFromFilename(file.name);
			if (!groups[month]) groups[month] = [];
			groups[month].push(file);
		}
		// Sort months descending
		return Object.entries(groups).sort((a, b) => dayjs(b[0], 'MMMM YYYY').valueOf() - dayjs(a[0], 'MMMM YYYY').valueOf());
	}, [files]);

	// delete Function
	async function handleDelete(path: string) {
		try {
			await RNFS.unlink(path);
			setFiles((prev) => prev.filter((f) => f.path !== path));
		} catch (err) {
			console.warn('Failed to delete file:', err);
		}
	}

	return (
		<ScrollView>
			{filesByMonth.length === 0 && <Text style={styles.empty}>No session files found.</Text>}
			{filesByMonth.map(([month, monthFiles]) => (
				<View key={month}>
					<Text style={theme.textStyles.panelTitle}>{month}</Text>
					{monthFiles.map((file) => (
						<View key={file.name} style={[theme.viewStyles.card, { marginBottom: 10 }]}>
							<Text style={styles.fileName}>{file.name}</Text>
							<IconButton mode='contained-tonal' icon='share-variant' iconColor='green' onPress={() => Share.open({ url: 'file://' + file.path }).catch(() => {})} size={25} />
							<IconButton mode='contained-tonal' icon='delete' iconColor='red' onPress={() => handleDelete(file.path)} size={25} style={{ marginLeft: 8 }} />
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
