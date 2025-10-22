import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';

import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeContext';

import { SportType } from '../session/types';

interface SportSegmentedControlProps {
	sport: SportType;
	setSport: (sport: SportType) => void;
	recording: boolean;
}

const sports: { value: SportType; label: string }[] = [
	{ value: 'running', label: 'Run' },
	{ value: 'hiking', label: 'Hike' },
	{ value: 'padel', label: 'Padel' },
	{ value: 'tennis', label: 'Tennis' },
];

function SportSegmentedControl({ sport, setSport, recording }: SportSegmentedControlProps) {

	const { theme } = useTheme();

	return (
		<View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', gap: 10 }}>
			{sports.map(({ value, label }) => (
				<TouchableOpacity
					key={value}
					style={[theme.viewStyles.actionButton, {
						flex: 1,
						alignItems: 'center',
						backgroundColor: value === sport ? theme?.colors?.teal : theme?.colors?.muted,
						borderColor: value === sport ? theme?.colors?.teal : theme?.colors?.muted,
						opacity: recording ? 0.6 : 1,
						justifyContent: 'center'
					}]}
					onPress={() => setSport(value)}
					disabled={recording}
				>
					<Text style={theme.textStyles.buttonLabel}>{label}</Text>
				</TouchableOpacity>
			))}
		</View>
	);
}

export default function SportStatusPanel() {
	const { theme } = useTheme();
	const { a, b } = useSession();

	// sport
	const { sport, setSport } = useSession();

	const recording = !!(a?.collect || b?.collect);

	return (
		<View style={[theme.viewStyles.panelContainer, { backgroundColor: 'white', opacity: 0.9 }]}>
			{/*--- Sport? ---*/}
			<SportSegmentedControl sport={sport} setSport={setSport} recording={recording} />
		</View>
	);
}
