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

	return (
		<ImageBackground source={require('../../assets/padel-tennis-2.png')} style={{ ...StyleSheet.absoluteFillObject }} imageStyle={{ resizeMode: 'cover' }}>
			<ScrollView style={{ flex: 1, paddingVertical: 60, paddingHorizontal: 6 }}>
				{/* Header */}
				<View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 }}>
					{/* Scan Button */}
					<TouchableOpacity onPress={() => startScan({ timeoutMs: 1500, maxDevices: 2 })} style={[theme.viewStyles.button, { backgroundColor: scanning ? 'grey' : theme.colors.primary, margin: 10 }]} disabled={scanning || !isPoweredOn}>
						{scanning ? <BluetoothSearchingIcon size={24} color='white' /> : <Bluetooth size={24} color='white' />}
					</TouchableOpacity>

					{/* Session Recordings */}
					<TouchableOpacity onPress={() => navigation.navigate('Recordings', { someParam: 'hello' })} style={[theme.viewStyles.button, { margin: 10, backgroundColor: theme?.colors?.danger }]}>
						<CassetteTape size={24} color='white' />
					</TouchableOpacity>

					{/* Sign Out */}
					<TouchableOpacity onPress={() => signOut()} style={[theme.viewStyles.button, { margin: 10 }]}>
						<LogOut size={24} color='white' />
					</TouchableOpacity>
				</View>

				{/* Device Boxes */}
				<View style={{ padding: 8 }}>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8, }} >
						{entryA ? <DeviceBox key={entryA.id} item={entryA} /> : <Placeholder />}
						{entryB ? <DeviceBox key={entryB.id} item={entryB} /> : <Placeholder />}
					</View>
				</View>

				{/* Session Manager */}
				<View style={{ padding: 8, marginHorizontal: 10 }}>
					<SessionStatusPanel />
				</View>

				{/* Sport Manager */}
				<View style={{ padding: 8, marginHorizontal: 10 }}>
					<SportStatusPanel />
				</View>

				{/* Status Manager */}
				<View style={{ padding: 8, marginHorizontal: 10 }}>
					<DeviceStatusPanel />
				</View>

				{/* Fatigue Panel */}
				<View style={{ padding: 8, marginHorizontal: 10 }}>
					<FatiguePanel />
				</View>
				

				{/* Control Box 
				<View style={{ padding: 8 }}>
					<ImuDualControlBox writerRef={writerRef} expectedHz={expectedHz} />
				</View>
				*/}

				

				{/* Footer 
				<View style={{ margin: 10, borderColor: theme.colors.dgrey, borderTopWidth: 1, paddingTop: 10, }} >
					<Text style={[theme.textStyles.body, { color: 'white' }]}>email: {user?.email ?? 'Anonymous'}</Text>
					<Text style={[theme.textStyles.body, { color: 'white' }]}>UID: {user?.uid}</Text>
					<View style={{ height: 8 }} />
				</View> */}
			</ScrollView>
		</ImageBackground>
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
