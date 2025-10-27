//
import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
// import { AppState } from 'react-native';
import RNFS from 'react-native-fs';
import Geolocation from 'react-native-geolocation-service';


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
  devices: DeviceInfo[];
  locations: LocationInfo[];
  sport: string;
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
  type: 'gps' | 'steps' | 'fatigue' | 'pause' | 'resume';
  data: unknown;
}

interface SessionContextType {
  isActive: boolean;
  isPaused: boolean;
  startSession: (header: SessionHeader) => void;
  stopSession: (footer?: SessionFooter) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  logStep: (stepData: unknown) => void;
  logFatigue: (fatigueData: unknown) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
};

const SESSION_LOG_INTERVAL = 1000; // ms

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isActiveRef = useRef(isActive);
  const isPausedRef = useRef(isPaused);
  const sessionFile = useRef<string | null>(null);
  // Use number for setInterval in React Native
  const gpsInterval = useRef<number | null>(null);

  // Remove unused header/footer state

  // Keep refs in sync with state
  React.useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  React.useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  // Log entry (useCallback for stable reference)
  const logEntry = useCallback((entry: SessionEntry) => {
    if (sessionFile.current && isActiveRef.current && !isPausedRef.current) {
      RNFS.appendFile(sessionFile.current, JSON.stringify(entry) + '\n', 'utf8');
      //if (__DEV__) console.log (`[logEntry] : `, JSON.stringify(entry, null, 2))
      if (__DEV__) console.log (`[logEntry] : of type (${entry.type}) -`, entry.data)
    }
  }, []);

  // Start session
  const startSession = useCallback((headerData: SessionHeader) => {
    const filename = `${RNFS.DocumentDirectoryPath}/session_${Date.now()}.jsonl`;
    sessionFile.current = filename;
    setIsActive(true);
    setIsPaused(false);
    // Write header
    RNFS.writeFile(filename, JSON.stringify({ type: 'header', ...headerData }) + '\n', 'utf8');
    // Start GPS logging
    gpsInterval.current = setInterval(() => {
      if (!isPaused) {
        Geolocation.getCurrentPosition(
          pos => {
            logEntry({
              timestamp: new Date().toISOString(),
              type: 'gps',
              data: pos.coords,
            });
          },
          error => {
            // Handle error (log or ignore)
            console.warn('GPS error:', error);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
        );
      }
    }, SESSION_LOG_INTERVAL) as unknown as number;
  }, [isPaused, logEntry]);

  // Stop session
  const stopSession = useCallback((footerData?: SessionFooter) => {
    setIsActive(false);
    setIsPaused(false);
    if (gpsInterval.current) {
      clearInterval(gpsInterval.current);
      gpsInterval.current = null;
    }
    if (sessionFile.current) {
      const stopData = footerData || { stoppedAt: new Date().toISOString(), duration: 0, stats: {} };
      RNFS.appendFile(sessionFile.current, JSON.stringify({ type: 'footer', ...stopData }) + '\n', 'utf8');
    }
  }, []);

  // Pause session
  const pauseSession = useCallback(() => {
    setIsPaused(true);
    logEntry({ timestamp: new Date().toISOString(), type: 'pause', data: null });
  }, [logEntry]);

  // Resume session
  const resumeSession = useCallback(() => {
    setIsPaused(false);
    logEntry({ timestamp: new Date().toISOString(), type: 'resume', data: null });
  }, [logEntry]);



  // Log steps
  const logStep = useCallback((stepData: unknown) => {
    logEntry({ timestamp: new Date().toISOString(), type: 'steps', data: stepData });
  }, [logEntry]);

  // Log fatigue
  const logFatigue = useCallback((fatigueData: unknown) => {
    logEntry({ timestamp: new Date().toISOString(), type: 'fatigue', data: fatigueData });
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

  return (
    <SessionContext.Provider value={{ isActive, isPaused, startSession, stopSession, pauseSession, resumeSession, logStep, logFatigue }}>
      {children}
    </SessionContext.Provider>
  );
};
