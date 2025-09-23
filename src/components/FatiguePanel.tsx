import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, Square } from 'lucide-react-native';

import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeContext';

function Dot({ on = false }: { on?: boolean }) {
    return (
        <View
            style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: on ? '#22c55e' : '#9ca3af',
            }}
        />
    );
}

export default function FatiguePanel() {
    const { theme } = useTheme();
    const { entryA, entryB, a, b, sport, fatigueA, fatigueB, fatigueTrendA, fatigueTrendB } = useSession();

    const recording = !!(a?.collect || b?.collect);

    // latest numeric value for quick UI:
    const latestA = fatigueTrendA.latest?.v ?? null;
    const latestB = fatigueTrendB.latest?.v ?? null;

    // average over the (throttled) window:
    const avgA = fatigueTrendA.avg ?? null;
    const avgB = fatigueTrendB.avg ?? null;

    // history array (for a sparkline):
    const dataA = fatigueTrendA.history; // [{t, v}, ...]
    const dataB = fatigueTrendB.history; // [{t, v}, ...]

    // simple threshold check
    const isHighA = latestA != null && latestA >= 80;
    const isHighB = latestB != null && latestB >= 80;


    function toSentenceCase(str: string) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }


    return (
        <View style={[styles.card, { backgroundColor: 'white', opacity: 0.9 }]}>

            {/* Header */}
            <View style={styles.rowBetween}>
                <View style={{ flexDirection: 'row', alignItems: 'center'}}>
                <Text style={[theme.textStyles.body2, styles.bold]}>Session:</Text>
                <Text style={[theme.textStyles.body2, styles.bold, {paddingLeft: 2}]}>{toSentenceCase(sport)}</Text>
                </View>
                <View style={styles.rowCenter}>
                    <Dot on={recording} />
                    <Text style={[theme.textStyles.xsmall, { marginLeft: 6 }]}>{recording ? 'Collecting' : 'Idle'}</Text>
                </View>
            </View>

            {/* Body */}
            <View style={[styles.rowBetween, {marginTop: 8}]}>
                <Text style={[theme.textStyles.xsmall, styles.dim, { minWidth: 120, textAlign: 'left' }]}>
                    {avgA} avg • {latestA} latest
                </Text>
            </View>

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
