// src/session/useLowRateAlerts.ts
import { useEffect, useRef } from 'react';
import { useNotify } from '../notify/useNotify';

type Getters = {
	/** current measured Hz for sensor A */
	hzA: number;
	/** current measured Hz for sensor B */
	hzB: number;
	/** target Hz you expect both to run at (or derive per-sensor) */
	expectedHz: number;
	/** true when a recording session is actively collecting */
	sessionActive: boolean;
	/** true when you are writing/collecting, not just connected */
	collecting: boolean;
	/** optional: display names/ids */
	nameA?: string;
	nameB?: string;
};

type Options = {
	/** % of expectedHz below which we alert (default 0.6 == 60%) */
	lowFactor?: number;
	/** seconds rate must stay low before we alert (default 3s) */
	minSecondsLow?: number;
	/** seconds between subsequent alerts (cooldown) (default 30s) */
	cooldownSeconds?: number;
};

export function useLowRateAlerts(get: Getters, opts: Options = {}) {
	const { hzA, hzB, expectedHz, sessionActive, collecting, nameA = 'A', nameB = 'B' } = get;

	const lowFactor = opts.lowFactor ?? 0.6;
	const minLowMs = (opts.minSecondsLow ?? 3) * 1000;
	const cooldownMs = (opts.cooldownSeconds ?? 30) * 1000;

	const { notify } = useNotify({ requestOnMount: true });

	const aLowSinceRef = useRef<number | null>(null);
	const bLowSinceRef = useRef<number | null>(null);
	const aAlertActiveRef = useRef(false);
	const bAlertActiveRef = useRef(false);
	const lastAlertAtRef = useRef(0);

	useEffect(() => {
		if (!sessionActive || !collecting || expectedHz <= 0) {
			aLowSinceRef.current = null;
			bLowSinceRef.current = null;
			aAlertActiveRef.current = false;
			bAlertActiveRef.current = false;
			return;
		}

		const thrA = Math.max(1, expectedHz * lowFactor);
		const thrB = Math.max(1, expectedHz * lowFactor);

		const id = setInterval(async () => {
			const now = Date.now();

			// ---- A
			if (hzA < thrA) {
				if (aLowSinceRef.current == null) aLowSinceRef.current = now;
				const lowFor = now - aLowSinceRef.current;
				const cooldownOk = now - lastAlertAtRef.current >= cooldownMs;
				if (!aAlertActiveRef.current && lowFor >= minLowMs && cooldownOk) {
					aAlertActiveRef.current = true;
					lastAlertAtRef.current = now;
					await notify({
						title: `${nameA}: low data rate`,
						body: `~${hzA.toFixed(1)} Hz (threshold ${thrA.toFixed(1)} Hz).`,
						dedupeKey: `lowrate:${nameA}`,
					});
				}
			} else {
				aLowSinceRef.current = null;
				if (aAlertActiveRef.current && hzA >= thrA) {
					aAlertActiveRef.current = false;
					await notify({
						title: `${nameA}: recovered`,
						body: `Back to ~${hzA.toFixed(1)} Hz (>= ${thrA.toFixed(1)} Hz).`,
						dedupeKey: `recovered:${nameA}`,
					});
				}
			}

			// ---- B
			if (hzB < thrB) {
				if (bLowSinceRef.current == null) bLowSinceRef.current = now;
				const lowFor = now - bLowSinceRef.current;
				const cooldownOk = now - lastAlertAtRef.current >= cooldownMs;
				if (!bAlertActiveRef.current && lowFor >= minLowMs && cooldownOk) {
					bAlertActiveRef.current = true;
					lastAlertAtRef.current = now;
					await notify({
						title: `${nameB}: low data rate`,
						body: `~${hzB.toFixed(1)} Hz (threshold ${thrB.toFixed(1)} Hz).`,
						dedupeKey: `lowrate:${nameB}`,
					});
				}
			} else {
				bLowSinceRef.current = null;
				if (bAlertActiveRef.current && hzB >= thrB) {
					bAlertActiveRef.current = false;
					await notify({
						title: `${nameB}: recovered`,
						body: `Back to ~${hzB.toFixed(1)} Hz (>= ${thrB.toFixed(1)} Hz).`,
						dedupeKey: `recovered:${nameB}`,
					});
				}
			}
		}, 500);

		return () => clearInterval(id);
	}, [hzA, hzB, expectedHz, sessionActive, collecting, lowFactor, notify, minLowMs, cooldownMs, nameA, nameB]);
}
