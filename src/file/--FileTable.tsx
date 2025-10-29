import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Text, View, StyleSheet, ScrollView, Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { DataTable, IconButton } from 'react-native-paper';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import dayjs from 'dayjs';

import { listCreatedFiles, type FileInfo } from './fileUtils';
import { useTheme } from '../theme/ThemeContext';
import type { Theme } from '../theme/theme';

function bytes(n: number) {
	if (!n && n !== 0) return '';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type SortKey = 'name' | 'mtime' | 'size';

function toSentenceCase(str: string) {
	if (!str) return '';
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Async function to extract sport from NDJSON file
async function getSportFromNDJSON(filePath: string): Promise<string | undefined> {
	try {
		const fileContent = await RNFS.readFile(filePath, 'utf8');
		const firstLine = fileContent.split('\n')[0];
		const header = JSON.parse(firstLine);
		return toSentenceCase(header.sport); // e.g., "Padel"
	} catch (err) {
		console.warn('Failed to extract sport:', err);
		return undefined;
	}
}

// Child component to fetch and display sport and duration
function RowInfo({ filePath, file, theme }: { 
	filePath: string; 
	file: FileInfo; 
	theme: Theme;
}) {
	const [sport, setSport] = useState<string>('Loading...');
	//const [duration, setDuration] = useState<string>('Loading...');

	useEffect(() => {
		let mounted = true;
		getSportFromNDJSON(filePath).then((result) => {
			if (mounted) setSport(result ?? 'N/A');
		});

		//getNDJSONDuration(filePath).then((result) => {
		//	if (mounted) {
		//		if (result.durationSeconds !== undefined) {
		//			setDuration(`${result.formatted}`);
		//		} else {
		//			setDuration('N/A');
		//		}
		//	}
		//});

		return () => {
			mounted = false;
		};
	}, [filePath]);

	return (
		<View style={{ flexDirection: 'column', paddingVertical: 9 }}>
			<Text style={[theme?.textStyles?.body2, { color: theme?.colors?.black, fontWeight: 'bold' }]}>{`${sport}`}</Text>
			{/* <Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.muted, fontWeight: 'bold' }]}>{`${duration}`}</Text> */}
			<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.muted, fontWeight: 'bold' }]}>{file.mtime ? new Date(file.mtime).toLocaleDateString() : ''}</Text>
			<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.muted, fontWeight: 'bold' }]}>{file.mtime ? new Date(file.mtime).toLocaleTimeString() : ''}</Text>
		</View>
	);
}

export default function FileTable() {
	const [files, setFiles] = useState<FileInfo[]>([]);
	const [page, setPage] = useState(0);
	const [sortKey, setSortKey] = useState<SortKey>('mtime');
	const [sortDesc, setSortDesc] = useState(true);

	const { theme } = useTheme();
	const isFocused = useIsFocused();

	const itemsPerPage = 20;

	const currentMonthYear = dayjs().format('MMMM YYYY'); // e.g., "October 20

	useEffect(() => {
		(async () => {
			const list = await listCreatedFiles({ exts: ['.ndjson'], sort: 'mtime', desc: true });
			setFiles(list);
			setPage(0);
			setSortKey('mtime');
			setSortDesc(true);
		})().catch(console.warn);
	}, []);

	// 🔹 define load function here
	const load = useCallback(async () => {
		try {
			const list = await listCreatedFiles({
				exts: ['.ndjson'],
				sort: sortKey,
				desc: sortDesc,
			});
			setFiles(list);
			setPage(0); // reset pagination when reloading
		} catch (err) {
			console.warn('Failed to load files:', err);
		}
	}, [sortKey, sortDesc]);

	useEffect(() => {
		if (isFocused) {
			load().catch(console.warn);
		}
	}, [isFocused, sortKey, sortDesc, load]);

	const sorted = useMemo(() => {
		const mul = sortDesc ? -1 : 1;
		return [...files].sort((a, b) => {
			let av: string | number | Date = 0;
			let bv: string | number | Date = 0;
			
			if (sortKey === 'name') {
				av = a.name;
				bv = b.name;
			} else if (sortKey === 'size') {
				av = a.size;
				bv = b.size;
			} else if (sortKey === 'mtime') {
				av = a.mtime || new Date(0);
				bv = b.mtime || new Date(0);
			}
			
			return av > bv ? mul : av < bv ? -mul : 0;
		});
	}, [files, sortKey, sortDesc]);

	const from = page * itemsPerPage;
	const to = Math.min((page + 1) * itemsPerPage, sorted.length);
	const pageItems = sorted.slice(from, to);

	async function handleDelete(path: string) {
		try {
			await RNFS.unlink(path);
			setFiles((prev) => prev.filter((f) => f.path !== path));
		} catch (err) {
			console.warn('Failed to delete file:', err);
		}
	}

	const getMonthYearIfDifferent = (mtime: Date | undefined) => {
		const current = dayjs();
		const fileDate = dayjs(mtime);

		const isSameMonthYear = current.isSame(fileDate, 'month') && current.isSame(fileDate, 'year');

		return isSameMonthYear ? null : fileDate.format('MMMM YYYY'); // e.g., "September 2025"
	};

	return (
		<ScrollView style={{ marginVertical: 10 }}>
			<DataTable>

				<Text style={[theme?.textStyles?.body2, { color: theme?.colors?.white, fontWeight: 'bold', marginHorizontal: 10 }]}>{currentMonthYear}</Text>

				{pageItems.map((f) => (
					<View key={f.path} style={{ flexDirection: 'column' }}>

						{getMonthYearIfDifferent(f?.mtime) ? <Text style={[theme?.textStyles?.body2, { color: theme?.colors?.white, fontWeight: 'bold', marginHorizontal: 10 }]}>{getMonthYearIfDifferent(f.mtime)}</Text> : null}

						<DataTable.Row key={f.path} style={[styles.card, { margin: 5 }]}>
							<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignContent: 'center', width: '100%' }}>
								<RowInfo filePath={f.path} file={f} theme={theme} />
								<View style={{ flexDirection: 'row', alignItems: 'center' }}>
									<Text style={[theme?.textStyles?.body2, { color: theme?.colors?.black, fontWeight: 'bold' }]}>{bytes(f.size)}</Text>
								</View>
								<View style={{ flexDirection: 'row', alignItems: 'center' }}>
									<IconButton mode='contained-tonal' icon='share-variant' iconColor='green' onPress={() => Share.open({ url: 'file://' + f.path }).catch(() => {})} size={25} />
									<IconButton mode='contained-tonal' icon='delete' iconColor='red' onPress={() => handleDelete(f.path)} size={25} style={{ marginLeft: 8 }} />
								</View>
							</View>
						</DataTable.Row>
					</View>
				))}

				<View style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
					<DataTable.Pagination
						theme={{
							colors: {
								primary: theme?.colors?.primary, //'#FF8212',
								onSurfaceVariant: theme?.colors?.primary, //'#FF8212',
							},
						}}
						page={page}
						numberOfPages={Math.max(1, Math.ceil(sorted.length / itemsPerPage))}
						onPageChange={setPage}
						label={`${sorted.length ? from + 1 : 0}-${to} of ${sorted.length}`}
						numberOfItemsPerPage={itemsPerPage}
						numberOfItemsPerPageList={[itemsPerPage]}
						showFastPaginationControls
						selectPageDropdownLabel='Rows per page'
					/>
				</View>
			</DataTable>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	card: {
		marginHorizontal: 8,
		borderRadius: 12,
		padding: 12,
		borderWidth: 0.5,
		borderColor: '#6b7280',
		borderStyle: 'solid',
		borderBottomWidth: 0.5, // explicitly set
		borderBottomColor: '#6b7280', // match your border color
		backgroundColor: 'white',
		opacity: 0.9,
	},
	rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	rowCenter: { flexDirection: 'row', alignItems: 'center' },
	deviceCol: { maxWidth: '48%' },
	bold: { fontWeight: '700' },
	dim: { color: '#6b7280' },
	mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
	btn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 10,
	},
	btnLabel: { color: 'white', fontWeight: '600' },
});
