import RNFS from 'react-native-fs';

export const LOG_DIR = `${RNFS.DocumentDirectoryPath}/imu_sessions`; // use the same folder your writer uses

export type FileInfo = {
  name: string;
  path: string;
  size: number;
  mtime: Date | undefined;
};

export async function listCreatedFiles(opts?: {
  dir?: string;
  exts?: string[];           // e.g. ['.csv', '.json']
  sort?: 'name' | 'mtime' | 'size';
  desc?: boolean;
}): Promise<FileInfo[]> {
  const dir = opts?.dir ?? LOG_DIR;

  // Ensure folder exists so readDir won't throw
  await RNFS.mkdir(dir);

  const items = await RNFS.readDir(dir); // returns RNFS.ReadDirItem[]
  const exts = opts?.exts;

  const files = items
    .filter(i => i.isFile())
    .filter(i => !exts || exts.some(ext => i.name.toLowerCase().endsWith(ext.toLowerCase())));

  const results: FileInfo[] = files.map(f => ({
    name: f.name,
    path: f.path,
    size: Number(f.size ?? 0),
    mtime: f.mtime instanceof Date ? f.mtime : (f.mtime ? new Date(f.mtime) : undefined),
  }));

  const sortKey = opts?.sort ?? 'mtime';
  const mul = opts?.desc === false ? 1 : -1;
  results.sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    return av > bv ? mul : av < bv ? -mul : 0;
  });

  return results;
}
