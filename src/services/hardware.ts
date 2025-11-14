// Mock hardware interface for Raspberry Pi integration
// In production, this would communicate with actual hardware via serial/USB/GPIO

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

class HardwareService {
  private chargingActive = false;
  private currentBattery = 35; // Mock starting battery %
  private targetBattery = 0;
  private startTime = 0;
  private energyDelivered = 0; // in Wh

  // Mock RFID reader
  async scanRfid(): Promise<string | null> {
    // Simulate RFID scan delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // For demo: return a mock RFID card ID
    // In production, this would read from actual RFID reader
    return 'RFID001'; // Default to first user (Lalit Nikumbh)
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

  // Mock relay/contactor control
  async startCharging(targetBattery: number): Promise<boolean> {
    this.chargingActive = true;
    this.targetBattery = targetBattery;
    this.startTime = Date.now();
    this.energyDelivered = 0;
    
    // In production: send command to relay/contactor via GPIO
    console.log('Charging started - Relay ON');
    return true;
  }

  async stopCharging(): Promise<boolean> {
    this.chargingActive = false;
    
    // In production: send command to relay/contactor via GPIO
    console.log('Charging stopped - Relay OFF');
    return true;
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
}

export const hardware = new HardwareService();

