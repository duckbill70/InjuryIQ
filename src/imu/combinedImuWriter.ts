// combinedImuWriter.ts
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import DeviceInfo from 'react-native-device-info';

const APP_INFO = {
	app_name: DeviceInfo.getApplicationName(),
	bundleId: DeviceInfo.getBundleId(),
	version: DeviceInfo.getVersion(),
	build: DeviceInfo.getBuildNumber(),
};

// --- Sport Type --- //
export type Sport = 'padel' | 'tennis' | 'running' | 'hiking';

/** ================= Low-level NDJSON writer (RNFS appendFile-based) ================= */

export type NdjsonRow = Record<string, unknown>;

type StartResult = { path: string };
export type StopResult = { path: string; rows: number; bytes: number };

/** Shapes for periodic stats + GPS rows (matches your ingress stats) */
export type ImuStats = {
	measuredHz: number;
	lossRatio: number;
	lossPercent: number;
	windowSec: number;
	packetsInWindow: number;
	totalPackets: number;
};

export type GpsFix = {
	lat: number;
	lon: number;
	acc?: number; // horizontal accuracy (m)
	alt?: number; // meters
	altAcc?: number; // vertical accuracy (m)
	speed?: number; // m/s
	heading?: number; // degrees
	ts?: number; // ms epoch for the fix
};

/** Cross-platform UTF-8 byte length for React Native (no Node Buffer). */
function utf8ByteLength(s: string): number {
	try {
		// @ts-ignore
		if (typeof TextEncoder !== 'undefined') {
			// @ts-ignore
			return new TextEncoder().encode(s).length;
		}
	} catch {
		// ignore
	}
	// eslint-disable-next-line deprecate/unescape
	return unescape(encodeURIComponent(s)).length;
}

/**
 * Small NDJSON writer built on RNFS.appendFile / writeFile.
 */
export class CombinedImuWriter {
	private filePath: string;
	private buf: string[] = [];
	private rows = 0;
	private bytes = 0;
	private started = false;
	private closed = false;

	// new: periodic ticker for stats + gps
	private tickTimer: ReturnType<typeof setInterval> | null = null;
	private lastStatsA: ImuStats | null = null;
	private lastStatsB: ImuStats | null = null;
	private lastGps: GpsFix | null = null;

	private constructor(filePath: string) {
		this.filePath = filePath;
	}

	static async start(sessionDirAbs: string, filename: string): Promise<{ writer: CombinedImuWriter; info: StartResult }> {
		const exists = await RNFS.exists(sessionDirAbs);
		if (!exists) await RNFS.mkdir(sessionDirAbs);

		const path = `${sessionDirAbs}/${filename}`;
		await RNFS.writeFile(path, '', 'utf8'); // create/truncate

		const writer = new CombinedImuWriter(path);
		writer.started = true;

		// start 1Hz ticker immediately; it will emit only after header
		writer.startTicker();

		if (__DEV__) console.log(`[writer] started at ${path}`);
		return { writer, info: { path } };
	}

	private startTicker() {
		this.stopTicker();
		this.tickTimer = setInterval(() => {
			// Emit a compact "tick" every second with whatever latest we have
			if (!this.started || this.closed) return;
			const row: NdjsonRow = {
				type: 'tick',
				t: Date.now(),
				stats: {
					A: this.lastStatsA ?? null,
					B: this.lastStatsB ?? null,
				},
				gps: this.lastGps ?? null,
			};
			this.append(row);
		}, 1000);
	}

	private stopTicker() {
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = null;
		}
	}

	append(obj: NdjsonRow) {
		if (!this.started || this.closed) {
			if (__DEV__) console.warn('[writer] append() called before start() or after stop()');
			return;
		}
		const line = JSON.stringify(obj) + '\n';
		this.buf.push(line);
		this.rows += 1;

		// Opportunistic flush
		if (this.buf.length >= 128) {
			this.flushChunk().catch((err) => {
				if (__DEV__) console.error('[writer] flushChunk error:', err);
			});
		}
	}

	private async flushChunk(): Promise<void> {
		if (!this.started || this.closed) return;
		if (!this.buf.length) return;

		const payload = this.buf.join('');
		this.buf.length = 0;

		await RNFS.appendFile(this.filePath, payload, 'utf8');
		this.bytes += utf8ByteLength(payload);
		if (__DEV__) console.log(`[writer] flushed chunk bytes≈${utf8ByteLength(payload)} total≈${this.bytes}`);
	}

	async stop(): Promise<StopResult> {
		if (this.closed) {
			if (__DEV__) console.log('[writer] stop(): already closed');
			return { path: this.filePath, rows: this.rows, bytes: this.bytes };
		}

		this.stopTicker();
		await this.flushChunk();

		this.closed = true;
		this.started = false;

		if (__DEV__) console.log('[writer] stopped', { path: this.filePath, rows: this.rows, bytes: this.bytes });
		return { path: this.filePath, rows: this.rows, bytes: this.bytes };
	}

	getPath() {
		return this.filePath;
	}
	getCounts() {
		return { rows: this.rows, bytes: this.bytes };
	}

	/** New setters so the session layer can feed live stats + gps */
	setStatsA(stats: ImuStats | null | undefined) {
		this.lastStatsA = stats ?? null;
	}
	setStatsB(stats: ImuStats | null | undefined) {
		this.lastStatsB = stats ?? null;
	}
	setGps(gps: GpsFix | null | undefined, reason?: string) {
		this.lastGps = gps ?? null;

		if (__DEV__) {
			console.log('[writer] setGps()', { gps: this.lastGps, reason });
			// Emit a small diagnostic row only when there's a reason (usually on errors/permission notes)
			//if (reason) {
			//  this.append({
			//    type: 'gps_debug',
			//    t: Date.now(),
			//    reason,
			//    hasFix: !!gps,
			//    fix: gps ?? null,
			//  });
			//}
		}
	}
}

/** ================= Export last session using react-native-share ================= */
export async function shareLastSessionFile() {
	const dir = `${RNFS.DocumentDirectoryPath}/imu_sessions`;
	const exists = await RNFS.exists(dir);
	if (!exists) {
		__DEV__ && console.log('[share] dir missing', dir);
		return;
	}
	const entries = await RNFS.readDir(dir);
	const files = entries.filter((e) => e.isFile());
	if (!files.length) return;

	files.sort((a, b) => (b.mtime?.getTime() ?? 0) - (a.mtime?.getTime() ?? 0));
	const last = files[0];

	__DEV__ && console.log('[share] sharing', last.path);
	await Share.open({
		url: 'file://' + last.path,
		failOnCancel: false,
		type: 'application/x-ndjson',
		filename: last.name,
	});
}

/** ================= Session-level combined writer expected by SessionProvider ================= */

export type RawPacket = { t: number; b64: string };

export type CombinedWriter = {
	/** Absolute path of the NDJSON file (after start). */
	readonly path: string | null;

	/** Start the file and prepare to append. Idempotent. */
	start(): Promise<void>;

	/** Append batch from device A. */
	onBatchA(batch: RawPacket[] | undefined | null): void;

	/** Append batch from device B. */
	onBatchB(batch: RawPacket[] | undefined | null): void;

	/** Persist the *latest* state values to be captured in the header. */
	setStateA(value: unknown): void;
	setStateB(value: unknown): void;

	/** NEW: pass latest IMU stats so 1Hz tick rows include them */
	setStatsA(stats: ImuStats | null | undefined): void;
	setStatsB(stats: ImuStats | null | undefined): void;

	/** NEW: pass latest GPS fix so 1Hz tick rows include it */
	setGps(gps: GpsFix | null | undefined, reason?: string): void;

	/** Force header write immediately (optional). */
	writeHeaderNow(): void;

	/** Flush & close the file. Safe to call multiple times. */
	stop(reason?: 'user' | 'timeout' | 'error' | 'appBackground'): Promise<StopResult>;

	/** NEW for Pause, Resume */
	pause(): void;
	resume(): void;
	isPaused(): boolean;
};

type FactoryOptions = {
	/** Base filename prefix, e.g. "imu_both" */
	sessionName: string;
	/** Metadata only; not used to pace writes. */
	expectedHz?: number;
	/** Optional device identifiers for A/B. */
	idA?: string | null;
	idB?: string | null;
	/** Optional override of the sessions directory. */
	dirAbs?: string;
	meta?: {
		user?: { uid?: string | null; email?: string | null };
		initialState?: { A: unknown; B: unknown };
		sport?: Sport | null;
	};
};

function isoForFilename(d = new Date()) {
	return d.toISOString().replace(/[:.]/g, '-');
}

function defaultSessionsDir() {
	return `${RNFS.DocumentDirectoryPath}/imu_sessions`;
}

/**
 * High-level factory: writes a header, then compact IMU rows (A/B) and event rows.
 * Row examples:
 *   { "type":"header", ... }
 *   { "t": 1737222222222, "src":"A", "imu_b64":"...==" }
 *   { "t": 1737222230000, "type":"device_event", "which":"B", "event":"dropped" }
 *   { "type":"stop", "stoppedAt":"...", "reason":"user", "totals":{...} }
 */
export function createCombinedImuWriter(opts: FactoryOptions) {
	const { sessionName, expectedHz, idA = null, idB = null, dirAbs = defaultSessionsDir() } = opts;

	let low: CombinedImuWriter | null = null;
	let started = false;
	let filePath: string | null = null;

	// --- session timing ---
	let sessionStartMs: number | null = null;

	// --- session-scoped counters & cadence ---
	let totalPacketsA = 0;
	let totalPacketsB = 0;

	const wallEveryMs = 2000; // periodic absolute anchor (2s)
	let lastWallA = 0;
	let lastWallB = 0;

	// State snapshots for header
	let stateA: unknown = null;
	let stateB: unknown = null;

	let paused = false;
	const segments: Array<{ type: 'start' | 'pause' | 'resume' | 'stop'; t: number }> = [];

	const filename = `${sessionName}__${isoForFilename()}.ndjson`;

	function maybeAnchor(src: 'A' | 'B', t: number) {
		const now = Date.now();
		const last = src === 'A' ? lastWallA : lastWallB;
		if (now - last >= wallEveryMs) {
			low?.append({
				type: 'tick',
				src,
				t, // your packet timeline (you currently use Date.now())
				wallClock: new Date(now).toISOString(), // absolute anchor
			});
			if (src === 'A') lastWallA = now;
			else lastWallB = now;
		}
	}

	async function start() {
		if (started && low) {
			if (__DEV__) console.log('[CombinedWriter] start(): already started');
			return;
		}
		const { writer, info } = await CombinedImuWriter.start(dirAbs, filename);
		low = writer;
		filePath = info.path;
		started = true;

		if (sessionStartMs == null) sessionStartMs = Date.now(); // <-- set start
		pausedAtMs = null;
		totalPausedMs = 0;

		// Header row includes schemas for optional 1Hz rows (stats/gps)
		low.append({
			type: 'header',
			schema: 'injuryiq.imu.ndjson#v2',
			createdAt: new Date().toISOString(),
			app: APP_INFO,
			user: opts.meta?.user ?? null,
			devices: { idA, idB },
			expectedHz: expectedHz ?? null,
			initialState: opts.meta?.initialState ?? null,
			sport: opts.meta?.sport ?? null,
			session: sessionName,
			file: filename,
			tickSchemas: {
				stats: 'injuryiq.imu.stats#v1',
				gps: 'injuryiq.phone.gps#v1',
				cadence: 1, // Hz
			},
		});
		segments.push({ type: 'start', t: Date.now() });

		if (__DEV__) console.log('[CombinedWriter] started', { path: filePath, idA, idB, expectedHz });
	}

	function writeHeaderNow() {
		// header is already written on start in this design
	}

	function appendRows(src: 'A' | 'B', batch?: RawPacket[] | null) {
		if (!started || !low) return;
		if (!batch?.length) return;

		for (let i = 0; i < batch.length; i++) {
			const pkt = batch[i];

			// periodic wall-clock anchor for this stream
			maybeAnchor(src, pkt.t);

			low.append({
				t: pkt.t,
				src,
				imu_b64: pkt.b64,
			});
		}

		if (src === 'A') totalPacketsA += batch.length;
		else totalPacketsB += batch.length;
	}

	function pause() {
		if (!paused) {
			paused = true;
			segments.push({ type: 'pause', t: Date.now() });
		}
	}

	function resume() {
		if (paused) {
			paused = false;
			segments.push({ type: 'resume', t: Date.now() });
		}
	}

	function isPaused() {
		return paused;
	}

	function onBatchA(batch?: RawPacket[] | null) {
		if (paused || !batch?.length) return;
		appendRows('A', batch);
	}

	function onBatchB(batch?: RawPacket[] | null) {
		if (paused || !batch?.length) return;
		appendRows('B', batch);
	}

	function setStateA(v: unknown) {
		stateA = v;
		if (__DEV__) console.log('[CombinedWriter] setStateA', v);
	}

	function setStateB(v: unknown) {
		stateB = v;
		if (__DEV__) console.log('[CombinedWriter] setStateB', v);
	}

	/** New passthroughs to the low-level writer (used by session layer) */
	function setStatsA(stats?: ImuStats | null) {
		low?.setStatsA(stats ?? null);
	}
	function setStatsB(stats?: ImuStats | null) {
		low?.setStatsB(stats ?? null);
	}
	function setGps(gps?: GpsFix | null, reason?: string) {
		low?.setGps(gps ?? null, reason);
	}

	/** NEW: explicit lifecycle/device event logger */
	function onDeviceEvent(ev: { t: number; which?: 'A' | 'B'; event: 'dropped' | 'resumed' | 'session_start' | 'session_stop' | 'session_paused' | 'session_resumed' }) {
		// If your writer uses a different appender, replace `low?.append` with that.
		low?.append({
			type: ev.which ? 'device_event' : 'session_event',
			src: ev.which,
			event: ev.event,
			t: ev.t,
			createdAt: new Date().toISOString(),
		});
	}

	function computeActiveDurationMs(): number {

		if (!segments.length) return 0;

		let activeMS = 0
		let lastStart = segments.find(s => s.type === 'start')?.t ?? segments[0]?.t ?? Date.now()

		for (const seg of segments ) {
			if (seg.type === 'pause'){
				activeMS += seg.t - lastStart
				lastStart = 0
			} else if (seg.type === 'resume') {
				lastStart = seg.t
			}
		}

		if (lastStart) activeMS += Date.now() - lastStart

		return activeMS

	}

	async function stop(reason: 'user' | 'timeout' | 'error' | 'appBackground' = 'user'): Promise<StopResult> {
		if (!started) {
			if (__DEV__) console.log('[CombinedWriter] stop(): not started');
			return { path: filePath ?? `${dirAbs}/${filename}`, rows: 0, bytes: 0 };
		}

		segments.push({ type: 'stop', t: Date.now() });

		const stoppedAtIso = new Date().toISOString();

		// if you have a reliable session start ms, prefer that; else keep a simple now-based duration
		//const durationSec = Math.max(0, Math.round((Date.now() - /* yourSessionStartMs */ Date.now()) / 1000));
		const durationSec = Math.round(computeActiveDurationMs() / 1000)

		const fileTotals = low.getCounts ? low.getCounts() : undefined;

		// If your code stores snapshots in stateA/stateB (fed by setStatsA/B), keep using those:
		//const avgHzA = (stateA as any)?.measuredHz ?? null;
		//const avgHzB = (stateB as any)?.measuredHz ?? null;
		//const lossA = (stateA as any)?.lossPercent ?? null;
		//const lossB = (stateB as any)?.lossPercent ?? null;

		if (low) {
			//const totals = low.getCounts();
			low.append({
				type: 'stop',
				stoppedAt: stoppedAtIso,
				reason,
				durationSec,
				totals: {
					...(fileTotals ? { file: fileTotals } : {}), // preserve your rows/bytes if you have them
					//A: { packets: totalPacketsA, avgHz: avgHzA, lossPercent: lossA },
					//B: { packets: totalPacketsB, avgHz: avgHzB, lossPercent: lossB },
					A: { packets: totalPacketsA },
					B: { packets: totalPacketsB },
				},
				lastState: { A: stateA ?? null, B: stateB ?? null },
			});
		}

		started = false;
		const summary = await low!.stop();
		low = null;
		totalPacketsA = 0;
		totalPacketsB = 0;
		lastWallA = 0;
		lastWallB = 0;

		if (__DEV__) console.log('[CombinedWriter] stopped', summary);
		return summary;
	}

	return {
		get path() {
			return filePath;
		},
		start,
		onBatchA,
		onBatchB,
		setStateA,
		setStateB,
		// ⬇️ add these 3 lines
		setStatsA, // <— exposes the passthrough to low?.setStatsA
		setStatsB, // <— exposes the passthrough to low?.setStatsB
		setGps, // <— exposes the passthrough to low?.setGps
		writeHeaderNow,
		stop,
		pause,
		resume,
		isPaused,
		// exposed (optional) — SessionProvider will call if present
		onDeviceEvent,
	} as CombinedWriter & { onDeviceEvent?: (ev: { t: number; which?: 'A' | 'B'; event: string }) => void };
}
