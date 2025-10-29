import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { IconButton } from 'react-native-paper';
import RNFS from 'react-native-fs';
import dayjs from 'dayjs';
import Share from 'react-native-share';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';

// Session file metadata types
interface SessionHeader {
	type: 'header';
	startedAt: string;
	devices: unknown[];
	sport: string;
}

interface SessionFooter {
	type: 'footer';
	stoppedAt: string;
	duration: number;
	stats: Record<string, unknown>;
}

interface SessionMetadata {
	header: SessionHeader | null;
	footer: SessionFooter | null;
}

// Extract header from session file
async function getSessionHeader(filePath: string): Promise<SessionHeader | null> {
	try {
		// Use readFile and parse just the first line instead of using read()
		const content = await RNFS.readFile(filePath, 'utf8');
		const firstLine = content.split('\n')[0];
		if (firstLine) {
			const parsed = JSON.parse(firstLine);
			if (__DEV__) console.log('Parsed header:', parsed);
			if (parsed.type === 'header') {
				return parsed as SessionHeader;
			}
		}
	} catch (err) {
		console.warn('Failed to read header from', filePath, err);
	}
	return null;
}

// Extract footer from session file
async function getSessionFooter(filePath: string): Promise<SessionFooter | null> {
	try {
		// Use readFile and parse just the last line
		const content = await RNFS.readFile(filePath, 'utf8');
		const lines = content.trim().split('\n');
		const lastLine = lines[lines.length - 1];
		if (lastLine) {
			const parsed = JSON.parse(lastLine);
			if (parsed.type === 'footer') {
				return parsed as SessionFooter;
			}
		}
	} catch (err) {
		console.warn('Failed to read footer from', filePath, err);
	}
	return null;
}

// Get both header and footer metadata
async function getSessionMetadata(filePath: string): Promise<SessionMetadata> {
	const [header, footer] = await Promise.all([
		getSessionHeader(filePath),
		getSessionFooter(filePath)
	]);
	return { header, footer };
}

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

interface SessionFile {
	name: string;
	path: string;
	metadata?: SessionMetadata;
}

export const SessionFileList: React.FC = () => {
	const [files, setFiles] = useState<SessionFile[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const { theme } = useTheme();

	// Load session files from disk
	const loadFiles = useCallback(async () => {
		try {
			const list = await RNFS.readDir(RNFS.DocumentDirectoryPath);
			const sessionFiles = list
				.filter((f) => f.isFile() && /session_\d+\.(jsonl|ndjson)$/.test(f.name))
				.map((f) => ({ name: f.name, path: f.path }))
				.sort((a, b) => b.name.localeCompare(a.name)); // newest first
			
			if (__DEV__) console.log('Found session files:', sessionFiles.length);
			
			// Load metadata for each file
			const filesWithMetadata = await Promise.all(
				sessionFiles.map(async (file) => {
					const metadata = await getSessionMetadata(file.path);
					if (__DEV__) console.log('Metadata for', file.name, ':', metadata);
					return {
						...file,
						metadata
					};
				})
			);
			
			if (__DEV__) console.log('Files with metadata:', filesWithMetadata);
			setFiles(filesWithMetadata);
		} catch (err) {
			console.error('Error loading session files:', err);
			setFiles([]);
		}
	}, []);

	// Initial load
	useEffect(() => {
		loadFiles();
	}, [loadFiles]);

	// Refresh when screen comes into focus
	useFocusEffect(
		useCallback(() => {
			loadFiles();
		}, [loadFiles])
	);

	// Pull-to-refresh handler
	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await loadFiles();
		setRefreshing(false);
	}, [loadFiles]);

	// Group files by month/year
	const filesByMonth = useMemo(() => {
		const groups: Record<string, SessionFile[]> = {};
		for (const file of files) {
			// Use startedAt from header if available, otherwise fall back to filename
			let month: string;
			if (file.metadata?.header?.startedAt) {
				month = dayjs(file.metadata.header.startedAt).format('MMMM YYYY');
			} else {
				month = getMonthYearFromFilename(file.name);
			}
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
		<ScrollView
			refreshControl={
				<RefreshControl
					refreshing={refreshing}
					onRefresh={onRefresh}
					tintColor={theme.colors.primary}
					colors={[theme.colors.primary]}
				/>
			}
		>
			{filesByMonth.length === 0 && <Text style={styles.empty}>No session files found.</Text>}
			{filesByMonth.map(([month, monthFiles]) => (
				<View key={month}>
					<Text style={[theme.textStyles.title, {color: theme.colors.white, margin: 5}]}>{month}</Text>
					{monthFiles.map((file) => {
						const header = file.metadata?.header;
						const footer = file.metadata?.footer;
						const isActive = !footer; // Session is still active if no footer
						const displayDate = header?.startedAt 
							? dayjs(header.startedAt).format('MMM D, YYYY • h:mm A')
							: file.name;
						const duration = footer?.duration 
							? `${Math.floor(footer.duration / 60)}m ${footer.duration % 60}s`
							: null;
						const sport = header?.sport;

						return (
							<View key={file.name} style={[theme.viewStyles.card, { flexDirection: 'row', alignItems: 'center', marginBottom: 10, backgroundColor: theme.colors.white, opacity: isActive ? 0.6 : 1 }]}>
								<View style={{ flex: 1 }}>
									<Text style={styles.fileDate}>{displayDate}</Text>
									{(sport || duration || isActive) && (
										<Text style={styles.fileDetails}>
											{sport && `${sport}`}
											{sport && (duration || isActive) && ' • '}
											{isActive ? 'Recording...' : duration}
										</Text>
									)}
								</View>
								<IconButton 
									mode='contained-tonal' 
									icon='share-variant' 
									iconColor={isActive ? '#ccc' : 'green'} 
									onPress={() => isActive ? null : Share.open({ url: 'file://' + file.path }).catch(() => {})} 
									size={25} 
									disabled={isActive}
								/>
								<IconButton 
									mode='contained-tonal' 
									icon='delete' 
									iconColor={isActive ? '#ccc' : 'red'} 
									onPress={() => isActive ? null : handleDelete(file.path)} 
									size={25} 
									style={{ marginLeft: 8 }} 
									disabled={isActive}
								/>
							</View>
						);
					})}
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
	fileDate: {
		fontSize: 15,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
	},
	fileDetails: {
		fontSize: 13,
		color: '#666',
	},
	empty: {
		textAlign: 'center',
		color: '#888',
		marginTop: 40,
		fontSize: 16,
	},
});
