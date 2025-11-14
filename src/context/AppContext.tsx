import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { User, ChargingSession, SystemSettings } from '../types';
import { db } from '../services/database';
import { hardware } from '../services/hardware';

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  currentSession: ChargingSession | null;
  setCurrentSession: (session: ChargingSession | null) => void;
  settings: SystemSettings;
  updateSettings: (settings: Partial<SystemSettings>) => void;
  scanRfid: () => Promise<User | null>;
  batteryStatus: { percentage: number; voltage: number; current: number; power: number } | null;
  refreshBatteryStatus: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentSession, setCurrentSession] = useState<ChargingSession | null>(null);
  const [settings, setSettings] = useState<SystemSettings>(db.getSettings());
  const [batteryStatus, setBatteryStatus] = useState<{
    percentage: number;
    voltage: number;
    current: number;
    power: number;
  } | null>(null);

  const refreshBatteryStatus = useCallback(async () => {
    const status = await hardware.getBatteryStatus();
    setBatteryStatus(status);
  }, []);

  const stopCharging = useCallback((status: 'completed' | 'stopped') => {
    setCurrentSession((session) => {
      if (!session) return null;
      
      const endTime = new Date().toISOString();
      const updatedSession = {
        ...session,
        status,
        endTime,
        endBattery: batteryStatus?.percentage || null,
        energyDelivered: hardware.getEnergyDelivered(),
      };
      
      db.updateSession(session.id, updatedSession);
      hardware.stopCharging();
      
      // Keep session in state so component can navigate
      return updatedSession;
    });
  }, [batteryStatus]);

  useEffect(() => {
    // Load active session on mount
    const activeSession = db.getActiveSession();
    if (activeSession) {
      setCurrentSession(activeSession);
      const user = db.getUsers().find((u) => u.id === activeSession.userId);
      if (user) setCurrentUser(user);
    }

    // Load settings
    setSettings(db.getSettings());

    // Initial battery status
    refreshBatteryStatus();
  }, [refreshBatteryStatus]);

  // Update battery status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refreshBatteryStatus();
      if (currentSession?.status === 'in_progress') {
        hardware.simulateCharging();
        const energy = hardware.getEnergyDelivered();
        const battery = batteryStatus?.percentage || 0;
        
        db.updateSession(currentSession.id, {
          energyDelivered: energy,
          current: batteryStatus?.current || 0,
          voltage: batteryStatus?.voltage || 0,
          power: batteryStatus?.power || 0,
        });

        // Check stop conditions
        if (battery >= currentSession.targetBattery) {
          stopCharging('completed');
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentSession, batteryStatus, refreshBatteryStatus, stopCharging]);

  const scanRfid = useCallback(async (): Promise<User | null> => {
    const rfidCardId = await hardware.scanRfid();
    if (!rfidCardId) return null;
    
    const user = db.getUserByRfid(rfidCardId);
    if (user) {
      setCurrentUser(user);
      return user;
    }
    return null;
  }, []);

  const updateSettings = useCallback((newSettings: Partial<SystemSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      db.saveSettings(updated);
      return updated;
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        currentSession,
        setCurrentSession,
        settings,
        updateSettings,
        scanRfid,
        batteryStatus,
        refreshBatteryStatus,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

