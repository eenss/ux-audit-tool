@echo off
REM UX Audit Screenshot Tool - Windows Setup Script
REM Usage: Double-click this file, or open PowerShell and run: .\setup.bat

echo.
echo =========================================
echo   UX Audit Screenshot Tool - Setup (Win)
echo =========================================
echo.

REM 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Node.js is not installed.
    echo     Please install it from: https://nodejs.org/
    echo     Download the LTS version, run the installer, then re-run this script.
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
echo [OK] Node.js found

REM 2. Check Chrome
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    echo [OK] Google Chrome found
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    echo [OK] Google Chrome found
) else (
    echo [!] Google Chrome not found.
    echo     Please install Chrome from: https://www.google.com/chrome/
    pause
    exit /b 1
)

REM 3. Install dependencies
echo.
echo Installing dependencies... (this may take a minute)
call npm install
if %errorlevel% neq 0 (
    echo [!] npm install failed. Please check the error above.
    pause
    exit /b 1
)
echo [OK] Dependencies installed

REM 4. Install Playwright Chromium
echo.
echo Installing Playwright browser... (this may take a few minutes)
call npx playwright install chromium
if %errorlevel% neq 0 (
    echo [!] Playwright install failed. Please check the error above.
    pause
    exit /b 1
)
echo [OK] Playwright browser installed

echo.
echo =========================================
echo   Setup complete!
echo =========================================
echo.
echo To start the tool, double-click: start.bat
echo Or run: node server.js
echo.
echo Then open http://localhost:3200 in your browser.
echo.
pause
