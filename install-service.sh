#!/bin/bash

# Script to install systemd service for EV Charging Kiosk

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="ev-charging-kiosk.service"
SERVICE_PATH="/etc/systemd/system/ev-charging-kiosk.service"

echo "🔧 Installing EV Charging Kiosk systemd service..."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Get the actual user (not root)
ACTUAL_USER=${SUDO_USER:-$USER}
ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)

# Update service file with actual paths
sed "s|/home/pi|$ACTUAL_HOME|g" "$SCRIPT_DIR/$SERVICE_FILE" | \
sed "s|User=pi|User=$ACTUAL_USER|g" > "$SERVICE_PATH"

echo "✅ Service file created at $SERVICE_PATH"
echo ""

# Reload systemd
systemctl daemon-reload

# Enable service
systemctl enable ev-charging-kiosk.service

echo "✅ Service enabled"
echo ""
echo "To start the service, run:"
echo "  sudo systemctl start ev-charging-kiosk.service"
echo ""
echo "To check status:"
echo "  sudo systemctl status ev-charging-kiosk.service"
echo ""
echo "To view logs:"
echo "  sudo journalctl -u ev-charging-kiosk.service -f"
echo ""

