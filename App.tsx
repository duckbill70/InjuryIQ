import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { ThemeProvider } from './src/theme/ThemeContext';
import { BleProvider } from './src/ble/BleProvider';
import { SessionProvider } from './src/session/SessionProvider';

import { checkFirebaseInit } from './src/firebase/checkFirebaseInit';

import { useNotify } from './src/notify/useNotify';

import AppNavigator from './src/screens/AppNavigator';

import AuthScreen from './src/screens/AuthScreen';
//import HomeScreen from './src/screens/HomeScreen';

function Gate() {
	const { user, loading } = useAuth();
	if (loading) {
		return (
			<View style={{ flex: 1, justifyContent: 'center' }}>
				<ActivityIndicator />
			</View>
		);
	}
	return user ? <AppNavigator /> : <AuthScreen />;
}

export default function App() {

	const { ensurePermission} = useNotify({requestOnMount: false})
	useEffect(() => { ensurePermission(false); }, [ensurePermission]);

	useEffect(() => {
		if (__DEV__) {
			const app = checkFirebaseInit();
			if (!app) throw new Error('Firebase defauly app missing - check GoogleService-Info.plist?');
		}
	}, []);

	return (
		<AuthProvider>
			<ThemeProvider>
				<BleProvider>
					<SessionProvider>
						<SafeAreaProvider>
							<PaperProvider>
								<Gate />
							</PaperProvider>
						</SafeAreaProvider>
					</SessionProvider>
				</BleProvider>
			</ThemeProvider>
		</AuthProvider>
	);
}
