// Hardware interface for Raspberry Pi integration
// Communicates with Python backend service for RFID and relay control

const API_BASE_URL = import.meta.env.VITE_RFID_API_URL || 'http://localhost:5000/api';

export interface BatteryStatus {
  percentage: number;
  voltage: number;
  current: number;
  power: number; // in W
}

export interface SensorData {
  voltage: number; // in V
  current: number; // in A
  power: number; // in W
}

interface ChargingStatus {
  isCharging: boolean;
  currentUser: {
    id: string;
    name: string;
    balance: number;
    rfidCardId: string;
  } | null;
  currentBalance: number;
  startTime: number | null;
}

export interface RfidEvent {
  type: 'rfid_detected' | 'charging_started' | 'charging_stopped' | 'insufficient_balance';
  rfidCardId?: string;
  timestamp: number;
  user?: {
    id: string;
    name: string;
    balance: number;
    rfidCardId: string;
    phoneNumber?: string;
    createdAt?: string;
  };
  success?: boolean;
  error?: string;
}

class HardwareService {
  private chargingActive = false;
  private currentBattery = 35; // Mock starting battery %
  private targetBattery = 0;
  private startTime = 0;
  private energyDelivered = 0; // in Wh
  private chargingStatus: ChargingStatus | null = null;
  private eventSource: EventSource | null = null;
  private rfidEventCallbacks: ((event: RfidEvent) => void)[] = [];

  // Check if Python backend is available
  private async checkBackendAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        console.log('[Hardware] Backend is available at', API_BASE_URL);
        return true;
      } else {
        console.warn('[Hardware] Backend health check failed:', response.status);
        return false;
      }
    } catch (error) {
      console.warn('[Hardware] Backend not available:', error instanceof Error ? error.message : 'Connection failed');
      console.warn('[Hardware] Attempted to connect to:', API_BASE_URL);
      console.warn('[Hardware] Make sure the backend is running: python3 backend/rfid_service.py');
      return false;
    }
  }

  // RFID reader - calls Python backend
  async scanRfid(): Promise<string | null> {
    const backendAvailable = await this.checkBackendAvailable();
    
    if (!backendAvailable) {
      // Fallback to mock mode
      console.warn('[Hardware] Python backend not available, using mock mode');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return 'RFID001';
    }

    try {
      const response = await fetch(`${API_BASE_URL}/rfid/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[Hardware] RFID scan error:', error);
        return null;
      }

      const data = await response.json();
      
      // Update charging status
      if (data.action === 'started') {
        this.chargingActive = true;
        this.startTime = Date.now();
      } else if (data.action === 'stopped') {
        this.chargingActive = false;
      }

      // Return RFID card ID
      return data.user?.rfidCardId || null;
    } catch (error) {
      console.error('[Hardware] RFID scan failed:', error);
      return null;
    }
  }

  // Get current charging status from backend
  async getChargingStatus(): Promise<ChargingStatus | null> {
    const backendAvailable = await this.checkBackendAvailable();
    if (!backendAvailable) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/charging/status`);
      if (response.ok) {
        this.chargingStatus = await response.json();
        this.chargingActive = this.chargingStatus?.isCharging ?? false;
        return this.chargingStatus;
      }
    } catch (error) {
      console.error('[Hardware] Failed to get charging status:', error);
    }
    return null;
  }

  // Mock BCU (Battery Control Unit)
  async getBatteryStatus(): Promise<BatteryStatus> {
    // Simulate reading from BCU
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    const voltage = 48 + Math.random() * 4; // 48-52V
    const current = this.chargingActive ? 40 + Math.random() * 10 : 0; // 40-50A when charging (increased from 10-15A)
    const power = voltage * current; // in W
    
    return {
      percentage: this.currentBattery,
      voltage: Math.round(voltage * 10) / 10,
      current: Math.round(current * 10) / 10,
      power: Math.round(power),
    };
  }

  // Mock sensor reading (INA219 or ACS712)
  async getSensorData(): Promise<SensorData> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    
    const voltage = 48 + Math.random() * 4;
    const current = this.chargingActive ? 40 + Math.random() * 10 : 0; // Increased from 10-15A to 40-50A
    const power = voltage * current;
    
    return {
      voltage: Math.round(voltage * 10) / 10,
      current: Math.round(current * 10) / 10,
      power: Math.round(power),
    };
  }

  // Relay/contactor control - calls Python backend
  async startCharging(targetBattery: number): Promise<boolean> {
    this.targetBattery = targetBattery;
    this.startTime = Date.now();
    this.energyDelivered = 0;

    const backendAvailable = await this.checkBackendAvailable();
    
    if (!backendAvailable) {
      // Fallback to mock mode
      this.chargingActive = true;
      console.log('[Hardware] Mock mode - Charging started - Relay ON');
      return true;
    }

    try {
      // Get current user from charging status
      const status = await this.getChargingStatus();
      if (!status?.currentUser) {
        console.error('[Hardware] No user found for charging');
        return false;
      }

      const response = await fetch(`${API_BASE_URL}/charging/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: status.currentUser.id }),
      });

      if (response.ok) {
        this.chargingActive = true;
        console.log('[Hardware] Charging started - Relay ON');
        return true;
      } else {
        const error = await response.json();
        console.error('[Hardware] Failed to start charging:', error);
        return false;
      }
    } catch (error) {
      console.error('[Hardware] Start charging failed:', error);
      return false;
    }
  }

  async stopCharging(): Promise<boolean> {
    const backendAvailable = await this.checkBackendAvailable();
    
    if (!backendAvailable) {
      // Fallback to mock mode
      this.chargingActive = false;
      console.log('[Hardware] Mock mode - Charging stopped - Relay OFF');
      return true;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/charging/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        this.chargingActive = false;
        console.log('[Hardware] Charging stopped - Relay OFF');
        return true;
      } else {
        const error = await response.json();
        console.error('[Hardware] Failed to stop charging:', error);
        return false;
      }
    } catch (error) {
      console.error('[Hardware] Stop charging failed:', error);
      return false;
    }
  }

  // Simulate charging progress
  simulateCharging(): void {
    if (!this.chargingActive) return;
    
    const elapsedHours = (Date.now() - this.startTime) / (1000 * 60 * 60);
    const powerW = 2000; // Increased charging power (was 500W)
    const energyWh = powerW * elapsedHours;
    
    this.energyDelivered = energyWh;
    
    // Calculate battery increase (simplified)
    const batteryIncrease = (energyWh / 5000) * 100; // Assuming 5kWh = 100%
    this.currentBattery = Math.min(
      this.currentBattery + batteryIncrease * 0.5, // Faster increase (was 0.1)
      this.targetBattery
    );
    
    // Auto-stop when target reached
    if (this.currentBattery >= this.targetBattery) {
      this.stopCharging();
    }
  }

  getEnergyDelivered(): number {
    return this.energyDelivered;
  }

  reset(): void {
    this.chargingActive = false;
    this.currentBattery = 35;
    this.targetBattery = 0;
    this.startTime = 0;
    this.energyDelivered = 0;
  }

  // For testing: set battery level
  setBatteryLevel(level: number): void {
    this.currentBattery = Math.max(0, Math.min(100, level));
  }

  // Real-time RFID event listening via Server-Sent Events
  startRfidEventStream(callback: (event: RfidEvent) => void): () => void {
    // Add callback to list
    this.rfidEventCallbacks.push(callback);

    // If event stream is already running, return cleanup function
    if (this.eventSource) {
      return () => {
        const index = this.rfidEventCallbacks.indexOf(callback);
        if (index > -1) {
          this.rfidEventCallbacks.splice(index, 1);
        }
        // Close event source if no more callbacks
        if (this.rfidEventCallbacks.length === 0 && this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
      };
    }

    // Check if backend is available
    this.checkBackendAvailable().then((available) => {
      if (!available) {
        console.warn('[Hardware] Backend not available, cannot start RFID event stream');
        return;
      }

      try {
        const streamUrl = `${API_BASE_URL}/rfid/stream`;
        console.log('[Hardware] Connecting to RFID event stream:', streamUrl);
        
        this.eventSource = new EventSource(streamUrl);

        this.eventSource.onmessage = (e) => {
          try {
            const event: RfidEvent = JSON.parse(e.data);
            console.log('[Hardware] RFID event received:', event);
            
            // Update charging status based on event
            if (event.type === 'charging_started') {
              this.chargingActive = true;
              this.startTime = Date.now();
            } else if (event.type === 'charging_stopped') {
              this.chargingActive = false;
            }

            // Notify all callbacks
            this.rfidEventCallbacks.forEach((cb) => {
              try {
                cb(event);
              } catch (err) {
                console.error('[Hardware] Error in RFID event callback:', err);
              }
            });
          } catch (err) {
            console.error('[Hardware] Failed to parse RFID event:', err);
          }
        };

        this.eventSource.onerror = (err) => {
          console.error('[Hardware] RFID event stream error:', err);
          // Attempt to reconnect after a delay
          if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            setTimeout(() => {
              if (this.rfidEventCallbacks.length > 0) {
                this.startRfidEventStream(callback);
              }
            }, 5000);
          }
        };

        console.log('[Hardware] RFID event stream connected');
      } catch (error) {
        console.error('[Hardware] Failed to start RFID event stream:', error);
      }
    });

    // Return cleanup function
    return () => {
      const index = this.rfidEventCallbacks.indexOf(callback);
      if (index > -1) {
        this.rfidEventCallbacks.splice(index, 1);
      }
      // Close event source if no more callbacks
      if (this.rfidEventCallbacks.length === 0 && this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
        console.log('[Hardware] RFID event stream closed');
      }
    };
  }

  // Stop RFID event stream
  stopRfidEventStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.rfidEventCallbacks = [];
      console.log('[Hardware] RFID event stream stopped');
    }
  }
}

export const hardware = new HardwareService();

