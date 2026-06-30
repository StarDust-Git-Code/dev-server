# Google Find My Device (FMDN) ESP32-C3 Super Mini Tracker

This Arduino sketch is optimized specifically for the ultra-compact **ESP32-C3 Super Mini** board, turning it into a Google Find My Device tracker.

## Features Added

1. **LED Status Indicator**: The onboard blue LED (GPIO 8, active low) blinks twice on power-up/reset and blinks once for 500ms after successfully initializing the BLE stack and starting the advertisement.
2. **Power-Optimized Advertising Interval**: Configured advertising intervals to 1000ms (1.0 second) to balance trackability and battery consumption.

## Requirements

1. **Arduino IDE**: Ensure you have the [Arduino IDE](https://www.arduino.cc/en/software) installed.
2. **ESP32 Board Package**:
   - Go to **File > Preferences** in Arduino IDE.
   - Under **Additional Boards Manager URLs**, ensure this link is present: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_dev_index.json` (or standard `package_esp32_index.json`).
   - Go to **Tools > Board > Boards Manager...**, search for `esp32` by Espressif, and install the package (version 2.0.x or 3.x).

## Flashing Instructions

1. Open the [ESP32-C3-SuperMini.ino](ESP32-C3-SuperMini.ino) file in the Arduino IDE.
2. The tracker advertisement key (`EID_STRING`) has been pre-configured with your registered tracker (`test-1_C3`):
   ```cpp
   const char* EID_STRING = "3c7a00ec9509e42891537d05f9fa4b557d5814f9";
   ```
3. Connect your **ESP32-C3 Super Mini** board to your computer using a USB-C cable.
4. Set up the board settings:
   - Go to **Tools > Board > ESP32 Arduino** and select **ESP32C3 Dev Module**.
   - Go to **Tools > Port** and choose the COM port matching your board.
   - **Crucial for ESP32-C3 Super Mini**: Under **Tools**, ensure **USB CDC On Boot** is set to **Enabled**. (This ensures serial communications and auto-flashing work correctly).
5. Compile and upload the sketch using the **Upload** button (the right arrow icon).
6. Once the upload finishes:
   - The onboard blue LED will flash twice to indicate startup.
   - It will blink once more for 500ms to confirm the BLE beacon has successfully started advertising.
7. Open the Serial Monitor (`Ctrl+Shift+M`) at **115200 baud** to see debug logs.
