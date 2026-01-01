# Raspberry Pi 4B Setup Guide

This guide will help you deploy the EV Charging Kiosk application on a Raspberry Pi 4B.

## Prerequisites

- Raspberry Pi 4B with Raspberry Pi OS (32-bit or 64-bit)
- Internet connection for initial setup
- Node.js 18+ installed

## Step 1: Install Node.js on Raspberry Pi

If Node.js is not installed, use one of these methods:

### Option A: Using NodeSource (Recommended)

```bash
# For 64-bit Raspberry Pi OS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# For 32-bit Raspberry Pi OS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Option B: Using Node Version Manager (nvm)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### Verify Installation

```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

## Step 2: Transfer Project to Raspberry Pi

### Option A: Using Git (if project is in a repository)

```bash
cd ~
git clone https://github.com/DeadpoolYD/ev_charging_kiosk.git
cd EV_CHARGING_KIOSK
```

### Option B: Using SCP (from your development machine)

```bash
# From your Windows/Mac/Linux machine
scp -r EV_CHARGING_KIOSK pi@<raspberry-pi-ip>:~/
```

### Option C: Using USB Drive

1. Copy the project folder to a USB drive
2. Insert USB drive into Raspberry Pi
3. Mount and copy:
```bash
sudo mkdir -p /mnt/usb
sudo mount /dev/sda1 /mnt/usb  # Adjust device name if needed
cp -r /mnt/usb/EV_CHARGING_KIOSK ~/
sudo umount /mnt/usb
```

## Step 3: Install Dependencies

```bash
cd ~/EV_CHARGING_KIOSK
npm install
```

This may take a few minutes on Raspberry Pi.

## Step 4: Build the Application

```bash
npm run build
```

This creates the production build in the `dist` folder.

## Step 5: Test the Application

```bash
npm run serve
```

The application will be available at:
- Local: `http://localhost:3000`
- Network: `http://<raspberry-pi-ip>:3000`

To find your Raspberry Pi IP address:
```bash
hostname -I
```

## Step 6: Set Up Auto-Start on Boot (Optional)

### Using systemd Service

1. Create the service file:
```bash
sudo nano /etc/systemd/system/ev-charging-kiosk.service
```

2. Add the following content (adjust paths as needed):

```ini
[Unit]
Description=EV Charging Kiosk Application
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/EV_CHARGING_KIOSK
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node /home/pi/EV_CHARGING_KIOSK/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

3. Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable ev-charging-kiosk.service
sudo systemctl start ev-charging-kiosk.service
```

4. Check status:
```bash
sudo systemctl status ev-charging-kiosk.service
```

5. View logs:
```bash
sudo journalctl -u ev-charging-kiosk.service -f
```

## Step 7: Access the Application

### On Raspberry Pi

Open a browser and navigate to:
```
http://localhost:3000
```

### From Other Devices on Network

1. Find your Raspberry Pi IP:
```bash
hostname -I
```

2. Open browser on any device and navigate to:
```
http://<raspberry-pi-ip>:3000
```

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, change it:
```bash
PORT=8080 npm run serve
```

Or update the service file to use a different port.

### Build Fails

If build fails due to memory issues:
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=2048" npm run build
```

### Permission Denied

If you get permission errors:
```bash
sudo chown -R $USER:$USER ~/EV_CHARGING_KIOSK
```

### Service Won't Start

Check the logs:
```bash
sudo journalctl -u ev-charging-kiosk.service -n 50
```

### Application Not Accessible from Network

1. Check firewall:
```bash
sudo ufw allow 3000
```

2. Ensure Raspberry Pi is on the same network

## Updating the Application

1. Stop the service (if running):
```bash
sudo systemctl stop ev-charging-kiosk.service
```

2. Update code and rebuild:
```bash
cd ~/EV_CHARGING_KIOSK
git pull  # if using git
npm install
npm run build
```

3. Restart the service:
```bash
sudo systemctl start ev-charging-kiosk.service
```

## Performance Optimization

For better performance on Raspberry Pi:

1. **Use 64-bit OS** if available
2. **Increase swap space** if build fails:
```bash
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# Change CONF_SWAPSIZE=100 to CONF_SWAPSIZE=2048
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

3. **Disable unnecessary services** to free up resources

## Hardware Integration (Future)

The current implementation uses mock hardware. To integrate real hardware:

1. Install GPIO libraries:
```bash
npm install onoff  # For GPIO control
npm install serialport  # For serial communication
```

2. Update `src/services/hardware.ts` with real hardware communication

## Notes

- The application uses localStorage for data persistence
- All data is stored in the browser
- For production, consider using a database (SQLite, PostgreSQL, etc.)
- The application runs on port 3000 by default
- Make sure to build the application after any code changes

