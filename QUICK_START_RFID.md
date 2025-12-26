# Quick Start: RFID Integration

Quick reference for getting the RFID-controlled charging system running.

## Prerequisites

- Raspberry Pi with SPI enabled
- MFRC522 RFID reader connected
- Relay module connected to GPIO 18

## Installation (5 minutes)

```bash
# 1. Enable SPI
sudo raspi-config  # Interface Options → SPI → Enable
sudo reboot

# 2. Install dependencies
cd ~/ev_charging_kiosk/backend
sudo apt-get install -y python3-pip python3-dev python3-spidev python3-rpi.gpio
pip3 install -r requirements.txt

# 3. Test
python3 rfid_service.py
```

## Start Service

```bash
# Manual start
cd ~/ev_charging_kiosk/backend
python3 rfid_service.py

# Or install as service
sudo cp rfid-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable rfid-kiosk.service
sudo systemctl start rfid-kiosk.service
```

## Default Users

| Name | RFID ID | Balance |
|------|---------|---------|
| Lalit Nikumbh | RFID001 | ₹100 |
| Fateen Shaikh | RFID002 | ₹150 |
| Nishad Deshmukh | RFID003 | ₹90 |

## How to Use

1. **Start Frontend**: `npm run dev` (or use production build)
2. **Scan Card**: Click "Scan RFID Card" and place card near reader
3. **Charging Starts**: Relay turns ON, balance deducts (₹0.01/sec)
4. **Stop Charging**: Scan same card again or wait for balance to reach zero

## Test API

```bash
# Health check
curl http://localhost:5000/api/health

# Scan RFID (requires card)
curl -X POST http://localhost:5000/api/rfid/scan

# Get charging status
curl http://localhost:5000/api/charging/status
```

## Troubleshooting

**RFID not working?**
- Check SPI: `lsmod | grep spi`
- Verify wiring connections
- Test: `python3 -c "from mfrc522 import SimpleMFRC522; print(SimpleMFRC522().read())"`

**Relay not working?**
- Test GPIO: `gpio -g write 18 1` (ON) / `gpio -g write 18 0` (OFF)
- Check relay module power

**Service not starting?**
- Check logs: `sudo journalctl -u rfid-kiosk.service -f`
- Verify Python path in service file

## Files

- **Backend Service**: `backend/rfid_service.py`
- **User Data**: `backend/users_data.json`
- **Service File**: `backend/rfid-kiosk.service`
- **Full Guide**: `RFID_SETUP_GUIDE.md`


