//
// SessionProvider: Manages recording sessions with automatic metadata enrichment
//
// USAGE:
// 1. Wrap your app with <SessionProvider>
// 2. Use useSession() hook to access session controls
// 3. Call startSession({ sport: 'tennis' }) - devices are auto-populated
// 4. Use pauseSession() / resumeSession() to pause/resume recording
// 5. Call stopSession() to end - duration and stats are automatically calculated
//
// AUTOMATIC ENRICHMENT:
// - Header.devices: Populated from connected BLE devices (id, name, position)
// - Footer.stats: GPS distance/speed, step counts, fatigue events, pause tracking
// - BLE Events: Automatically subscribes to step counter and fatigue monitoring
//
// SESSION FILE FORMAT (.jsonl):
// Line 1: { type: 'header', startedAt, devices, sport }
// Lines 2-N: { timestamp, type: 'gps'|'steps'|'fatigue'|'pause'|'resume', data, position? }
// Last line: { type: 'footer', stoppedAt, duration, stats }
//
import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
// import { AppState } from 'react-native';
import RNFS from 'react-native-fs';
import Geolocation from 'react-native-geolocation-service';
import { useBle } from '../ble/BleProvider';
import { useStepCounter } from '../ble/useStepCounter';
import { useFatigue } from '../ble/useFatigue';
import { ControlState } from '../ble/useControl';
import { DeviceController } from './DeviceController';

// Supported sports
export type Sport = 'tennis' | 'running' | 'hiking' | 'padel';

export interface DeviceInfo {
  id: string;
  name?: string;
  position?: string;
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  [key: string]: unknown;
}

export interface SessionHeader {
  startedAt: string;
  devices?: DeviceInfo[];  // Optional: auto-populated from BLE if not provided
  sport: Sport;
}

export interface SessionStats {
  [key: string]: unknown;
}

export interface SessionFooter {
  stoppedAt: string;
  duration: number;
  stats: SessionStats;
}

export interface SessionEntry {
  timestamp: string;
  type: 'gps' | 'steps' | 'fatigue' | 'pause' | 'resume' | 'device_state_error' | 'device_disconnect' | 'device_reconnect';
  data: unknown;
  position?: string;
  deviceId?: string;
}

interface SessionContextType {
  isActive: boolean;
  isPaused: boolean;
  startSession: (header: SessionHeader) => void;
  stopSession: (footer?: SessionFooter) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  logStep: (stepData: unknown, position?: string) => void;
  logFatigue: (fatigueData: unknown, position?: string) => void;
  logDeviceStateError: (deviceId: string, expectedState: string, actualState: string, position?: string) => void;
  logDeviceDisconnect: (deviceId: string, position?: string) => void;
  logDeviceReconnect: (deviceId: string, position?: string) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
};

// GPS polling intervals by sport type (ms)
const GPS_INTERVALS = {
  running: 2000,    // 2 seconds - higher frequency for running
  tennis: 3000,     // 3 seconds - moderate frequency for tennis
  padel: 3000,      // 3 seconds - moderate frequency for padel
  hiking: 5000,     // 5 seconds - lower frequency for hiking
} as const;

// Minimum distance in meters to log GPS point (helps reduce redundant points when stationary)
const MIN_DISTANCE_METERS = 2;

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [deviceTargetState, setDeviceTargetState] = useState<ControlState | null>(null);
  const [currentSport, setCurrentSport] = useState<Sport>('hiking');
  const isActiveRef = useRef(isActive);
  const isPausedRef = useRef(isPaused);
  const sessionFile = useRef<string | null>(null);
  const sessionStartTime = useRef<number | null>(null);
  // Use number for setInterval in React Native
  const gpsInterval = useRef<number | null>(null);
  const pauseStartRef = useRef<number | null>(null);
  const lastGpsPositionRef = useRef<{ lat: number; lon: number } | null>(null);

  // BLE context for devices
  const { connected, setConnectionCallbacks } = useBle();

  // Stats accumulator
  const statsRef = useRef({
    gpsPointCount: 0,
    lastLat: null as number | null,
    lastLon: null as number | null,
    distanceMeters: 0,
    maxSpeedMps: null as number | null,
    minAccuracyM: null as number | null,
    maxAccuracyM: null as number | null,
    stepsTotal: 0,
    stepsLeft: 0,
    stepsRight: 0,
    fatigueEvents: 0,
    pausedCount: 0,
    pausedTotalSec: 0,
  });

  // Remove unused header/footer state

  // Keep refs in sync with state
  React.useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  React.useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  // Haversine distance in meters
  const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Log entry (useCallback for stable reference)
  const logEntry = useCallback((entry: SessionEntry) => {
    if (sessionFile.current && isActiveRef.current && !isPausedRef.current) {
      // Update stats
      if (entry.type === 'gps') {
  const coords = entry.data as Partial<{ latitude: number; longitude: number; accuracy: number; speed: number }>;
        const lat = coords?.latitude;
        const lon = coords?.longitude;
        const acc = coords?.accuracy;
        const spd = typeof coords?.speed === 'number' ? coords.speed : null;
        if (typeof lat === 'number' && typeof lon === 'number') {
          if (statsRef.current.lastLat != null && statsRef.current.lastLon != null) {
            statsRef.current.distanceMeters += haversineMeters(statsRef.current.lastLat, statsRef.current.lastLon, lat, lon);
          }
          statsRef.current.lastLat = lat;
          statsRef.current.lastLon = lon;
          statsRef.current.gpsPointCount += 1;
        }
        if (typeof acc === 'number') {
          statsRef.current.minAccuracyM = statsRef.current.minAccuracyM == null ? acc : Math.min(statsRef.current.minAccuracyM, acc);
          statsRef.current.maxAccuracyM = statsRef.current.maxAccuracyM == null ? acc : Math.max(statsRef.current.maxAccuracyM, acc);
        }
        if (spd != null && spd >= 0) {
          statsRef.current.maxSpeedMps = statsRef.current.maxSpeedMps == null ? spd : Math.max(statsRef.current.maxSpeedMps, spd);
        }
      } else if (entry.type === 'steps') {
        statsRef.current.stepsTotal += 1;
        if (entry.position === 'leftFoot') statsRef.current.stepsLeft += 1;
        if (entry.position === 'rightFoot') statsRef.current.stepsRight += 1;
      } else if (entry.type === 'fatigue') {
        statsRef.current.fatigueEvents += 1;
      }

      RNFS.appendFile(sessionFile.current, JSON.stringify(entry) + '\n', 'utf8');
      if (__DEV__) console.log (`[logEntry] : type [${entry.type}] & position [${entry.position}]  -`, entry.data)
    }
  }, []);

  // Start session
  const startSession = useCallback((headerData: SessionHeader) => {
    const filename = `${RNFS.DocumentDirectoryPath}/session_${Date.now()}.jsonl`;
    sessionFile.current = filename;
    sessionStartTime.current = Date.now();
    setIsActive(true);
    setIsPaused(false);
    setCurrentSport(headerData.sport || 'hiking');
    setDeviceTargetState(ControlState.RUNNING); // Signal devices to go to RUN state

    // Reset stats
    statsRef.current = {
      gpsPointCount: 0,
      lastLat: null,
      lastLon: null,
      distanceMeters: 0,
      maxSpeedMps: null,
      minAccuracyM: null,
      maxAccuracyM: null,
      stepsTotal: 0,
      stepsLeft: 0,
      stepsRight: 0,
      fatigueEvents: 0,
      pausedCount: 0,
      pausedTotalSec: 0,
    };
    pauseStartRef.current = null;
    lastGpsPositionRef.current = null;

    // Build devices from BLE (unless provided in headerData)
    const devices = headerData.devices ?? Object.values(connected).map(d => ({
      id: d.id,
      name: d.name || undefined,
      position: d.position,
    }));

    // Write header after enriching with devices
    (async () => {
      const startedAt = headerData.startedAt || new Date().toISOString();

      const header: SessionHeader = {
        startedAt,
        devices,
        sport: headerData.sport || 'hiking',
      };

      await RNFS.writeFile(filename, JSON.stringify({ type: 'header', ...header }) + '\n', 'utf8');

      // Start GPS logging after header is written
      // Use sport-specific interval for optimal battery/accuracy tradeoff
      const gpsUpdateInterval = GPS_INTERVALS[headerData.sport || 'hiking'];
      
      gpsInterval.current = setInterval(() => {
        if (!isPausedRef.current) {
          Geolocation.getCurrentPosition(
            pos => {
              const coords = (pos as unknown as { coords: Partial<{ latitude: number; longitude: number; altitude: number; accuracy: number; speed: number }> }).coords;
              const lat = coords.latitude;
              const lon = coords.longitude;
              
              // Distance-based filtering: only log if moved significantly or first point
              let shouldLog = true;
              if (lat !== undefined && lon !== undefined && lastGpsPositionRef.current) {
                const distance = haversineMeters(
                  lastGpsPositionRef.current.lat,
                  lastGpsPositionRef.current.lon,
                  lat,
                  lon
                );
                shouldLog = distance >= MIN_DISTANCE_METERS;
              }
              
              if (shouldLog) {
                if (lat !== undefined && lon !== undefined) {
                  lastGpsPositionRef.current = { lat, lon };
                }
                logEntry({
                  timestamp: new Date().toISOString(),
                  type: 'gps',
                  data: coords,
                });
              }
            },
            error => {
              // Handle error (log or ignore)
              console.warn('GPS error:', error);
            },
            { 
              enableHighAccuracy: true, 
              timeout: 5000,        // Reduced from 10s to 5s
              maximumAge: 2000,     // Increased from 1s to 2s for better caching
              distanceFilter: 1     // Native distance filter (meters) for additional efficiency
            }
          );
        }
      }, gpsUpdateInterval) as unknown as number;
    })();
  }, [connected, logEntry, haversineMeters]);

  // Stop session
  const stopSession = useCallback((footerData?: SessionFooter) => {
    setDeviceTargetState(ControlState.STOPPED); // Signal devices to go to STOP state
    setIsActive(false);
    setIsPaused(false);
    if (gpsInterval.current) {
      clearInterval(gpsInterval.current);
      gpsInterval.current = null;
    }
    if (sessionFile.current) {
      // Calculate duration in seconds
      const duration = sessionStartTime.current 
        ? Math.floor((Date.now() - sessionStartTime.current) / 1000)
        : 0;
      // If paused when stopping, fold in the pending paused time
      if (pauseStartRef.current != null) {
        const extra = Math.floor((Date.now() - pauseStartRef.current) / 1000);
        statsRef.current.pausedTotalSec += extra;
        statsRef.current.pausedCount += 1;
        pauseStartRef.current = null;
      }

      const activeDurationSec = Math.max(0, duration - statsRef.current.pausedTotalSec);
      const avgSpeedMps = activeDurationSec > 0 ? statsRef.current.distanceMeters / activeDurationSec : 0;

      const stats: SessionStats = {
        timing: {
          activeDurationSec,
          numPauses: statsRef.current.pausedCount,
          totalPausedSec: statsRef.current.pausedTotalSec,
        },
        gps: {
          gpsPointCount: statsRef.current.gpsPointCount,
          distanceMeters: Math.round(statsRef.current.distanceMeters),
          avgSpeedMps: Number(avgSpeedMps.toFixed(2)),
          maxSpeedMps: statsRef.current.maxSpeedMps ?? 0,
          minAccuracyM: statsRef.current.minAccuracyM ?? null,
          maxAccuracyM: statsRef.current.maxAccuracyM ?? null,
        },
        steps: {
          total: statsRef.current.stepsTotal,
          left: statsRef.current.stepsLeft,
          right: statsRef.current.stepsRight,
        },
        fatigue: {
          events: statsRef.current.fatigueEvents,
        },
      } as Record<string, unknown>;

      const stopData = footerData || { 
        stoppedAt: new Date().toISOString(), 
        duration, 
        stats 
      };
      RNFS.appendFile(sessionFile.current, JSON.stringify({ type: 'footer', ...stopData }) + '\n', 'utf8');
      sessionStartTime.current = null;
    }
    
    // Clear device target state after a delay to allow controllers to process
    setTimeout(() => setDeviceTargetState(null), 2000);
  }, []);

  // Pause session
  const pauseSession = useCallback(() => {
    setIsPaused(true);
    setDeviceTargetState(ControlState.STOPPED); // Stop devices when pausing
    if (pauseStartRef.current == null) pauseStartRef.current = Date.now();
    logEntry({ timestamp: new Date().toISOString(), type: 'pause', data: null });
  }, [logEntry]);

  // Resume session
  const resumeSession = useCallback(() => {
    setIsPaused(false);
    setDeviceTargetState(ControlState.RUNNING); // Start devices when resuming
    // Update ref immediately so logEntry will work
    isPausedRef.current = false;
    
    if (pauseStartRef.current != null) {
      const pausedSec = Math.floor((Date.now() - pauseStartRef.current) / 1000);
      statsRef.current.pausedTotalSec += pausedSec;
      statsRef.current.pausedCount += 1;
      pauseStartRef.current = null;
    }
    logEntry({ timestamp: new Date().toISOString(), type: 'resume', data: null });
  }, [logEntry]);



  // Log steps
  const logStep = useCallback((stepData: unknown, position?: string) => {
    logEntry({
      timestamp: new Date().toISOString(),
      type: 'steps',
      data: stepData,
      position,
    });
  }, [logEntry]);

  // Log fatigue
  const logFatigue = useCallback((fatigueData: unknown, position?: string) => {
    logEntry({
      timestamp: new Date().toISOString(),
      type: 'fatigue',
      data: fatigueData,
      position,
    });
  }, [logEntry]);

  // Log device state error
  const logDeviceStateError = useCallback((deviceId: string, expectedState: string, actualState: string, position?: string) => {
    logEntry({
      timestamp: new Date().toISOString(),
      type: 'device_state_error',
      data: { expectedState, actualState },
      position,
      deviceId,
    });
  }, [logEntry]);

  // Log device disconnect
  const logDeviceDisconnect = useCallback((deviceId: string, position?: string) => {
    logEntry({
      timestamp: new Date().toISOString(),
      type: 'device_disconnect',
      data: null,
      position,
      deviceId,
    });
  }, [logEntry]);

  // Log device reconnect
  const logDeviceReconnect = useCallback((deviceId: string, position?: string) => {
    logEntry({
      timestamp: new Date().toISOString(),
      type: 'device_reconnect',
      data: null,
      position,
      deviceId,
    });
  }, [logEntry]);

  // Clean up on unmount
  React.useEffect(() => {
    return () => {
      if (gpsInterval.current) {
        clearInterval(gpsInterval.current);
        gpsInterval.current = null;
      }
    };
  }, []);

  // Register connection event callbacks
  React.useEffect(() => {
    setConnectionCallbacks({
      onDisconnected: (deviceId, position) => {
        logDeviceDisconnect(deviceId, position);
      },
      onReconnected: (deviceId, position) => {
        logDeviceReconnect(deviceId, position);
      },
    });
  }, [logDeviceDisconnect, logDeviceReconnect, setConnectionCallbacks]);

  // Memoize device IDs to prevent unnecessary re-subscriptions
  const connectedDeviceIds = React.useMemo(() => Object.keys(connected), [connected]);

  return (
    <SessionContext.Provider value={{ 
      isActive, 
      isPaused, 
      startSession, 
      stopSession, 
      pauseSession, 
      resumeSession, 
      logStep, 
      logFatigue, 
      logDeviceStateError,
      logDeviceDisconnect,
      logDeviceReconnect,
    }}>
      {children}
      {/* Device controllers to manage device states */}
      {connectedDeviceIds.map(deviceId => (
        <DeviceController
          key={deviceId}
          deviceId={deviceId}
          targetState={deviceTargetState}
          position={connected[deviceId]?.position}
        />
      ))}
      {/* Subscribe to BLE events for each connected device when session is active */}
      {isActive && connectedDeviceIds.map(deviceId => (
        <BleDeviceSubscriber
          key={deviceId}
          deviceId={deviceId}
          enabled={isActive}
        />
      ))}
    </SessionContext.Provider>
  );
};

// Component to subscribe to BLE events for a single device
// Memoized to prevent unnecessary re-subscriptions when parent re-renders
const BleDeviceSubscriber: React.FC<{ deviceId: string; enabled: boolean }> = React.memo(({ deviceId, enabled }) => {
  // Subscribe to step counter (hook handles logging internally)
  useStepCounter({
    deviceId,
    enabled,
  });

  // Subscribe to fatigue (hook handles logging internally)
  useFatigue({
    deviceId,
    enabled,
  });

  return null;
}, (prevProps, nextProps) => {
  // Only re-render if deviceId or enabled state changes
  return prevProps.deviceId === nextProps.deviceId && prevProps.enabled === nextProps.enabled;
});

BleDeviceSubscriber.displayName = 'BleDeviceSubscriber';
