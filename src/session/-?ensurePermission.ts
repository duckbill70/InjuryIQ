// ensurePermission.ts
import { Platform } from 'react-native';
import {
  check,
  request,
  RESULTS,
  PERMISSIONS,
  openSettings,
} from 'react-native-permissions';
import type { CombinedWriter, GpsFix } from '../imu/combinedImuWriter';

// Decide whether you want to upgrade to ALWAYS on iOS
const WANT_BACKGROUND_GPS = true;

const IOS_WHEN = PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
const IOS_ALWAYS = PERMISSIONS.IOS.LOCATION_ALWAYS;
const ANDROID_FINE = PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

/**
 * Ensures location permission is granted on iOS/Android.
 * Logs everything, and writes debug into the writer if provided.
 */
export async function ensurePermission(
  writer?: CombinedWriter | null,
): Promise<boolean> {
  try {
    console.log('[gps] ensurePermission start platform=', Platform.OS);

    if (Platform.OS === 'ios') {
      // Step 1: WHEN_IN_USE
      const whenStatus = await check(IOS_WHEN);
      console.log('[gps] check WHEN_IN_USE ->', whenStatus);

      let whenGranted =
        whenStatus === RESULTS.GRANTED || whenStatus === RESULTS.LIMITED;
      if (!whenGranted) {
        const reqWhen = await request(IOS_WHEN);
        console.log('[gps] request WHEN_IN_USE ->', reqWhen);
        whenGranted = reqWhen === RESULTS.GRANTED || reqWhen === RESULTS.LIMITED;
      }

      if (!whenGranted) {
        writer?.setGps?.(null, `perm_denied_when:${whenStatus}`);
        if (whenStatus === RESULTS.BLOCKED) openSettings().catch(() => {});
        return false;
      }

      // Step 2: upgrade to ALWAYS if needed
      if (WANT_BACKGROUND_GPS) {
        const alwaysStatus = await check(IOS_ALWAYS);
        console.log('[gps] check ALWAYS ->', alwaysStatus);
        if (alwaysStatus !== RESULTS.GRANTED) {
          const reqAlways = await request(IOS_ALWAYS);
          console.log('[gps] request ALWAYS ->', reqAlways);
          if (reqAlways !== RESULTS.GRANTED) {
            writer?.setGps?.(null, `perm_denied_always:${reqAlways}`);
            if (reqAlways === RESULTS.BLOCKED) openSettings().catch(() => {});
            // foreground still works because WHEN_IN_USE is granted
            return true;
          }
        }
      }
      return true;
    }

    // ANDROID
    const st = await check(ANDROID_FINE);
    console.log('[gps] check ANDROID FINE ->', st);
    if (st === RESULTS.GRANTED) return true;

    const req = await request(ANDROID_FINE);
    console.log('[gps] request ANDROID FINE ->', req);
    return req === RESULTS.GRANTED;
  } catch (e: any) {
    console.warn('[gps] ensurePermission error', e);
    writer?.setGps?.(null, `perm_error:${String(e?.message ?? e)}`);
    return false;
  }
}
