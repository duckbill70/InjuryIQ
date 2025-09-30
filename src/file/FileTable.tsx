import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { DataTable, IconButton } from 'react-native-paper';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import { listCreatedFiles, type FileInfo } from './fileUtils';
import { useTheme } from '../theme/ThemeContext';
import { getNDJSONDuration } from './getNDJSONDuration';

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
function RowInfo({ filePath, file, theme }) {
	const [sport, setSport] = useState<string>('Loading...');
	const [duration, setDuration] = useState<string>('Loading...');

	useEffect(() => {
		let mounted = true;
		getSportFromNDJSON(filePath).then((result) => {
			if (mounted) setSport(result ?? 'N/A');
		});
		getNDJSONDuration(filePath).then((result) => {
			if (mounted) {
				if (result.durationSeconds !== undefined) {
					setDuration(`${result.formatted}`);
				} else {
					setDuration('N/A');
				}
			}
		});
		return () => {
			mounted = false;
		};
	}, [filePath]);

	return (
		<View style={{ flexDirection: 'column', padding: 9 }}>
			<Text style={[theme?.textStyles?.body2, { color: theme?.colors?.black, fontWeight: 'bold' }]}>{`${sport}`}</Text>
			<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.muted, fontWeight: 'bold' }]}>{`${duration}`}</Text>
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

	const itemsPerPage = 6;

	useEffect(() => {
		(async () => {
			const list = await listCreatedFiles({ exts: ['.ndjson'], sort: 'mtime', desc: true });
			setFiles(list);
			setPage(0);
			setSortKey('mtime');
			setSortDesc(true);
		})().catch(console.warn);
	}, []);

	const sorted = useMemo(() => {
		const mul = sortDesc ? -1 : 1;
		return [...files].sort((a, b) => {
			const av = (a as any)[sortKey] ?? 0;
			const bv = (b as any)[sortKey] ?? 0;
			return av > bv ? mul : av < bv ? -mul : 0;
		});
	}, [files, sortKey, sortDesc]);

	const from = page * itemsPerPage;
	const to = Math.min((page + 1) * itemsPerPage, sorted.length);
	const pageItems = sorted.slice(from, to);

	function toggleSort(key: SortKey) {
		if (key === sortKey) {
			setSortDesc((d) => !d);
		} else {
			setSortKey(key);
			setSortDesc(key === 'mtime'); // default newest first for date
		}
		setPage(0);
	}

	async function handleDelete(path: string) {
		try {
			await RNFS.unlink(path);
			setFiles((prev) => prev.filter((f) => f.path !== path));
		} catch (err) {
			console.warn('Failed to delete file:', err);
		}
	}

	return (
		<View style={[styles.card, { backgroundColor: 'white', opacity: 0.9 }]}>
			<DataTable>
				<DataTable.Header>
					<DataTable.Title style={{ justifyContent: 'flex-start' }} sortDirection={sortKey === 'mtime' ? (sortDesc ? 'descending' : 'ascending') : undefined} onPress={() => toggleSort('mtime')}>
						<Text style={[theme?.textStyles?.body, { color: theme?.colors?.black, fontWeight: 'bold' }]}>Modified</Text>
					</DataTable.Title>

					<DataTable.Title numeric sortDirection={sortKey === 'size' ? (sortDesc ? 'descending' : 'ascending') : undefined} onPress={() => toggleSort('size')}>
						<Text style={[theme?.textStyles?.body, { color: theme?.colors?.black, fontWeight: 'bold' }]}>Size</Text>
					</DataTable.Title>

					<DataTable.Title numeric style={{ justifyContent: 'center' }}>
						<Text style={[theme?.textStyles?.body, { color: theme?.colors?.black, fontWeight: 'bold' }]}>Action</Text>
					</DataTable.Title>
				</DataTable.Header>

				{pageItems.map((f) => (
					<DataTable.Row key={f.path}>
						<DataTable.Cell>
							<RowInfo filePath={f.path} file={f} theme={theme} />
						</DataTable.Cell>

						<DataTable.Cell numeric>
							<Text style={[theme?.textStyles?.body2, { color: theme?.colors?.black, fontWeight: 'bold' }]}>{bytes(f.size)}</Text>
						</DataTable.Cell>

						<DataTable.Cell numeric>
							<View style={{ flexDirection: 'row', alignItems: 'center' }}>
								<IconButton mode='contained-tonal' icon='share-variant' iconColor='green' onPress={() => Share.open({ url: 'file://' + f.path }).catch(() => {})} size={25} />
								<IconButton mode='contained-tonal' icon='delete' iconColor='red' onPress={() => handleDelete(f.path)} size={25} style={{ marginLeft: 8 }} />
							</View>
						</DataTable.Cell>
					</DataTable.Row>
				))}

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
			</DataTable>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 12,
		padding: 12,
		borderWidth: 1,
		borderColor: '#e5e7eb',
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
