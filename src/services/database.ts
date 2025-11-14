import type { User, ChargingSession, SystemSettings, Transaction } from '../types';

const STORAGE_KEYS = {
  USERS: 'ev_charging_users',
  SESSIONS: 'ev_charging_sessions',
  SETTINGS: 'ev_charging_settings',
  TRANSACTIONS: 'ev_charging_transactions',
};

// Initialize default settings
const DEFAULT_SETTINGS: SystemSettings = {
  fullChargeCost: 100,
  costPerKWh: 10,
  defaultBatteryCapacity: 5000, // 5 kWh
};

// Initialize default users for demo
const DEFAULT_USERS: User[] = [
  {
    id: '1',
    name: 'Lalit Nikumbh',
    rfidCardId: 'RFID001',
    balance: 100.0,
    phoneNumber: '+91 9876543212',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Fateen Shaikh',
    rfidCardId: 'RFID002',
    balance: 150.0,
    phoneNumber: '+91 9876543213',
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Nishad Deshmukh',
    rfidCardId: 'RFID003',
    balance: 90.0,
    phoneNumber: '+91 9876543214',
    createdAt: new Date().toISOString(),
  },
];

export const db = {
  // Users
  getUsers(): User[] {
    const stored = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!stored) {
      this.saveUsers(DEFAULT_USERS);
      return DEFAULT_USERS;
    }
    const users = JSON.parse(stored);
    
    // Remove any traces of John Doe and Jane Smith (by name only)
    const filteredUsers = users.filter(
      (user: User) => 
        user.name !== 'John Doe' && 
        user.name !== 'Jane Smith'
    );
    
    // Ensure we have all 3 required users
    const requiredUserNames = ['Lalit Nikumbh', 'Fateen Shaikh', 'Nishad Deshmukh'];
    const existingNames = filteredUsers.map((u: User) => u.name);
    const missingUsers = DEFAULT_USERS.filter(
      (defaultUser) => !existingNames.includes(defaultUser.name)
    );
    
    // If users are missing, add them
    if (missingUsers.length > 0) {
      const mergedUsers = [...filteredUsers];
      missingUsers.forEach((missingUser) => {
        mergedUsers.push(missingUser);
      });
      this.saveUsers(mergedUsers);
      return mergedUsers;
    }
    
    // If we removed users, save the cleaned list
    if (filteredUsers.length !== users.length) {
      this.saveUsers(filteredUsers);
      return filteredUsers;
    }
    
    // If we have fewer than 3 users, restore defaults
    if (filteredUsers.length < 3) {
      this.saveUsers(DEFAULT_USERS);
      return DEFAULT_USERS;
    }
    
    return filteredUsers;
  },

  saveUsers(users: User[]): void {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  },

  // Force reset to default users (useful for admin)
  resetUsers(): void {
    this.saveUsers(DEFAULT_USERS);
  },

  getUserByRfid(rfidCardId: string): User | null {
    const users = this.getUsers();
    return users.find((u) => u.rfidCardId === rfidCardId) || null;
  },

  updateUserBalance(userId: string, newBalance: number): void {
    const users = this.getUsers();
    const user = users.find((u) => u.id === userId);
    if (user) {
      user.balance = newBalance;
      this.saveUsers(users);
    }
  },

  addUser(user: User): void {
    const users = this.getUsers();
    users.push(user);
    this.saveUsers(users);
  },

  // Sessions
  getSessions(): ChargingSession[] {
    const stored = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    return stored ? JSON.parse(stored) : [];
  },

  saveSessions(sessions: ChargingSession[]): void {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  },

  createSession(session: ChargingSession): void {
    const sessions = this.getSessions();
    sessions.push(session);
    this.saveSessions(sessions);
  },

  updateSession(sessionId: string, updates: Partial<ChargingSession>): void {
    const sessions = this.getSessions();
    const index = sessions.findIndex((s) => s.id === sessionId);
    if (index !== -1) {
      sessions[index] = { ...sessions[index], ...updates };
      this.saveSessions(sessions);
    }
  },

  getActiveSession(): ChargingSession | null {
    const sessions = this.getSessions();
    return sessions.find((s) => s.status === 'in_progress') || null;
  },

  // Settings
  getSettings(): SystemSettings {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!stored) {
      this.saveSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    return JSON.parse(stored);
  },

  saveSettings(settings: SystemSettings): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  // Transactions
  getTransactions(): Transaction[] {
    const stored = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return stored ? JSON.parse(stored) : [];
  },

  saveTransactions(transactions: Transaction[]): void {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  },

  addTransaction(transaction: Transaction): void {
    const transactions = this.getTransactions();
    transactions.push(transaction);
    this.saveTransactions(transactions);
  },

  getUserTransactions(userId: string): Transaction[] {
    const transactions = this.getTransactions();
    return transactions.filter((t) => t.userId === userId);
  },
};

