# Quick Start - Raspberry Pi 4B

## Fastest Way to Get Running

### 1. Install Node.js (if not installed)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Navigate to Project
```bash
cd ~/EV_CHARGING_KIOSK
```

### 3. Run Setup Script
```bash
chmod +x setup-raspberry-pi.sh
./setup-raspberry-pi.sh
```

### 4. Start Application
```bash
npm start
```

### 5. Access Application
Open browser and go to:
- `http://localhost:3000` (on Raspberry Pi)
- `http://<raspberry-pi-ip>:3000` (from other devices)

To find IP address: `hostname -I`

---

## Enable Auto-Start on Boot

```bash
chmod +x install-service.sh
sudo ./install-service.sh
sudo systemctl start ev-charging-kiosk.service
```

---

## Manual Steps (if scripts don't work)

```bash
# Install dependencies
npm install

# Build application
npm run build

# Start server
npm run serve
```

---

## Troubleshooting

**Port in use?** Change port: `PORT=8080 npm run serve`

**Build fails?** Increase memory: `NODE_OPTIONS="--max-old-space-size=2048" npm run build`

**Service won't start?** Check logs: `sudo journalctl -u ev-charging-kiosk.service -f`

For detailed instructions, see [RASPBERRY_PI_SETUP.md](./RASPBERRY_PI_SETUP.md)

