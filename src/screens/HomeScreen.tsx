import React from 'react';
import { View, ScrollView } from 'react-native';

import { useTheme } from '../theme/ThemeContext';


import { SessionControlPanel, ControlServicePanel } from '../components';
import TrainingSessionPanel from '../components/TrainingSessionPanel';


export default function HomeScreen() {
	//const { user, signOut } = useAuth();
	//const navigation = useNavigation<HomeNav>();
	const { theme } = useTheme();
	//const { scanning, startScan, isPoweredOn } = useBle();

	//<ImageBackground source={require('../../assets/padel-tennis-2.png')} style={{ ...StyleSheet.absoluteFillObject }} imageStyle={{ resizeMode: 'cover' }}>{content}</ImageBackground>

	return (
		
			<ScrollView style={{ flex: 1, paddingVertical: 60, paddingHorizontal: 10, backgroundColor: theme?.colors?.teal }}>

				{/* Session Control Panel */}
				<View style={{ marginBottom: 20 }}>
					<SessionControlPanel />
				</View>

				{/* Training Session Panel */}
				<View style={{ marginBottom: 1000 }}>
					<TrainingSessionPanel />
				</View>

				{/* Control Service Panel 
				<View style={{ marginBottom: 100 }}>
					<ControlServicePanel />
				</View> */}
				
			</ScrollView>

	);
}
