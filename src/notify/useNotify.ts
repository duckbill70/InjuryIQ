// src/notify/useNotify.ts
import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import notifee, { AuthorizationStatus } from '@notifee/react-native';

type NotifyOpts = {
	requestOnMount?: boolean; // ask once on mount (default true)
	dedupeWindowMs?: number; // drop duplicates within this window (default 10s)
	defaultForeground?: boolean; // show alert while app is open (default true)
};

export type NotifyPayload = {
	title: string;
	body: string;
	dedupeKey?: string;
	foreground?: boolean; // override per call
	bypassDedupe?: boolean; // set true while testing
};

export function useNotify(opts: NotifyOpts = {}) {
	const { requestOnMount = true, dedupeWindowMs = 10_000, defaultForeground = true } = opts;

	const lastSentRef = useRef<Map<string, number>>(new Map());

	// Ask once (optional — you can also do this at app startup)
	useEffect(() => {
		if (!requestOnMount) return;
		(async () => {
			try {
				await notifee.requestPermission();
			} catch {}
		})();
	}, [requestOnMount]);

	const getPermissionStatus = useCallback(async () => {
		try {
			const s = await notifee.getNotificationSettings();
			return s.authorizationStatus;
		} catch {
			return AuthorizationStatus.NOT_DETERMINED;
		}
	}, []);

	/**
	 * Ensure permission ONCE:
	 * - NOT_DETERMINED -> prompt
	 * - DENIED -> offer to open Settings (iOS won’t show the prompt again)
	 * returns the final status
	 */
	const ensurePermission = useCallback(
		async (openSettingsIfDenied = false) => {
			let status = await getPermissionStatus();

			if (status === AuthorizationStatus.NOT_DETERMINED) {
				const res = await notifee.requestPermission();
				status = res.authorizationStatus;
			} else if (status === AuthorizationStatus.DENIED && openSettingsIfDenied) {
				Alert.alert('Enable Notifications', 'Notifications are currently disabled for InjuryIQ. Open Settings to enable?', [
					{ text: 'Cancel', style: 'cancel' },
					{ text: 'Open Settings', onPress: () => notifee.openNotificationSettings() },
				]);
			}
			return status;
		},
		[getPermissionStatus],
	);

	const notify = useCallback(
		async (p: NotifyPayload) => {
			const now = Date.now();
			const key = p.dedupeKey ?? `${p.title}::${p.body}`;

			if (!p.bypassDedupe) {
				const last = lastSentRef.current.get(key) ?? 0;
				if (now - last < dedupeWindowMs) return;
				lastSentRef.current.set(key, now);
			}

			const fg = p.foreground ?? defaultForeground;

			await notifee.displayNotification({
				title: p.title,
				body: p.body,
				ios: {
					sound: 'default',
					// Crucial for banners while app is open:
					foregroundPresentationOptions: fg ? { alert: true, sound: true, badge: true } : undefined,
				},
			});
		},
		[dedupeWindowMs, defaultForeground],
	);

	const debugCheck = useCallback(
		async (tag = 'notify') => {
			const s = await getPermissionStatus();
			console.log(`[${tag}] iOS auth status:`, s, {
				NOT_DETERMINED: AuthorizationStatus.NOT_DETERMINED,
				DENIED: AuthorizationStatus.DENIED,
				AUTHORIZED: AuthorizationStatus.AUTHORIZED,
				PROVISIONAL: AuthorizationStatus.PROVISIONAL,
			});
		},
		[getPermissionStatus],
	);

	return { notify, ensurePermission, debugCheck, getPermissionStatus };
}
