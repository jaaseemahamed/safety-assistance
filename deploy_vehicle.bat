@echo off
echo ==========================================
echo   Drowsiness Detector Vehicle Deployment
echo ==========================================

echo [1/3] Checking Frontend Build...
if exist "dist\index.html" (
    echo Frontend build found.
) else (
    echo Frontend build NOT found. Building now...
    call npm install
    call npm run build
    if errorlevel 1 (
        echo Failed to build frontend. Exiting.
        pause
        exit /b 1
    )
)

echo [2/3] Installing Python Dependencies...
pip install -r server/requirements.txt
if errorlevel 1 (
    echo Failed to install dependencies. Exiting.
    pause
    exit /b 1
)

echo [3/3] Starting Server...
echo The application will be available at http://localhost:5000
echo Press Ctrl+C to stop.
cd server
python app.py
pause
