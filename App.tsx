import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { ThemeProvider } from './src/theme/ThemeContext';
import { BleProvider } from './src/ble/BleProvider';

import { checkFirebaseInit } from './src/firebase/checkFirebaseInit';

import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';

function Gate() {
	const { user, loading } = useAuth();
	if (loading) {
		return (
			<View style={{ flex: 1, justifyContent: 'center' }}>
				<ActivityIndicator />
			</View>
		);
	}
	return user ? <HomeScreen /> : <AuthScreen />;
}

export default function App() {
	useEffect(() => {
		if (__DEV__) {
			const app = checkFirebaseInit();
			if (!app)
				throw new Error(
					'Firebase defauly app missing - check GoogleService-Info.plist?',
				);
		}
	}, []);

	return (
		<AuthProvider>
			<ThemeProvider>
				<BleProvider>
					<SafeAreaProvider>
						<Gate />
					</SafeAreaProvider>
				</BleProvider>
			</ThemeProvider>
		</AuthProvider>
	);
}
