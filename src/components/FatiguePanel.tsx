import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeContext';

function Dot({ active, color }: { active: boolean; color: string }) {
	return (
		<View
			style={{
				width: 20,
				height: 20,
				borderRadius: 10,
				marginHorizontal: 5,
				backgroundColor: active ? color : '#9ca3af',
			}}
		/>
	);
}

function getColor(percent: number): string {
	const hue = Math.max(0, Math.min(120, 120 - percent * 1.2));
	return `hsl(${hue}, 100%, 45%)`;
}

function DotLine({ percent, direction = 'ltr' }: { percent: number; direction?: 'ltr' | 'rtl' }) {
	const totalDots = 10;
	const activeDots = Math.round((percent / 100) * totalDots);
	const color = getColor(percent);

	const indices = Array.from({ length: totalDots }, (_, i) => i);
	const orderedIndices = direction === 'ltr' ? indices : indices.reverse();

	return (
		<View style={{ flexDirection: 'row', borderColor: 'grey', borderWidth: 1, borderStyle: 'solid', padding: 10, borderRadius: 5 }}>
			{orderedIndices.map((i) => (
				<Dot key={i} active={i < activeDots} color={color} />
			))}
		</View>
	);
}

export default function FatiguePanel() {
	const { theme } = useTheme();
	const { a, b, fatigueTrendA, fatigueTrendB } = useSession();

	//const recording = !!(a?.collect || b?.collect);

	// latest numeric value for quick UI:
	const latestA = fatigueTrendA.latest?.v ?? null;
	const latestB = fatigueTrendB.latest?.v ?? null;

	// average over the (throttled) window:
	const avgA = fatigueTrendA.avg ?? null;
	const avgB = fatigueTrendB.avg ?? null;

	// history array (for a sparkline):
	//const dataA = fatigueTrendA.history; // [{t, v}, ...]
	//const dataB = fatigueTrendB.history; // [{t, v}, ...]

	// simple threshold check
	//const isHighA = latestA != null && latestA >= 80;
	//const isHighB = latestB != null && latestB >= 80;

	return (
		<View style={[styles.card, { backgroundColor: 'white', opacity: 0.9 }]}>

			{/* Left */}
			<View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
				<DotLine percent={avgA ?? 25} direction='ltr' />
				<Text style={[theme.textStyles.xsmall, styles.dim, { minWidth: 30, textAlign: 'left', marginLeft: 5 }]}>{avgA ?? '--'}%</Text>
			</View>

			{/* Right */}
			<View style={{ marginTop: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
				<DotLine percent={avgB ?? 45} direction='rtl' />
				<Text style={[theme.textStyles.xsmall, styles.dim, { minWidth: 30, textAlign: 'left', marginLeft: 5 }]}>{avgB ?? '--'}%</Text>
			</View>

		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 12,
		padding: 5,
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
