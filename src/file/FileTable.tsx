// FileTable.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { DataTable, IconButton } from 'react-native-paper';
import Share from 'react-native-share';
import { listCreatedFiles, type FileInfo } from './fileUtils'; // from previous step
import { useTheme } from '../theme/ThemeContext';

function bytes(n: number) {
	if (!n && n !== 0) return '';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type SortKey = 'name' | 'mtime' | 'size';

export default function FileTable() {
	const [files, setFiles] = useState<FileInfo[]>([]);
	const [page, setPage] = useState(0);
	const [sortKey, setSortKey] = useState<SortKey>('mtime');
	const [sortDesc, setSortDesc] = useState(true);
	const { theme } = useTheme();

	const itemsPerPage = 5;

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

	return (
		<DataTable>
			<DataTable.Header>
                {/* 
				<DataTable.Title sortDirection={sortKey === 'name' ? (sortDesc ? 'descending' : 'ascending') : undefined} onPress={() => toggleSort('name')}>
					<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white, fontWeight: 'bold' }]}>Name</Text>
				</DataTable.Title>
                */}

				<DataTable.Title style={{ justifyContent: 'flex-start' }} sortDirection={sortKey === 'mtime' ? (sortDesc ? 'descending' : 'ascending') : undefined} onPress={() => toggleSort('mtime')}>
					<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white, fontWeight: 'bold' }]}>Modified</Text>
				</DataTable.Title>

                <DataTable.Title numeric sortDirection={sortKey === 'size' ? (sortDesc ? 'descending' : 'ascending') : undefined} onPress={() => toggleSort('size')}>
					<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white, fontWeight: 'bold' }]}>Size</Text>
				</DataTable.Title>

				<DataTable.Title numeric>
					{' '}
					<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white, fontWeight: 'bold' }]}>Action</Text>
				</DataTable.Title>
			</DataTable.Header>

			{pageItems.map((f) => (
				<DataTable.Row key={f.path}>
					{/* Tapping the filename shares/exports the file */}
					{/* 
                    <DataTable.Cell>
                        <TouchableOpacity onPress={() => Share.open({ url: 'file://' + f.path }).catch(() => {})}>
                        
                        <Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white, fontWeight: 'bold' }]}>{f.name}</Text>
                        </TouchableOpacity>
                    </DataTable.Cell> */}
                    <DataTable.Cell>
						<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white, fontWeight: 'bold' }]}>{f.mtime ? new Date(f.mtime).toLocaleString() : ''}</Text>
					</DataTable.Cell>
					<DataTable.Cell numeric>
						<Text style={[theme?.textStyles?.xsmall, { color: theme?.colors?.white, fontWeight: 'bold' }]}>{bytes(f.size)}</Text>
					</DataTable.Cell>
					
					<DataTable.Cell numeric>
						<IconButton icon='share-variant' onPress={() => Share.open({ url: 'file://' + f.path }).catch(() => {})} size={18} />
					</DataTable.Cell>
				</DataTable.Row>
			))}

			<DataTable.Pagination
            theme={{
    //isV3: true, // MD3 tokens
    colors: {
      primary: '#FF8212',         // chevrons & focus accents
      onSurfaceVariant: '#FF8212' // label & dropdown text
    },
  }}
				page={page}
				numberOfPages={Math.max(1, Math.ceil(sorted.length / itemsPerPage))}
				onPageChange={setPage}
				label={`${sorted.length ? from + 1 : 0}-${to} of ${sorted.length}`}
				numberOfItemsPerPage={itemsPerPage}
				numberOfItemsPerPageList={[itemsPerPage]} // locked to 5
				showFastPaginationControls
				selectPageDropdownLabel='Rows per page'
			/>
		</DataTable>
	);
}
