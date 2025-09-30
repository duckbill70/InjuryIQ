import React from 'react';
import { View, Text, ScrollView, ImageBackground, StyleSheet, TouchableOpacity } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import type { RootStackParamList } from './AppNavigator';
import { BluetoothSearchingIcon, Bluetooth, LogOut, CassetteTape, ArrowBigLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';


import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);


import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeContext';

import SessionStatusPanel from '../components/SessionStatusPanel';

type Settings = RouteProp<RootStackParamList, 'Settings'>;

export default function SettingsScreen() {
	const route = useRoute<Settings>();
	const navigation = useNavigation();
	const { user, signOut } = useAuth();
	const { theme } = useTheme();

	return (

			<ScrollView style={{ flex: 1, paddingVertical: 60, paddingHorizontal: 10, backgroundColor: 'teal' }}>
				{/* Header */}
				<View style={{ marginBottom: 10 }}>
					<SessionStatusPanel />
				</View>

				{/* Content */}
				<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
					{/* Sign Out */}
					<TouchableOpacity onPress={() => signOut()} style={[theme.viewStyles.button]}>
						<LogOut size={18} color='white' />
						<Text style={styles.btnLabel}>Logout</Text>
					</TouchableOpacity>
				</View>

				{/* Footer */}
				<View style={{ marginBottom: 10, paddingHorizontal: 5 }}>
					<View style={{ flexDirection: 'row', marginBottom: 5 }}>
						<Text style={[theme.textStyles.body2, { color: 'white', minWidth: 125 }]}>email:</Text>
						<Text style={[theme.textStyles.body2, { color: 'white' }]}>{user?.email ?? 'Anonymous'}</Text>
					</View>

					<View style={{ flexDirection: 'row', marginBottom: 5 }}>
						<Text style={[theme.textStyles.body2, { color: 'white', minWidth: 125 }]}>UID:</Text>
						<Text style={[theme.textStyles.body2, { color: 'white' }]}>{user?.uid}</Text>
					</View>

					<View style={{ flexDirection: 'row', marginBottom: 5 }}>
						<Text style={[theme.textStyles.body2, { color: 'white', minWidth: 125 }]}>Last Sign In:</Text>
						<Text style={[theme.textStyles.body2, { color: 'white' }]}>{dayjs.utc(user?.metadata.lastSignInTime).format('DD/MM/YYYY HH:mm')}</Text>
					</View>

					<View style={{ flexDirection: 'row', marginBottom: 5 }}>
						<Text style={[theme.textStyles.body2, { color: 'white', minWidth: 125 }]}>Name:</Text>
						<Text style={[theme.textStyles.body2, { color: 'white' }]}>{user?.displayName ?? 'unknown'}</Text>
					</View>
				</View>
			</ScrollView>

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
	btnLabel: { color: 'white', fontWeight: '600', paddingLeft: 5 },
});
