# RFID-Controlled EV Charging Kiosk Backend

Python backend service for Raspberry Pi that handles:
- MFRC522 RFID card reader
- GPIO relay control for charging
- User balance management
- REST API for frontend communication

## Hardware Requirements

- Raspberry Pi (3B+ or newer recommended)
- MFRC522 RFID Reader Module
- Relay Module (for charging control)
- Jumper wires

## Hardware Connections

### MFRC522 RFID Reader
- SDA (SS) → GPIO 8 (CE0)
- SCK → GPIO 11 (SCLK)
- MOSI → GPIO 10 (MOSI)
- MISO → GPIO 9 (MISO)
- IRQ → Not connected
- GND → Ground
- RST → GPIO 25
- 3.3V → 3.3V

### Relay Module
- IN → GPIO 18
- VCC → 5V
- GND → Ground

## Installation

1. **Install system dependencies:**
```bash
sudo apt-get update
sudo apt-get install -y python3-pip python3-dev python3-spidev python3-rpi.gpio
```

2. **Install Python packages:**
```bash
cd backend
pip3 install -r requirements.txt
```

3. **Enable SPI interface:**
```bash
sudo raspi-config
# Navigate to: Interface Options → SPI → Enable
# Reboot after enabling
```

4. **Test the service:**
```bash
python3 rfid_service.py
```

The service will run on `http://localhost:5000`

## Configuration

### Default Users

The system comes with three pre-configured users:
- **Lalit Nikumbh** (RFID001) - Balance: ₹100.00
- **Fateen Shaikh** (RFID002) - Balance: ₹150.00
- **Nishad Deshmukh** (RFID003) - Balance: ₹90.00

User data is stored in `users_data.json` in the backend directory.

### Charging Rate

Default charging rate: ₹0.01 per second (₹36 per hour)
Can be modified in `rfid_service.py`:
```python
CHARGING_RATE_PER_SECOND = 0.01  # Adjust as needed
```

### GPIO Pin Configuration

Default relay pin: GPIO 18 (BCM numbering)
Can be modified in `rfid_service.py`:
```python
RELAY_PIN = 18  # Change if using different pin
```

## API Endpoints

### Health Check
```
GET /api/health
```

### Scan RFID Card
```
POST /api/rfid/scan
Response: { success: true, action: "started"|"stopped", user: {...} }
```

### Get All Users
```
GET /api/users
```

### Get User by ID
```
GET /api/users/<user_id>
```

### Get User by RFID
```
GET /api/users/rfid/<rfid_id>
```

### Update User Balance
```
PUT /api/users/<user_id>/balance
Body: { "balance": 100.0 }
```

### Get Charging Status
```
GET /api/charging/status
Response: { isCharging: bool, currentUser: {...}, currentBalance: float }
```

### Start Charging
```
POST /api/charging/start
Body: { "userId": "1" }
```

### Stop Charging
```
POST /api/charging/stop
```

## Running as a Service

1. **Copy service file:**
```bash
sudo cp rfid-kiosk.service /etc/systemd/system/
```

2. **Update paths in service file** (if needed):
Edit `/etc/systemd/system/rfid-kiosk.service` and adjust:
- `WorkingDirectory`
- `ExecStart` path

3. **Enable and start service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable rfid-kiosk.service
sudo systemctl start rfid-kiosk.service
```

4. **Check status:**
```bash
sudo systemctl status rfid-kiosk.service
```

5. **View logs:**
```bash
sudo journalctl -u rfid-kiosk.service -f
```

## Usage

### Starting Charging
1. Scan an authorized RFID card
2. If balance is sufficient, charging starts automatically
3. Relay turns ON, balance is deducted in real-time

### Stopping Charging
1. Scan the same RFID card again, OR
2. Balance reaches zero (auto-stop), OR
3. Call the `/api/charging/stop` endpoint

### Unauthorized Cards
- Unauthorized cards are rejected
- Error message returned to frontend

## Troubleshooting

### RFID Reader Not Working
- Check SPI is enabled: `lsmod | grep spi`
- Verify wiring connections
- Check permissions: `sudo usermod -a -G spi,gpio pi`

### Relay Not Working
- Verify GPIO pin configuration
- Check relay module connections
- Test relay manually: `gpio -g write 18 1` (ON) / `gpio -g write 18 0` (OFF)

### Service Won't Start
- Check logs: `sudo journalctl -u rfid-kiosk.service`
- Verify Python path: `which python3`
- Check file permissions

### Mock Mode
If hardware libraries are not available, the service runs in mock mode for development/testing.

## Development

For development on non-Raspberry Pi systems, the service will automatically run in mock mode without hardware dependencies.


