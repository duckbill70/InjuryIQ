import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ImageBackground, StyleSheet } from 'react-native';
//import { SafeAreaView } from 'react-native-safe-area-context';
import { BluetoothSearchingIcon, Bluetooth, LogOut, CassetteTape } from 'lucide-react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './AppNavigator';

type HomeNav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

import { useAuth } from '../auth/AuthProvider';
import { useBle } from '../ble/BleProvider';
import { useSession } from '../session/SessionProvider';
//import ImuDualControlBox from '../components/ImuDualControlBox';
import DeviceBox from '../components/DeviceBox';
import { useTheme } from '../theme/ThemeContext';

import SessionStatusPanel from '../components/SessionStatusPanel';
import DeviceStatusPanel from '../components/DeviceStatusPanel';
import SportStatusPanel from '../components/SportStatusPanel';
import FatiguePanel from '../components/FatiguePanel';

export default function HomeScreen() {
	const { user, signOut } = useAuth();
	const navigation = useNavigation<HomeNav>();
	const { theme } = useTheme();
	const { scanning, startScan, isPoweredOn } = useBle();
	const { entryA, entryB, writerRef, expectedHz } = useSession();

	//<ImageBackground source={require('../../assets/padel-tennis-2.png')} style={{ ...StyleSheet.absoluteFillObject }} imageStyle={{ resizeMode: 'cover' }}>{content}</ImageBackground>

	return (
		
			<ScrollView style={{ flex: 1, paddingVertical: 60, paddingHorizontal: 10, backgroundColor: theme?.colors?.teal }}>
				{/* Session Manager */}
				<View style={{ marginBottom: 10 }}>
					<SessionStatusPanel />
				</View>

				{/* Sport Manager */}
				<View style={{ marginBottom: 10 }}>
					<SportStatusPanel />
				</View>

				{/* Device Boxes */}

				<View style={{ marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
					{entryA ? <DeviceBox key={entryA.id} item={entryA} /> : <Placeholder />}
					{entryB ? <DeviceBox key={entryB.id} item={entryB} /> : <Placeholder />}
				</View>

				{/* Status Manager */}
				<View style={{ marginBottom: 10 }}>
					<DeviceStatusPanel />
				</View>

				{/* Fatigue Panel */}
				<View style={{ marginBottom: 10 }}>
					<FatiguePanel />
				</View>

				{/* Footer 
				<View style={{ margin: 10, borderColor: theme.colors.dgrey, borderTopWidth: 1, paddingTop: 10, }} >
					<Text style={[theme.textStyles.body, { color: 'white' }]}>email: {user?.email ?? 'Anonymous'}</Text>
					<Text style={[theme.textStyles.body, { color: 'white' }]}>UID: {user?.uid}</Text>
					<View style={{ height: 8 }} />
				</View> */}
			</ScrollView>

	);
}

function Placeholder() {
	return (
		<View
			style={{
				//flex: 0.48,
				width: '45%',
				borderStyle: 'dashed',
				borderColor: 'white',
				borderWidth: 1,
				//backgroundColor: 'rgba(90, 200, 250, 0.6)',
				height: 175,
				marginHorizontal: 5,
				borderRadius: 8,
			}}
		/>
	);
}
