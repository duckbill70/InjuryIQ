// gpsPermission.ts
import Geolocation from 'react-native-geolocation-service';

export async function ensureGpsAuthorization(
  mode: 'whenInUse' | 'always' = 'whenInUse',
): Promise<boolean> {
  try {
    const res = await Geolocation.requestAuthorization(mode);
    // iOS returns: 'granted' | 'denied' | 'disabled' | 'restricted' | 'authorizedAlways' | 'authorizedWhenInUse' (older)
    console.log('[gps] RNGLS requestAuthorization ->', res);
    if (res === 'granted' || res === 'authorizedAlways' || res === 'authorizedWhenInUse') {
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[gps] requestAuthorization error', e);
    return false;
  }
}
