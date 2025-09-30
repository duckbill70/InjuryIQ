import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { House, List, User } from 'lucide-react-native';

import HomeScreen from './HomeScreen';
import RecordingsScreen from './RecordingsScreen';
import SettingsScreen from './SettingsScreen';

export type RootStackParamList = {
	Home: undefined;
	Recordings: { someParam?: string }; // optional params
	Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function HomeStack() {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name='Home' component={HomeScreen} />
			{/* Add more screens for Home tab here */}
		</Stack.Navigator>
	);
}
function HomeTabIcon({ color, size }) {
	return <House size={size} color={color} />;
}

function RecordingsStack() {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name='Recordings' component={RecordingsScreen} />
			{/* Add more screens for Recordings tab here */}
		</Stack.Navigator>
	);
}
function RecordingTabIcon({ color, size }) {
	return <List size={size} color={color} />;
}

function SettingsStack() {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name='Settings' component={SettingsScreen} />
			{/* Add more screens for Recordings tab here */}
		</Stack.Navigator>
	);
}
function SettingsTabIcon({ color, size }) {
	return <User size={size} color={color} />;
}

export default function AppNavigator() {
	/*
<Tab.Screen
  name="Main"
  component={MainStack}
  options={{
    tabBarIcon: ({ color, size }) => <Bluetooth size={size} color={color} />,
    title: 'Home',
  }}
/>
*/

	return (
		<NavigationContainer>
			<Tab.Navigator
				screenOptions={{
					headerShown: false,
					tabBarActiveTintColor: 'white',//'#007AFF', // Active icon color
					tabBarInactiveTintColor: '#888', // Inactive icon color
					tabBarStyle: {
						backgroundColor: 'rgba(0,0,0,0.8)', // semi-transparent black
						position: 'absolute', // optional: for floating effect
						borderTopWidth: 0, // optional: remove border
						// You can add more styles here
					},
				}}
			>
				<Tab.Screen
					name='Main'
					component={HomeStack}
					options={{
						title: 'Home',
						tabBarIcon: HomeTabIcon,
					}}
				/>
				<Tab.Screen 
					name='Recordings'
					component={RecordingsStack}
					options={{ 
						title: 'Recordings',
						tabBarIcon: RecordingTabIcon,
					}}
				/>
				<Tab.Screen 
					name='Settings'
					component={SettingsStack}
					options={{ 
						title: 'Settings',
						tabBarIcon: SettingsTabIcon,
					}}
				/>
				{/* Add more tabs/screens here if needed */}
			</Tab.Navigator>
		</NavigationContainer>
	);
}
