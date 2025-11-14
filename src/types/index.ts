export interface User {
  id: string;
  name: string;
  rfidCardId: string;
  balance: number;
  phoneNumber?: string; // Optional phone number for SMS notifications
  createdAt: string;
}

export interface ChargingSession {
  id: string;
  userId: string;
  userName: string;
  paidAmount: number;
  targetBattery: number;
  startBattery: number;
  endBattery: number | null;
  energyDelivered: number; // in Wh
  voltage: number;
  current: number;
  power: number; // in W
  startTime: string;
  endTime: string | null;
  status: 'in_progress' | 'completed' | 'stopped';
  remainingBalance: number;
}

export interface SystemSettings {
  fullChargeCost: number; // Cost for 100% charge (e.g., ₹100)
  costPerKWh: number; // Cost per kWh (e.g., ₹10)
  defaultBatteryCapacity: number; // in Wh
}

export interface Transaction {
  id: string;
  userId: string;
  userName: string;
  type: 'charge' | 'recharge' | 'deduction' | 'addition';
  amount: number;
  timestamp: string;
  description: string;
  sessionId?: string;
}

