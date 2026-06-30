# Google Find My Device (FMDN) ESP32-S3 Arduino Tracker

This sketch allows you to turn your **ESP32-S3** board into a Google Find My Device tracker using the Arduino IDE.

## Requirements

1. **Arduino IDE**: Make sure you have the [Arduino IDE](https://www.arduino.cc/en/software) installed.
2. **ESP32 Board Package**:
   - Open Arduino IDE.
   - Go to **File > Preferences**.
   - In **Additional Boards Manager URLs**, paste this link: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_dev_index.json` (or standard `package_esp32_index.json`).
   - Go to **Tools > Board > Boards Manager...**, search for `esp32` by Espressif, and install the package.

## How to Flash

1. Open the [ESP32-S3-Arduino.ino](ESP32-S3-Arduino.ino) file in Arduino IDE.
2. Connect your **ESP32-S3** board to your computer using a USB cable.
3. Select your board and port:
   - Go to **Tools > Board > ESP32 Arduino** and select **ESP32S3 Dev Module** (or your specific S3 board model).
   - Go to **Tools > Port** and select the COM port of your connected board.
4. Verify/Compile the sketch (the checkmark icon) to make sure there are no errors.
5. Click **Upload** (the arrow icon) to flash the firmware to your ESP32-S3.
6. Open the **Serial Monitor** (`Ctrl+Shift+M`) and set the baud rate to **115200** to see status messages.

---

*Note: The advertisement key (`EID_STRING`) has been pre-configured for your registered device. If you register a different device in the future, just run `main.py` again and replace the `EID_STRING` value in the sketch.*
