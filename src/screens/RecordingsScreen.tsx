import React from 'react';
import { View, Text, ScrollView, ImageBackground, StyleSheet, TouchableOpacity } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import type { RootStackParamList } from './AppNavigator';
import { BluetoothSearchingIcon, Bluetooth, LogOut, CassetteTape, ArrowBigLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeContext';

import FileTable from '../file/FileTable';
import SessionStatusPanel from '../components/SessionStatusPanel';

type Recordings = RouteProp<RootStackParamList, 'Recordings'>;

export default function RecordingsScreen() {
	const route = useRoute<Recordings>();
	const navigation = useNavigation();
	const { user, signOut } = useAuth();
	const { theme } = useTheme();

	return (

			<ScrollView style={{ flex: 1, paddingVertical: 60, paddingHorizontal: 10, backgroundColor: 'teal' }}>
				{/* <Text>Other screen!</Text>
				<Text>Param: {route.params?.someParam}</Text> */}

				{/* Header */}
				<View style={{ marginBottom: 10 }}>
					<SessionStatusPanel />
				</View>

				{/* File Content */}
				<View style={{ marginBottom: 10 }}>
					<FileTable />
				</View>
				
			</ScrollView>

	);
}
