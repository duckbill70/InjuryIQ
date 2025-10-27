// gpsPermission.ts
import Geolocation from 'react-native-geolocation-service';

export async function ensureGpsAuthorization(
  mode: 'whenInUse' | 'always' = 'whenInUse',
): Promise<boolean> {
  try {
    const res = await Geolocation.requestAuthorization(mode);
    // iOS returns: 'granted' | 'denied' | 'disabled' | 'restricted'
    // Note: 'authorizedAlways' and 'authorizedWhenInUse' are legacy values not in current types
    console.log('[gps] RNGLS requestAuthorization ->', res);
    if (res === 'granted') {
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[gps] requestAuthorization error', e);
    return false;
  }
}
