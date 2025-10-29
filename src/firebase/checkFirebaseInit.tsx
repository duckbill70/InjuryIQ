import firebase from '@react-native-firebase/app';

export const checkFirebaseInit = () => {
	const defaultApp = firebase.app(); // should get [DEFAULT] app
	if (__DEV__) {
		console.log('Firebase default app initialized:', defaultApp.name);
		console.log('Config options:', defaultApp.options); // shows plist values
	}
	return defaultApp;
};
