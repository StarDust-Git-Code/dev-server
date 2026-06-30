# Apple Find My (OpenHaystack) ESP32 Firmware (Arduino IDE)

This sketch allows you to turn your **ESP32-C3** (like the ESP32-C3 Super Mini) or **ESP32-S3** board into an Apple Find My compatible beacon. It spoofs a custom AirTag-like accessory, transmitting standard Find My advertisements to be located globally by any nearby Apple devices.

## How it works
1. **Public Key Decoding:** Decodes a 28-byte Base64 representation of a P-224 Elliptic Curve public key.
2. **MAC Address Spoofing:** Configures a random static Bluetooth MAC address derived from the public key, as required by the Apple Find My protocol.
3. **BLE Raw Advertisement:** Structures a 31-byte raw BLE advertisement package containing Apple's Company Identifier (`0x004c`), Offline Finding service (`0x12`), the 22-byte public key payload, and key flags.

## Prerequisites
1. **Arduino IDE** (with the Espressif `esp32` board package installed).
2. **An Accessory Key Pair:**
   - You need a P-224 public key.
   - You can generate this using [OpenHaystack macOS App](https://github.com/seemoo-lab/openhaystack) or using the [FindMy.py](https://github.com/malmeloo/FindMy.py) python library.
   - Example using `FindMy.py` CLI / Python console:
     ```python
     from findmy import FindMyAccessory
     # Generate a new custom tracking key
     accessory = FindMyAccessory.create("My Custom Tag")
     print("Base64 Public Key:", accessory.public_key.to_b64())
     ```

## Flashing Instructions
1. Open the [AppleFindMy-ESP32.ino](AppleFindMy-ESP32.ino) file in your Arduino IDE.
2. Replace `BASE64_PUBLIC_KEY` on line 12 with your generated 28-byte Base64 public key:
   ```cpp
   const char* BASE64_PUBLIC_KEY = "your_28_byte_base64_public_key_here=";
   ```
3. Update `ONBOARD_LED` configuration on line 9 depending on your board:
   - For **ESP32-C3 Super Mini**: GPIO 8 (Active Low, default).
   - For **ESP32-S3 Dev Kits**: Set to your board's LED GPIO pin (e.g., 48, 2, etc.).
4. Select your board configuration under **Tools > Board > ESP32 Arduino**:
   - For C3: Select **ESP32C3 Dev Module**.
   - For S3: Select **ESP32S3 Dev Module**.
5. Connect your board via USB.
6. Click **Upload** to compile and flash the firmware.
7. Open the **Serial Monitor** at `115200` baud to verify it boots, decodes the key, spoofs the derived MAC, and starts advertising.
