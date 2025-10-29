import RNFS from 'react-native-fs';

export async function getNDJSONDuration(filePath: string): Promise<{
  createdAt?: string;
  stoppedAt?: string;
  durationSeconds?: number;
  durationMinutes?: number;
  formatted?: string;
}> {
  try {
    const fileContent = await RNFS.readFile(filePath, 'utf8');
    const lines = fileContent.split('\n').filter(Boolean);

    // Parse first and last lines
    const header = JSON.parse(lines[0]);
    const stop = JSON.parse(lines[lines.length - 1]);

    const createdAt = header.createdAt;
    const stoppedAt = stop.stoppedAt;

    if (!createdAt || !stoppedAt) return {};

    const start = new Date(createdAt);
    const end = new Date(stoppedAt);

    const durationSecondsRaw = (end.getTime() - start.getTime()) / 1000;
    const durationSeconds = Math.round(durationSecondsRaw);

    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;

    let formatted = '';
    if (minutes > 0) {
      formatted = `${minutes} min${minutes > 1 ? 's' : ''} ${seconds} sec${seconds !== 1 ? 's' : ''}`;
    } else {
      formatted = `${seconds} sec${seconds !== 1 ? 's' : ''}`;
    }

    return { createdAt, stoppedAt, durationSeconds, durationMinutes: minutes, formatted };
  } catch (err) {
    console.warn('Failed to extract timestamps:', err);
    return {};
  }
}
