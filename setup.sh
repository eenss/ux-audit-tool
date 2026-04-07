#!/bin/bash
# UX Audit Screenshot Tool - Mac Setup Script
# Usage: Open Terminal, navigate to this folder, run: bash setup.sh

set -e

echo ""
echo "========================================="
echo "  UX Audit Screenshot Tool - Setup (Mac)"
echo "========================================="
echo ""

# 1. Check Node.js
if ! command -v node &> /dev/null; then
  echo "[!] Node.js is not installed."
  echo "    Please install it from: https://nodejs.org/"
  echo "    Download the LTS version, run the installer, then re-run this script."
  echo ""
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "[!] Node.js version $(node -v) is too old. Version 18 or higher is required."
  echo "    Please update from: https://nodejs.org/"
  exit 1
fi
echo "[OK] Node.js $(node -v)"

# 2. Check Chrome
if [ -d "/Applications/Google Chrome.app" ]; then
  echo "[OK] Google Chrome found"
else
  echo "[!] Google Chrome not found in /Applications."
  echo "    Please install Chrome from: https://www.google.com/chrome/"
  exit 1
fi

# 3. Install dependencies
echo ""
echo "Installing dependencies... (this may take a minute)"
npm install
echo "[OK] Dependencies installed"

# 4. Install Playwright Chromium
echo ""
echo "Installing Playwright browser... (this may take a few minutes)"
npx playwright install chromium
echo "[OK] Playwright browser installed"

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "To start the tool, run:"
echo "  bash start.sh"
echo ""
echo "Or manually:"
echo "  node server.js"
echo ""
echo "Then open http://localhost:3200 in your browser."
echo ""
