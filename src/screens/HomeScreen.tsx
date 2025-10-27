import React from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';


export default function HomeScreen() {
	//const { user, signOut } = useAuth();
	//const navigation = useNavigation<HomeNav>();
	const { theme } = useTheme();
	//const { scanning, startScan, isPoweredOn } = useBle();

	//<ImageBackground source={require('../../assets/padel-tennis-2.png')} style={{ ...StyleSheet.absoluteFillObject }} imageStyle={{ resizeMode: 'cover' }}>{content}</ImageBackground>

	return (
		
			<ScrollView style={{ flex: 1, paddingVertical: 60, paddingHorizontal: 10, backgroundColor: theme?.colors?.teal }}>
				{/* Session Manager */}
				<View style={{ marginBottom: 10 }}>
					
					<Text>TBC</Text>
				</View>

				{/* Footer */}
				<View style={{ marginBottom: 100 }}>
					<Text>TBC</Text>
				</View>
				
			</ScrollView>

	);
}
