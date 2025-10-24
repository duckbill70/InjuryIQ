import React from 'react';
import { View, ScrollView } from 'react-native';
//import { SafeAreaView } from 'react-native-safe-area-context';
//import { BluetoothSearchingIcon, Bluetooth, LogOut, CassetteTape } from 'lucide-react-native';

//import { useNavigation } from '@react-navigation/native';
//import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
//import { RootStackParamList } from './AppNavigator';

//type HomeNav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

//import { useAuth } from '../auth/AuthProvider';
//import { useBle } from '../ble/BleProvider';
import { useSession } from '../session/SessionProvider';
//import ImuDualControlBox from '../components/ImuDualControlBox';
import DeviceBox from '../components/DeviceBox';
import { useTheme } from '../theme/ThemeContext';

import SessionStatusPanel from '../components/SessionStatusPanel';
import DeviceStatusPanel from '../components/DeviceStatusPanel';
import DevicePowerPanel from '../components/DevicePowerPanel';
//import SportStatusPanel from '../components/SportStatusPanel';
import FatiguePanel from '../components/FatiguePanel';
import { StepCountDisplay } from '../components/StepCountDisplay';

export default function HomeScreen() {
	//const { user, signOut } = useAuth();
	//const navigation = useNavigation<HomeNav>();
	const { theme } = useTheme();
	//const { scanning, startScan, isPoweredOn } = useBle();
	const { entryA, entryB } = useSession();

	//<ImageBackground source={require('../../assets/padel-tennis-2.png')} style={{ ...StyleSheet.absoluteFillObject }} imageStyle={{ resizeMode: 'cover' }}>{content}</ImageBackground>

	return (
		
			<ScrollView style={{ flex: 1, paddingVertical: 60, paddingHorizontal: 10, backgroundColor: theme?.colors?.teal }}>
				{/* Session Manager */}
				<View style={{ marginBottom: 10 }}>
					<SessionStatusPanel />
				</View>

				{/* Device Boxes */}

				<View style={{ marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
					<DeviceBox key={entryA?.id || 'placeholder-a'} item={entryA} placeholder={!entryA} />
					<DeviceBox key={entryB?.id || 'placeholder-b'} item={entryB} placeholder={!entryB} />
				</View>

				{/* Status Manager */}
				<View style={{ marginBottom: 10 }}>
					<DevicePowerPanel />
				</View>

				{/* Status Manager */}
				<View style={{ marginBottom: 10 }}>
					<DeviceStatusPanel />
				</View>

				{/* Fatigue Panel */}
				<View style={{ marginBottom: 10 }}>
					<FatiguePanel />
				</View>
				
				{/* Step Panel */}
				<View style={{ marginBottom: 10 }}>
					<StepCountDisplay />
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
