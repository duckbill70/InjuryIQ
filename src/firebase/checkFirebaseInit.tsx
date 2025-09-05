import { getApps, getApp } from '@react-native-firebase/app';

export function checkFirebaseInit() {
  const apps = getApps();
  if (apps.length === 0) {
    console.warn('No Firebase apps have been initialized!');
    return null;
  }

  const defaultApp = getApp(); // should be "[DEFAULT]"
  console.log('Firebase default app initialized:', defaultApp.name);
  console.log('Config options:', defaultApp.options); // shows plist values
  return defaultApp;
}