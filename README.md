# EV Charging Station - Pay Before Charge System

A comprehensive React-based EV charging station management system with pay-before-charge functionality, designed for Raspberry Pi 4B integration.

## 🚀 Features

### 1. **Authentication & Balance Check Screen**
- RFID card scanning for user authentication
- Real-time balance display
- Battery level monitoring (via BCU)
- User information display
- Recharge balance option

### 2. **Cost Selection Screen**
- Predefined payment options (₹20, ₹40, ₹60, ₹80, ₹100)
- Custom amount input
- Dynamic battery percentage calculation
- Estimated battery level after charge
- Balance verification before payment

### 3. **Charging in Progress Screen**
- Real-time charging monitoring
- Live battery percentage updates
- Energy delivered tracking (kWh)
- Voltage, Current, and Power display
- Elapsed time counter
- Visual progress bar
- Stop charging functionality
- Auto-stop when target battery reached

### 4. **Charging Summary/Receipt Screen**
- Complete session summary
- Energy used (kWh)
- Battery increase percentage
- Amount deducted
- Remaining balance
- Start/End time
- Duration
- Print/Save receipt functionality

### 5. **Admin Panel**
- User management
- Balance adjustment (add/deduct)
- System settings configuration:
  - Full charge cost
  - Cost per kWh
  - Battery capacity
- Transaction history view
- User-wise transaction filtering

## 🛠️ Technology Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM
- **Icons**: Lucide React
- **State Management**: React Context API
- **Database**: LocalStorage (can be replaced with Supabase/SQLite)
- **Build Tool**: Vite

## 📦 Installation

### Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck

# Lint
npm run lint
```

### Production/Raspberry Pi Setup

```bash
# Install dependencies
npm install

# Build and serve the application
npm start

# Or separately:
npm run build
npm run serve
```

**For detailed Raspberry Pi 4B deployment instructions, see [RASPBERRY_PI_SETUP.md](./RASPBERRY_PI_SETUP.md)**

## 🏗️ Project Structure

```
src/
├── components/          # React components
│   ├── AuthScreen.tsx           # RFID authentication screen
│   ├── CostSelectionScreen.tsx # Payment selection
│   ├── ChargingScreen.tsx        # Charging progress
│   ├── SummaryScreen.tsx         # Session summary
│   └── AdminPanel.tsx            # Admin management
├── context/
│   └── AppContext.tsx           # Global state management
├── services/
│   ├── database.ts              # Data persistence layer
│   └── hardware.ts              # Hardware interface (mock)
├── types/
│   └── index.ts                 # TypeScript interfaces
├── App.tsx                      # Main app with routing
└── main.tsx                     # Entry point
```

## 🔌 Hardware Integration

The system includes a mock hardware interface (`src/services/hardware.ts`) that simulates:
- RFID reader
- Battery Control Unit (BCU)
- Current/Voltage sensors (INA219/ACS712)
- Relay/Contactor control

### For Production Integration:

Replace the mock functions in `hardware.ts` with actual hardware communication:

```typescript
// Example: Real RFID reader
async scanRfid(): Promise<string | null> {
  // Connect to RFID reader via serial/USB
  // Return actual RFID card ID
}

// Example: Real sensor reading
async getSensorData(): Promise<SensorData> {
  // Read from INA219 or ACS712 via I2C/GPIO
  // Return actual voltage, current, power
}

// Example: Real relay control
async startCharging(): Promise<boolean> {
  // Control relay/contactor via GPIO
  // Return success status
}
```

## 💾 Database

Currently uses LocalStorage for data persistence. To use Supabase or SQLite:

1. **Supabase**: Replace `db` functions in `database.ts` with Supabase client calls
2. **SQLite**: Use a library like `better-sqlite3` for Node.js backend integration

## 🎯 Usage Flow

1. **User scans RFID card** → Authentication screen shows balance and battery level
2. **User selects charging amount** → System calculates target battery percentage
3. **Payment confirmed** → Balance deducted, charging starts
4. **Charging in progress** → Real-time monitoring until target reached or stopped
5. **Charging complete** → Summary screen with receipt

## ⚙️ Configuration

System settings can be configured in the Admin Panel:
- **Full Charge Cost**: Cost for 100% battery charge (default: ₹100)
- **Cost per kWh**: Energy-to-cost ratio (default: ₹10/kWh)
- **Battery Capacity**: Default capacity in Wh (default: 5000 Wh)

## 📊 Default Users

The system comes with demo users:
- **Lalit Nikumbh** (RFID: RFID001) - Balance: ₹100.00
- **Fateen Shaikh** (RFID: RFID002) - Balance: ₹150.00
- **Nishad Deshmukh** (RFID: RFID003) - Balance: ₹90.00

## 🔐 Admin Access

Access the admin panel via the "Recharge Balance (Admin)" link on the authentication screen.

## 📝 Notes

- All monetary values are in Indian Rupees (₹)
- Battery percentage calculations are based on the configured full charge cost
- Energy delivered is tracked in Watt-hours (Wh) and displayed in kWh
- Session data is automatically saved and can be viewed in transaction history

## 🍓 Raspberry Pi 4B Deployment

This application is ready to run on Raspberry Pi 4B. See the comprehensive setup guide:

**[📖 Raspberry Pi Setup Guide](./RASPBERRY_PI_SETUP.md)**

### Quick Start on Raspberry Pi

1. **Transfer project to Raspberry Pi**
2. **Run setup script:**
   ```bash
   chmod +x setup-raspberry-pi.sh
   ./setup-raspberry-pi.sh
   ```
3. **Start the application:**
   ```bash
   npm start
   ```
4. **Access at:** `http://<raspberry-pi-ip>:3000`

### Auto-Start on Boot

To make the application start automatically on boot:

```bash
chmod +x install-service.sh
sudo ./install-service.sh
sudo systemctl start ev-charging-kiosk.service
```

## 🚧 Future Enhancements

- [x] Raspberry Pi 4B deployment support
- [ ] Real hardware integration (Raspberry Pi GPIO)
- [ ] QR code payment integration
- [ ] Multi-language support
- [ ] Email/SMS notifications
- [ ] Advanced analytics dashboard
- [ ] Mobile app integration

## 📄 License

This project is a template/starter for EV charging station management systems.
