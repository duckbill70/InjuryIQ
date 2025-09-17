import React from 'react';
import { ImageBackground, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './HomeScreen';
import RecordingsScreen from './RecordingsScreen';
import { Color } from 'react-native/types_generated/Libraries/Animated/AnimatedExports';

export type RootStackParamList = {
	Home: undefined;
	Recordings: { someParam?: string }; // optional params
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
    
	return (
		
			<SafeAreaProvider style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top', 'bottom', 'left', 'right']}>
				<NavigationContainer>
					<Stack.Navigator
						initialRouteName='Home'
						screenOptions={{
							headerStyle: {
								//backgroundColor: 'black'
								//backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                //backgroundColor: 'transparent'
							},
							//headerTintColor: 'transparent',
							//contentStyle: {
							//	paddingTop: 0,
							//},
                            headerShown: false,
							headerTransparent: true,
                            contentStyle: {
                                //backgroundColor: 'transparent'
                            }
						}}
					>
						<Stack.Screen name='Home' component={HomeScreen} />
						<Stack.Screen name='Recordings' component={RecordingsScreen} />
					</Stack.Navigator>
				</NavigationContainer>
			</SafeAreaProvider>

	);
}
