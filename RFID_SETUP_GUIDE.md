# RFID-Controlled EV Charging Kiosk Setup Guide

Complete setup guide for integrating RFID authentication and relay control with your EV Charging Kiosk on Raspberry Pi.

## Overview

This system integrates:
- **MFRC522 RFID Reader** for user authentication
- **GPIO Relay Control** for charging start/stop
- **Python Backend Service** that communicates with your React frontend
- **Three Pre-configured Users**: Lait (Lalit), Nishad, and Fateen

## Hardware Requirements

### Components Needed
1. Raspberry Pi (3B+ or newer recommended)
2. MFRC522 RFID Reader Module
3. Relay Module (5V, single channel)
4. Jumper wires (male-to-female recommended)
5. Breadboard (optional, for prototyping)

### Hardware Connections

#### MFRC522 RFID Reader to Raspberry Pi
| MFRC522 Pin | Raspberry Pi GPIO | Physical Pin |
|-------------|-------------------|--------------|
| SDA (SS)    | GPIO 8 (CE0)      | Pin 24       |
| SCK         | GPIO 11 (SCLK)     | Pin 23       |
| MOSI        | GPIO 10 (MOSI)     | Pin 19       |
| MISO        | GPIO 9 (MISO)      | Pin 21       |
| IRQ         | Not connected      | -            |
| GND         | Ground             | Pin 6        |
| RST         | GPIO 25            | Pin 22       |
| 3.3V        | 3.3V Power         | Pin 1        |

#### Relay Module to Raspberry Pi
| Relay Pin | Raspberry Pi GPIO | Physical Pin |
|-----------|-------------------|--------------|
| IN        | GPIO 18           | Pin 12       |
| VCC       | 5V Power          | Pin 2        |
| GND       | Ground            | Pin 14       |

**Important**: Connect relay's NO (Normally Open) terminal to your charging circuit's control line.

## Software Installation

### Step 1: Enable SPI Interface

```bash
sudo raspi-config
```

Navigate to:
- **Interface Options** → **SPI** → **Enable**

Reboot after enabling:
```bash
sudo reboot
```

### Step 2: Install System Dependencies

```bash
sudo apt-get update
sudo apt-get install -y python3-pip python3-dev python3-spidev python3-rpi.gpio
```

### Step 3: Install Python Backend

```bash
cd ~/ev_charging_kiosk/backend
pip3 install -r requirements.txt
```

### Step 4: Run Setup Script (Optional)

```bash
cd ~/ev_charging_kiosk/backend
chmod +x setup.sh
./setup.sh
```

This script will:
- Install all dependencies
- Enable SPI (if not already enabled)
- Set up the systemd service
- Configure file permissions

### Step 5: Test the Backend Service

```bash
cd ~/ev_charging_kiosk/backend
python3 rfid_service.py
```

You should see:
```
[INFO] Hardware initialized - Relay on GPIO 18, RFID reader ready
[INFO] Starting RFID Service on port 5000
[INFO] API available at http://localhost:5000/api
```

Test the API:
```bash
curl http://localhost:5000/api/health
```

### Step 6: Install as System Service

```bash
# Copy service file
sudo cp ~/ev_charging_kiosk/backend/rfid-kiosk.service /etc/systemd/system/

# Edit service file if needed (update paths)
sudo nano /etc/systemd/system/rfid-kiosk.service

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable rfid-kiosk.service
sudo systemctl start rfid-kiosk.service

# Check status
sudo systemctl status rfid-kiosk.service
```

### Step 7: Configure Frontend

The frontend is already configured to communicate with the Python backend. The API URL is set via environment variable:

```bash
# Create .env file in project root
echo "VITE_RFID_API_URL=http://localhost:5000/api" > .env
```

Or set it in `vite.config.ts` if needed.

## Default Users

The system comes with three pre-configured users:

| Name | RFID Card ID | Initial Balance |
|------|--------------|----------------|
| Lalit Nikumbh | RFID001 | ₹100.00 |
| Fateen Shaikh | RFID002 | ₹150.00 |
| Nishad Deshmukh | RFID003 | ₹90.00 |

**Note**: To use these cards, you need to program your RFID cards with these IDs, or update the `users_data.json` file with your actual card IDs.

## How It Works

### Starting Charging
1. User scans RFID card via the frontend
2. Backend authenticates the card
3. If authorized and balance is sufficient:
   - Relay turns ON (GPIO 18 → HIGH)
   - Charging status set to "Charging"
   - Balance starts deducting in real-time (₹0.01/second)

### Stopping Charging
Charging stops when:
1. **Same RFID card is scanned again** (manual stop)
2. **Balance reaches zero** (automatic stop)
3. **Stop command sent via API** (programmatic stop)

### Unauthorized Cards
- Unauthorized cards are rejected
- Error message displayed on frontend
- No relay activation

## Configuration

### Adjust Charging Rate

Edit `backend/rfid_service.py`:
```python
CHARGING_RATE_PER_SECOND = 0.01  # ₹0.01 per second = ₹36 per hour
```

### Change GPIO Pin

Edit `backend/rfid_service.py`:
```python
RELAY_PIN = 18  # Change to your preferred GPIO pin
```

### Update User Data

User data is stored in `backend/users_data.json`. You can:
- Edit directly (JSON format)
- Use the API endpoints
- Use the admin panel in the frontend

## API Endpoints

### Health Check
```bash
GET /api/health
```

### Scan RFID Card
```bash
POST /api/rfid/scan
```

### Get Charging Status
```bash
GET /api/charging/status
```

### Get All Users
```bash
GET /api/users
```

### Update User Balance
```bash
PUT /api/users/<user_id>/balance
Body: { "balance": 100.0 }
```

See `backend/README.md` for complete API documentation.

## Troubleshooting

### RFID Reader Not Working

1. **Check SPI is enabled:**
   ```bash
   lsmod | grep spi
   ```
   Should show `spidev` modules.

2. **Verify wiring:**
   - Double-check all connections
   - Ensure 3.3V power (not 5V)
   - Check ground connections

3. **Check permissions:**
   ```bash
   sudo usermod -a -G spi,gpio pi
   ```
   Log out and back in for changes to take effect.

4. **Test RFID reader:**
   ```bash
   python3 -c "from mfrc522 import SimpleMFRC522; reader = SimpleMFRC522(); print(reader.read())"
   ```

### Relay Not Working

1. **Test GPIO manually:**
   ```bash
   # Install gpio utility
   sudo apt-get install wiringpi
   
   # Turn relay ON
   gpio -g write 18 1
   
   # Turn relay OFF
   gpio -g write 18 0
   ```

2. **Check relay module:**
   - Verify 5V power supply
   - Check relay module LED (should light when activated)
   - Test relay with multimeter

3. **Verify GPIO pin:**
   - Check `RELAY_PIN` in `rfid_service.py`
   - Ensure no conflicts with other services

### Service Won't Start

1. **Check logs:**
   ```bash
   sudo journalctl -u rfid-kiosk.service -f
   ```

2. **Verify Python path:**
   ```bash
   which python3
   ```
   Update service file if path differs.

3. **Check file permissions:**
   ```bash
   ls -la ~/ev_charging_kiosk/backend/
   ```

4. **Test manually:**
   ```bash
   cd ~/ev_charging_kiosk/backend
   python3 rfid_service.py
   ```

### Frontend Can't Connect to Backend

1. **Check backend is running:**
   ```bash
   curl http://localhost:5000/api/health
   ```

2. **Verify API URL:**
   - Check `.env` file
   - Check browser console for errors
   - Verify CORS is enabled in backend

3. **Check firewall:**
   ```bash
   sudo ufw status
   ```

## Testing

### Test RFID Scanning
1. Start the backend service
2. Open frontend in browser
3. Click "Scan RFID Card"
4. Place RFID card near reader
5. Should see user information displayed

### Test Charging Control
1. Scan authorized card
2. Verify relay activates (LED on relay module should light)
3. Check charging status in frontend
4. Scan same card again to stop
5. Verify relay deactivates

### Test Balance Deduction
1. Note user's starting balance
2. Start charging
3. Wait a few seconds
4. Check balance via API or frontend
5. Balance should decrease by ₹0.01 per second

## Security Considerations

1. **Physical Security:**
   - Protect RFID cards from unauthorized access
   - Secure Raspberry Pi and wiring

2. **Network Security:**
   - Use firewall rules
   - Consider HTTPS for production
   - Restrict API access if needed

3. **Data Security:**
   - Regular backups of `users_data.json`
   - Secure file permissions

## Production Deployment

1. **Enable service on boot:**
   ```bash
   sudo systemctl enable rfid-kiosk.service
   ```

2. **Set up auto-start for frontend:**
   - Already configured via `ev-charging-kiosk.service`

3. **Monitor logs:**
   ```bash
   sudo journalctl -u rfid-kiosk.service -f
   ```

4. **Regular maintenance:**
   - Check user balances
   - Monitor charging sessions
   - Backup user data

## Support

For issues or questions:
1. Check logs: `sudo journalctl -u rfid-kiosk.service`
2. Review `backend/README.md` for API details
3. Test hardware connections
4. Verify all dependencies are installed

## Next Steps

1. Program your RFID cards with the card IDs (RFID001, RFID002, RFID003)
2. Test the complete flow: scan → charge → stop
3. Adjust charging rates as needed
4. Add more users via the admin panel or API
5. Monitor and maintain the system


