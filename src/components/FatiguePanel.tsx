import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, Square } from 'lucide-react-native';

import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeContext';

import { useFatigueValue } from '../ble/useFatigueValue';
import { useFatigueTrend } from '../ble/useFatigueTrend';

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
    const { entryA, entryB, a, b, sport } = useSession();

    const recording = !!(a?.collect || b?.collect);

    const hzA = a?.stats.measuredHz ?? 0;
    const lossA = a?.stats.lossPercent ?? 0;
    const hzB = b?.stats.measuredHz ?? 0;
    const lossB = b?.stats.lossPercent ?? 0;

    //Fatigue
    const leftFatigue = useFatigueValue(entryA);
    const leftTrend = useFatigueTrend(entryA);
    const rightFatigue = useFatigueValue(entryB);
    const rightTrend = useFatigueTrend(entryB);

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
