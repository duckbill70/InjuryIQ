import React from 'react';
import { View, Text } from 'react-native';
//import { RouteProp, useRoute } from '@react-navigation/native';
//import type { RootStackParamList } from './AppNavigator';

//import { useNavigation } from '@react-navigation/native';

//import { useAuth } from '../auth/AuthProvider';
//import { useTheme } from '../theme/ThemeContext';

import FileTable from '../file/FileTable';


//type Recordings = RouteProp<RootStackParamList, 'Recordings'>;

export default function RecordingsScreen() {
	//const route = useRoute<Recordings>();
	//const navigation = useNavigation();
	//const { user, signOut } = useAuth();
	//const { theme } = useTheme();

	return (

			<View style={{ flex: 1, paddingVertical: 60, backgroundColor: 'teal' }}>
				{/* <Text>Other screen!</Text>
				<Text>Param: {route.params?.someParam}</Text> */}

				{/* Header */}
				<View style={{ marginBottom: 10, paddingHorizontal: 10 }}>
					<Text>TBC</Text>
				</View>

				{/* File Content */}
				<FileTable />

				
			</View>

	);
}
