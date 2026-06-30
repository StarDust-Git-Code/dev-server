# Hardware Implementation Rules

## Touch & Wear Detection on ESP32-C3
When implementing "wear detection" or capacitive touch features on the ESP32-C3:

1. **No Hardware Touch Support**: Unlike the classic ESP32 or ESP32-S2/S3, the **ESP32-C3 does NOT have a hardware capacitive touch peripheral** (no `touchRead()` support).
2. **Software Touch Limitations**: Relying on software capacitive touch (e.g., ADCTouch or digital loop counting with stray capacitance) on a single bare wire is highly unreliable, especially for outdoor wearables like a Child Safety Watch where environmental noise (Mains Hum) is absent.
3. **The Solution (TTP223)**: Always mandate the use of a dedicated touch IC, such as the **TTP223** or **AT42QT1010**, for capacitive touch or strap removal detection.
   - The TTP223 connects to a single copper pad in the strap and outputs a clean digital `HIGH` or `LOW` to the ESP32-C3.
   - It requires standard digital reading (`digitalRead`) without internal pullups, as the IC drives the pin directly.

## GPIO Considerations
- **ADC Pins**: The ESP32-C3 has ADC1 on GPIOs 0-4. ADC2 pins share routing with Wi-Fi/BLE and should be avoided for analog reads if BLE is active. 
- **Boot Pins**: GPIO 9 is the standard BOOT button on many ESP32-C3 boards (like the Super Mini). It can be safely used as an active-LOW input (e.g., for an SOS button) but requires an internal pull-up.
