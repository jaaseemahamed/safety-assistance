# Vehicle Motherboard Integration Guide

This guide explains how to integrate the drowsiness detection system with a vehicle's internal systems (ECU/motherboard).

## Integration Approaches

### 1. **Standalone Embedded Computer (Recommended for Prototyping)**

Install a small computer (like Raspberry Pi, NVIDIA Jetson Nano, or industrial PC) in the vehicle that runs independently.

**Hardware Setup:**
- **Computer**: Raspberry Pi 4 (4GB+) or NVIDIA Jetson Nano
- **Camera**: USB webcam or CSI camera module
- **Display**: Connect to vehicle's infotainment screen via HDMI
- **Power**: 12V to 5V converter (vehicle battery to device)
- **Storage**: microSD card (32GB+)

**Installation Steps:**
1. Install the computer in a secure location (under dashboard/behind infotainment)
2. Mount camera on dashboard facing the driver
3. Connect power via vehicle's 12V accessory port (turns on with ignition)
4. Run the drowsiness detector on boot (systemd service)

**Auto-start Configuration (Linux/Raspberry Pi):**
```bash
# Create systemd service
sudo nano /etc/systemd/system/drowsiness-detector.service
```

```ini
[Unit]
Description=Drowsiness Detector Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/drowsiness-detector/server
ExecStart=/usr/bin/python3 /home/pi/drowsiness-detector/server/app.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable drowsiness-detector.service
sudo systemctl start drowsiness-detector.service
```

### 2. **CAN Bus Integration (Advanced - Production Vehicles)**

For deeper integration with the vehicle's systems, use the CAN (Controller Area Network) bus.

**What You Can Do:**
- Send alerts to the instrument cluster
- Trigger warning sounds through vehicle speakers
- Log events to vehicle's diagnostic system
- Integrate with existing driver monitoring systems

**Required Hardware:**
- CAN bus adapter (e.g., MCP2515, PCAN-USB)
- Access to vehicle's OBD-II port or direct CAN bus connection

**Python CAN Integration Example:**
```python
import can
import logging

# Initialize CAN bus
bus = can.interface.Bus(channel='can0', bustype='socketcan')

def send_drowsiness_alert(severity_level):
    """
    Send drowsiness alert via CAN bus
    severity_level: 0=normal, 1=warning, 2=critical
    """
    # Example CAN message (customize based on vehicle protocol)
    msg = can.Message(
        arbitration_id=0x123,  # Custom ID for drowsiness alerts
        data=[0x01, severity_level, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
        is_extended_id=False
    )
    
    try:
        bus.send(msg)
        logging.info(f"Sent CAN alert: severity {severity_level}")
    except can.CanError:
        logging.error("Failed to send CAN message")
```

**Modify app.py to send CAN alerts:**
```python
# Add to app.py after drowsiness detection
if is_eyes_closed:
    consecutive_frames += 1
    if consecutive_frames > ALERT_THRESHOLD:
        send_drowsiness_alert(severity_level=2)  # Critical
elif avg_ear < EAR_THRESHOLD * 1.2:
    send_drowsiness_alert(severity_level=1)  # Warning
```

### 3. **Android Automotive Integration**

Many modern vehicles use Android Automotive OS for their infotainment systems.

**Deployment:**
1. Package as an Android APK using frameworks like Kivy or BeeWare
2. Install via ADB (Android Debug Bridge)
3. Set as a system app with appropriate permissions

**Alternative:** Run as a web app in the vehicle's browser (Chrome/WebView)

### 4. **Infotainment System Integration**

**For vehicles with Linux-based infotainment:**
- SSH into the infotainment system (if accessible)
- Deploy Docker container or install directly
- Configure to auto-start with the system

**For vehicles with proprietary systems:**
- May require manufacturer SDK/API access
- Contact vehicle manufacturer for developer programs

## Hardware Connections

### Power Supply
```
Vehicle 12V Battery
    ↓
12V → 5V DC Converter (3A minimum)
    ↓
Embedded Computer (Raspberry Pi/Jetson)
    ↓
USB Camera
```

**Important:** Use a converter with ignition sensing to prevent battery drain when vehicle is off.

### Camera Placement
- **Position**: Dashboard, facing driver's seat
- **Angle**: Capture full face (eyes, nose, mouth)
- **Distance**: 50-100cm from driver
- **Lighting**: Consider IR camera for night driving

### Display Options
1. **Dedicated small display** (3.5"-7" touchscreen)
2. **Vehicle's infotainment screen** (HDMI/CarPlay/Android Auto)
3. **Heads-up display (HUD)** integration
4. **Instrument cluster** (requires CAN bus integration)

## Communication Protocols

### GPIO Alerts (Simple)
Use GPIO pins to trigger external alerts:

```python
import RPi.GPIO as GPIO

# Setup
BUZZER_PIN = 18
GPIO.setmode(GPIO.BCM)
GPIO.setup(BUZZER_PIN, GPIO.OUT)

# Trigger alert
def trigger_buzzer():
    GPIO.output(BUZZER_PIN, GPIO.HIGH)
    time.sleep(0.5)
    GPIO.output(BUZZER_PIN, GPIO.LOW)
```

### Serial Communication (UART)
Connect to vehicle's diagnostic port:

```python
import serial

ser = serial.Serial('/dev/ttyUSB0', 9600)

def send_alert_serial(alert_type):
    message = f"DROWSY:{alert_type}\n"
    ser.write(message.encode())
```

### MQTT (Wireless Communication)
For fleet management or remote monitoring:

```python
import paho.mqtt.client as mqtt

client = mqtt.Client()
client.connect("broker.example.com", 1883)

def publish_alert(ear_value, is_drowsy):
    payload = {
        "vehicle_id": "VEH001",
        "timestamp": time.time(),
        "ear": ear_value,
        "alert": is_drowsy
    }
    client.publish("vehicle/drowsiness", json.dumps(payload))
```

## Safety Considerations

⚠️ **CRITICAL SAFETY NOTES:**

1. **Redundancy**: This system should be supplementary, not replace driver responsibility
2. **Testing**: Extensive testing required before production deployment
3. **Fail-safe**: System should fail gracefully without affecting vehicle operation
4. **Regulations**: Check local laws regarding driver monitoring systems
5. **Privacy**: Ensure compliance with data protection regulations (GDPR, etc.)
6. **Certification**: May require automotive certification (ISO 26262 for functional safety)

## Recommended Deployment Path

**Phase 1: Prototype (Current)**
- Standalone Raspberry Pi/Jetson
- USB camera
- Separate display or laptop
- Manual start

**Phase 2: Semi-integrated**
- Permanent installation in vehicle
- Auto-start on ignition
- GPIO buzzer/LED alerts
- Connect to infotainment display

**Phase 3: Full Integration**
- CAN bus integration
- Instrument cluster alerts
- Data logging to vehicle ECU
- Integration with ADAS systems

## Example: Raspberry Pi Installation

```bash
# 1. Setup Raspberry Pi OS
# 2. Install dependencies
sudo apt-get update
sudo apt-get install python3-pip python3-opencv
pip3 install -r requirements.txt

# 3. Copy project files
scp -r drowsiness-detector/ pi@raspberrypi.local:/home/pi/

# 4. Setup auto-start (see systemd service above)

# 5. Configure camera
sudo raspi-config  # Enable camera interface

# 6. Test
python3 /home/pi/drowsiness-detector/server/app.py
```

## Next Steps

1. **Choose your integration approach** based on your vehicle type and technical capability
2. **Acquire necessary hardware** (embedded computer, camera, power supply)
3. **Test in a safe environment** before vehicle installation
4. **Consider professional installation** for permanent mounting and wiring
5. **Consult vehicle manufacturer** for official integration options

For commercial deployment, consider partnering with automotive suppliers or OEMs who have experience with vehicle integration and certification processes.
