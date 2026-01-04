# Drowsiness Detector - Vehicle Deployment

A complete, production-ready drowsiness detection system designed for deployment to vehicle internal devices.

## Overview

This application uses computer vision and MediaPipe's Face Landmarker to detect driver drowsiness in real-time by analyzing Eye Aspect Ratio (EAR). The system is packaged as a unified Python application that serves both the backend API and the React frontend.

## Features

- **Real-time Detection**: Analyzes facial landmarks to detect eye closure
- **Unified Deployment**: Single Python server serves both API and UI
- **Production Logging**: File and console logging for debugging
- **Containerized**: Docker support for easy deployment to vehicle devices
- **Cross-platform**: Works on Windows, Linux, and embedded systems

## Quick Start

### Option 1: Using the Deployment Script (Windows)

```bash
# Simply run the deployment script
deploy_vehicle.bat
```

This will:
1. Check if the frontend is built (and build it if needed)
2. Install Python dependencies
3. Start the server on `http://localhost:5000`

### Option 2: Manual Setup

```bash
# 1. Build the frontend
npm install
npm run build

# 2. Install Python dependencies
cd server
pip install -r requirements.txt

# 3. Run the server
python app.py
```

The application will be available at `http://localhost:5000`

## Docker Deployment (Recommended for Vehicles)

### Build the Docker Image

```bash
docker build -t drowsiness-detector:latest .
```

### Run the Container

```bash
docker run -d -p 5000:5000 --restart always drowsiness-detector:latest
```

### Transfer to Vehicle Device

```bash
# Save the image to a file
docker save -o drowsiness_app.tar drowsiness-detector:latest

# Transfer the .tar file to the vehicle device, then:
docker load -i drowsiness_app.tar
docker run -d -p 5000:5000 --restart always drowsiness-detector:latest
```

## Architecture

```
drowsiness-detector/
├── src/                    # React frontend source
├── dist/                   # Built frontend (generated)
├── server/
│   ├── app.py             # Python Flask server (serves API + frontend)
│   ├── face_landmarker.task  # MediaPipe model
│   └── requirements.txt   # Python dependencies
├── Dockerfile             # Container configuration
└── deploy_vehicle.bat     # Windows deployment script
```

## API Endpoints

### POST /analyze
Analyzes an image for drowsiness detection.

**Request:**
- Content-Type: `multipart/form-data`
- Field: `image` (image file)

**Response:**
```json
{
  "success": true,
  "ear": 0.28,
  "isEyesClosed": false,
  "details": {
    "leftEAR": 0.27,
    "rightEAR": 0.29,
    "threshold": 0.25
  }
}
```

## Configuration

- **Port**: Default is `5000` (change in `server/app.py`)
- **EAR Threshold**: Default is `0.25` (adjust in `server/app.py`)
- **Logging**: Logs are written to `drowsiness_detector.log`

## Requirements

### Python Dependencies
- Flask
- Flask-CORS
- MediaPipe
- NumPy
- OpenCV (headless)
- Waitress

### System Requirements
- Python 3.9+
- Node.js 18+ (for building frontend)
- 2GB RAM minimum
- Camera access (for live detection)

## Troubleshooting

### Model Not Found
Ensure `face_landmarker.task` is in the `server/` directory.

### Port Already in Use
Change the port in `server/app.py`:
```python
app.run(host='0.0.0.0', port=5000, debug=False)  # Change 5000 to another port
```

### Frontend Not Loading
Verify the `dist/` folder exists and contains `index.html`. Rebuild if needed:
```bash
npm run build
```

## License

This project uses MediaPipe, which is licensed under Apache 2.0.
