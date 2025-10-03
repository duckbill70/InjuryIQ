import notifee, { AndroidImportance, TimestampTrigger, TriggerType } from '@notifee/react-native';

export async function ensureChannel() {
	// Android only; safe to call on iOS
	await notifee
		.createChannel({
			id: 'collect',
			name: 'Collection',
			importance: AndroidImportance.DEFAULT,
		})
		.catch(() => {});
}

export async function notifyStalled(gapMs: number, appState: string) {
	await ensureChannel();
	await notifee
		.displayNotification({
			title: 'Collection stalled',
			body: `No data for ${Math.round(gapMs)}ms (state: ${appState})`,
			android: { channelId: 'collect' },
			ios: { sound: 'default' },
		})
		.catch(() => {});
}

export async function notifyResumed(gapMs: number, appState: string) {
	await ensureChannel();
	await notifee
		.displayNotification({
			title: 'Collection resumed',
			body: `Flow resumed after ${Math.round(gapMs)}ms (state: ${appState})`,
			android: { channelId: 'collect' },
			ios: { sound: 'default' },
		})
		.catch(() => {});
}
