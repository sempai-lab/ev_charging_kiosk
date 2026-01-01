#!/bin/bash
# Setup script for RFID EV Charging Kiosk Backend

set -e

echo "========================================="
echo "RFID EV Charging Kiosk Backend Setup"
echo "========================================="

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ] || ! grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
    echo "[WARNING] Not running on Raspberry Pi. Service will run in mock mode."
fi

# Update system
echo "[1/6] Updating system packages..."
sudo apt-get update

# Install system dependencies
echo "[2/6] Installing system dependencies..."
sudo apt-get install -y python3-pip python3-dev python3-spidev python3-rpi.gpio

# Install Python packages
echo "[3/6] Installing Python packages..."
cd "$(dirname "$0")"
pip3 install -r requirements.txt

# Enable SPI
echo "[4/6] Checking SPI interface..."
if ! grep -q "dtparam=spi=on" /boot/config.txt 2>/dev/null; then
    echo "[INFO] SPI not enabled. Enabling now..."
    echo "dtparam=spi=on" | sudo tee -a /boot/config.txt
    echo "[WARNING] SPI enabled. Please reboot for changes to take effect."
else
    echo "[INFO] SPI is already enabled."
fi

# Create data directory
echo "[5/6] Setting up data directory..."
mkdir -p "$(dirname "$0")"
chmod 755 "$(dirname "$0")"

# Install systemd service
echo "[6/6] Installing systemd service..."
SERVICE_FILE="$(dirname "$0")/rfid-kiosk.service"
SYSTEMD_PATH="/etc/systemd/system/rfid-kiosk.service"

if [ -f "$SERVICE_FILE" ]; then
    # Update paths in service file based on actual location
    ACTUAL_PATH="$(cd "$(dirname "$0")" && pwd)"
    sed "s|/home/pi/ev_charging_kiosk/backend|$ACTUAL_PATH|g" "$SERVICE_FILE" | sudo tee "$SYSTEMD_PATH" > /dev/null
    
    sudo systemctl daemon-reload
    echo "[INFO] Service file installed at $SYSTEMD_PATH"
    echo ""
    echo "To start the service:"
    echo "  sudo systemctl start rfid-kiosk.service"
    echo ""
    echo "To enable on boot:"
    echo "  sudo systemctl enable rfid-kiosk.service"
    echo ""
    echo "To check status:"
    echo "  sudo systemctl status rfid-kiosk.service"
else
    echo "[WARNING] Service file not found. Skipping systemd installation."
fi

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. If SPI was just enabled, reboot: sudo reboot"
echo "2. Test the service: python3 rfid_service.py"
echo "3. Start the service: sudo systemctl start rfid-kiosk.service"
echo "4. Enable on boot: sudo systemctl enable rfid-kiosk.service"
echo ""


