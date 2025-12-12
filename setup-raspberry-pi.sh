#!/bin/bash

# EV Charging Kiosk - Raspberry Pi Setup Script
# This script automates the setup process on Raspberry Pi

set -e

echo "🚀 EV Charging Kiosk - Raspberry Pi Setup"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "📦 Installing Node.js..."
    
    # Detect architecture
    ARCH=$(uname -m)
    if [ "$ARCH" = "aarch64" ]; then
        echo "Detected 64-bit architecture"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    else
        echo "Detected 32-bit architecture"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    fi
    
    sudo apt-get install -y nodejs
    
    echo "✅ Node.js installed"
else
    NODE_VERSION=$(node --version)
    echo "✅ Node.js is installed: $NODE_VERSION"
fi

# Check Node.js version
NODE_MAJOR=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "⚠️  Warning: Node.js version should be 18 or higher"
    echo "Current version: $(node --version)"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install dependencies
echo ""
echo "📦 Installing npm dependencies..."
npm install

# Build the application
echo ""
echo "🔨 Building application..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "❌ Build failed - dist directory not found"
    exit 1
fi

echo ""
echo "✅ Setup completed successfully!"
echo ""
echo "To start the application, run:"
echo "  npm run serve"
echo ""
echo "Or to build and serve in one command:"
echo "  npm start"
echo ""
echo "The application will be available at:"
echo "  http://localhost:3000"
echo "  http://$(hostname -I | awk '{print $1}'):3000"
echo ""

