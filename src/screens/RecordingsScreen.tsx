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
		<ImageBackground source={require('../../assets/multi-runner.png')} style={{ ...StyleSheet.absoluteFillObject }} imageStyle={{ resizeMode: 'cover' }}>
			<ScrollView style={{ flex: 1, paddingVertical: 60, paddingHorizontal: 10 }}>
				{/* <Text>Other screen!</Text>
				<Text>Param: {route.params?.someParam}</Text> */}

				{/* Header */}
				<View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 }}>
					{/* Scan Button */}
					<TouchableOpacity onPress={() => navigation.goBack()} style={[theme.viewStyles.button, { margin: 10 }]}>
						<ArrowBigLeft size={24} color='white' />
					</TouchableOpacity>

					{/* Sign Out */}
					<TouchableOpacity onPress={() => signOut()} style={[theme.viewStyles.button, { margin: 10 }]}>
						<LogOut size={24} color='white' />
					</TouchableOpacity>
				</View>

				{/* File Content */}
				<FileTable />

				{/* Footer */}
				<View style={{ marginVertical: 10 }}>
					<SessionStatusPanel />
				</View>
			</ScrollView>
		</ImageBackground>
	);
}
