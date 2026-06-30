#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEAdvertising.h>

// Your 20-byte Advertisement Key (EID) retrieved from the GoogleFindMyTools Python script
const char* EID_STRING = "3c7a00ec9509e42891537d05f9fa4b557d5814f9";

// Helper function to convert hex string to byte array
void hex_string_to_bytes(const char *hex, uint8_t *bytes, size_t len) {
    for (size_t i = 0; i < len; i++) {
        sscanf(hex + 2 * i, "%2hhx", &bytes[i]);
    }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("--- Google Find My Device (FMDN) Tracker Init ---");

  // Initialize BLE Device
  BLEDevice::init("ESP32-S3-FMDN");

  // Create BLE Advertising object
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();

  // Create Advertisement Data object
  BLEAdvertisementData oAdvertisementData;
  
  // Set flags: 0x06 (LE General Discoverable Mode & BR/EDR Not Supported)
  oAdvertisementData.setFlags(0x06);

  // FMDN Service Data payload:
  // - Byte 0: Frame Type (0x41 = Unwanted tracking protection mode enabled)
  // - Bytes 1-20: 20-byte Ephemeral Identifier (EID / Advertisement Key)
  // - Byte 21: Hashed flags (0x00)
  uint8_t service_data[22];
  service_data[0] = 0x41; // Frame Type
  
  // Parse the EID string into the service data payload
  hex_string_to_bytes(EID_STRING, &service_data[1], 20);
  
  service_data[21] = 0x00; // Hashed flags

  // Convert service data payload to Arduino String for setServiceData (ESP32 core 3.x)
  String service_data_str = "";
  for (int i = 0; i < 22; i++) {
    service_data_str.concat((char)service_data[i]);
  }

  // Set Service Data for Google FMDN UUID 0xFEAA (UUID is 16-bit)
  oAdvertisementData.setServiceData(BLEUUID((uint16_t)0xFEAA), service_data_str);

  // Assign the Advertisement Data to the advertising object
  pAdvertising->setAdvertisementData(oAdvertisementData);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x06);  // Helps with compatibility issues on some devices
  pAdvertising->setMinPreferred(0x12);
  
  // Start Advertising
  pAdvertising->start();
  Serial.println("FMDN Beacon is now advertising!");
}

void loop() {
  // Loop delay. The BLE stack manages advertising automatically in the background.
  delay(10000);
}
