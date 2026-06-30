# Child Safety Watch (Google Find Hub EID Multiplexing)

> **This is a confidential project, Please do not discuss it outside of this organisation**

This project is a highly customized implementation of a Child Safety Watch tracker that leverages the **Google Find My Device (Find Hub) Network**. 

By bypassing the limitations of Google's network (which strips custom telemetry bytes from BLE advertisements), this project implements a unique **EID Multiplexing** architecture to globally exfiltrate physical hardware states without relying on custom scanner apps.

## Features
- **Global Tracking**: Tracks location using the official Google Find Hub network (over a billion Android devices).
- **Strap Removal Detection**: Uses a TTP223 capacitive touch sensor to instantly detect if the watch is removed from the child's wrist.
- **SOS Button**: Hardware button for emergency alerts.
- **EID Multiplexing**: The ESP32-C3 seamlessly rotates between 3 different Ephemeral IDs (EIDs) to report its state (Normal, SOS, Strap Removed) to the network.
- **Parallel Backend Inference**: A custom Python API server queries Google for all 3 EIDs simultaneously and infers the active physical state based on the most recent location timestamp.
- **Real-time Dashboard**: A React-based web dashboard (Vite) that displays the live location and flashes alerts if an SOS or Strap Removal is detected.

## Hardware Requirements
- **ESP32-C3 Super Mini**: Ultra-small form factor microcontroller.
- **TTP223 Touch Sensor**: Active-HIGH digital capacitive touch sensor connected to `GPIO 4`.
- **SOS Button**: Momentary push button connected to `GPIO 9` (pulls to GND).

## System Architecture
Please read the `.agents/` documentation folder for a deep dive into the architecture:
- [`eid_multiplexing_architecture.md`](.agents/eid_multiplexing_architecture.md)
- [`hardware_guidelines.md`](.agents/hardware_guidelines.md)
- [`api_backend_rules.md`](.agents/api_backend_rules.md)

## Getting Started

### 1. Provision the EIDs
Run the provisioning script to register 3 virtual trackers to your Google Account.
```bash
python scripts/register_3_watches.py
```

### 2. Flash the Firmware
Open `ESP32Firmware/ESP32-C3-GoogleHub/ESP32-C3-GoogleHub.ino` in Arduino IDE or PlatformIO. Ensure your EIDs are correctly pasted into the configuration section and flash it to your ESP32-C3.

### 3. Run the Backend API
Start the Flask server which aggregates the data from Google.
```bash
python api_server.py
```

### 4. Run the Dashboard
In a separate terminal, start the React frontend.
```bash
cd dashboard
npm install
npm run dev
```
