import React from 'react';
import { View, ScrollView } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

import { BleControlPanel, SessionControlPanel, ControlServicePanel, DiagnosticsPanel } from '../components';


export default function HomeScreen() {
	//const { user, signOut } = useAuth();
	//const navigation = useNavigation<HomeNav>();
	const { theme } = useTheme();
	//const { scanning, startScan, isPoweredOn } = useBle();

	//<ImageBackground source={require('../../assets/padel-tennis-2.png')} style={{ ...StyleSheet.absoluteFillObject }} imageStyle={{ resizeMode: 'cover' }}>{content}</ImageBackground>

	return (
		
			<ScrollView style={{ flex: 1, paddingVertical: 60, paddingHorizontal: 10, backgroundColor: theme?.colors?.teal }}>

				{/* Session Control Panel */}
				<View style={{ marginBottom: 10 }}>
					<SessionControlPanel />
				</View>

				

				{/* Device Settings Panel 
				<View style={{ marginBottom: 10 }}>
					<DeviceSettingsPanel />
				</View> */}

				{/* Device Settings Panel */}
				<View style={{ marginBottom: 10 }}>
					<ControlServicePanel />
				</View>

				{/* Device Diagnostics */}
				<View style={{ marginBottom: 10 }}>
					<DiagnosticsPanel />
				</View>

				{/* BLE Control Panel */}
				<View style={{ marginBottom: 100 }}>
					<BleControlPanel />
				</View>
				
			</ScrollView>

	);
}
