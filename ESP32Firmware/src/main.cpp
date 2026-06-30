#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEAdvertising.h>

// Include system headers for setting MAC address across different Core versions:
#include "esp_system.h"
#if defined(ESP_ARDUINO_VERSION_VAL)
  #if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    #include "esp_mac.h"
  #endif
#endif

// Onboard LED configurations depending on the target board
#if defined(CONFIG_IDF_TARGET_ESP32C3)
  // ESP32-C3 Super Mini onboard LED is on GPIO 8 (Active Low)
  #define ONBOARD_LED 8
  #define LED_ACTIVE_LEVEL LOW
#elif defined(CONFIG_IDF_TARGET_ESP32S3)
  // ESP32-S3 DevKit onboard LED is typically on GPIO 48 (Active High)
  #define ONBOARD_LED 48
  #define LED_ACTIVE_LEVEL HIGH
#else
  // Standard ESP32 WROOM-32 onboard LED is on GPIO 2 (Active High)
  #define ONBOARD_LED 2
  #define LED_ACTIVE_LEVEL HIGH
#endif

// Your 20-byte Advertisement Key (EID) retrieved from the GoogleFindMyTools Python script
const char* EID_STRING = "3c7a00ec9509e42891537d05f9fa4b557d5814f9";

// ─── Configuration ───
// Advertising cycle interval in milliseconds before rotating MAC (via reboot).
#define ADV_CYCLE_MS    10000

// ─── Telemetry State in RTC Memory ───
// These variables persist across software restarts (ESP.restart())
RTC_DATA_ATTR bool state_initialized = false;
RTC_DATA_ATTR uint8_t current_mode_index = 0;
RTC_DATA_ATTR uint8_t event_counter = 43;
RTC_DATA_ATTR uint8_t battery_level = 92;

// List of event modes to cycle through for testing:
const uint8_t event_modes[] = {
  0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40
};
const size_t NUM_MODES = sizeof(event_modes) / sizeof(event_modes[0]);

// Helper function to convert hex string to byte array
void hex_string_to_bytes(const char *hex, uint8_t *bytes, size_t len) {
    for (size_t i = 0; i < len; i++) {
        sscanf(hex + 2 * i, "%2hhx", &bytes[i]);
    }
}

// Helper to turn LED ON
void ledOn() {
    digitalWrite(ONBOARD_LED, LED_ACTIVE_LEVEL);
}

// Helper to turn LED OFF
void ledOff() {
    digitalWrite(ONBOARD_LED, LED_ACTIVE_LEVEL == LOW ? HIGH : LOW);
}

void setup() {
  Serial.begin(115200);
  
  // Configure the onboard LED
  pinMode(ONBOARD_LED, OUTPUT);
  ledOff();

  // Initialize state on first boot
  if (!state_initialized) {
    current_mode_index = 0;
    event_counter = 43;
    battery_level = 92;
    state_initialized = true;
  }

  // Generate a random locally administered unicast MAC address
  uint8_t new_mac[6];
  for (int i = 0; i < 6; i++) {
    new_mac[i] = esp_random() & 0xFF;
  }
  new_mac[0] = (new_mac[0] & 0xFE) | 0x02; // Bit 0 must be 0 (unicast), Bit 1 must be 1 (locally administered)

  // Set the base MAC address before initializing BLE
  esp_err_t err = esp_base_mac_addr_set(new_mac);
  
  // Visual startup indication: Blink LED twice
  for (int i = 0; i < 2; i++) {
    ledOn();
    delay(100);
    ledOff();
    delay(100);
  }

  Serial.println("╔══════════════════════════════════════════════════╗");
  Serial.println("║   FMDN Tracker – Unified Board Firmware          ║");
  Serial.println("║   Custom Telemetry Protocol v1                  ║");
  Serial.println("║   MAC Randomization: ENABLED (via Restart)       ║");
  Serial.println("╚══════════════════════════════════════════════════╝");
  if (err == ESP_OK) {
    Serial.printf("Generated random MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
                  new_mac[0], new_mac[1], new_mac[2], new_mac[3], new_mac[4], new_mac[5]);
  } else {
    Serial.printf("Failed to set random MAC: 0x%X\n", err);
  }
  Serial.printf("Current State: Mode=0x%02X, Counter=%d, Battery=%d%%\n", 
                event_modes[current_mode_index], event_counter, battery_level);

  // Initialize BLE Device
  BLEDevice::init("FMDN-Tracker-Unified");

  // Get BLE Advertising object
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();

  // Build service data
  uint8_t service_data[25];
  service_data[0] = 0x41; // Frame Type
  hex_string_to_bytes(EID_STRING, &service_data[1], 20);
  service_data[21] = 0x00; // Hashed flags
  service_data[22] = event_modes[current_mode_index];
  service_data[23] = battery_level;
  service_data[24] = event_counter;

  // Create Advertisement Data object
  BLEAdvertisementData oAdvertisementData;
  oAdvertisementData.setFlags(0x06);

  // Convert service data payload to std::string
  std::string service_data_str((char*)service_data, 25);
  oAdvertisementData.setServiceData(BLEUUID((uint16_t)0xFEAA), service_data_str);

  // Assign the Advertisement Data to the advertising object
  pAdvertising->setAdvertisementData(oAdvertisementData);
  pAdvertising->setScanResponse(false);
  
  // Set advertising intervals to save power while remaining discoverable
  pAdvertising->setMinInterval(0x0640);
  pAdvertising->setMaxInterval(0x0640);
  
  // Start Advertising
  pAdvertising->start();
  Serial.println("FMDN Beacon is now active and advertising!");
  
  // Blink LED once to indicate success
  ledOn();
  delay(500);
  ledOff();
}

void loop() {
  // Wait 10 seconds before switching to the next state and resetting
  delay(ADV_CYCLE_MS);

  // 1. Cycle to the next event mode
  current_mode_index = (current_mode_index + 1) % NUM_MODES;

  // 2. Increment monotonic event counter
  event_counter = (event_counter + 1) % 256;

  // 3. Slowly drain battery level for demonstration
  if (battery_level > 10) {
    battery_level--;
  } else {
    battery_level = 92; // Reset back to full
  }

  Serial.println("Preparing for restart to rotate BLE MAC address...");
  
  // Blink LED twice to indicate state transition
  for (int i = 0; i < 2; i++) {
    ledOn();
    delay(50);
    ledOff();
    delay(50);
  }

  // Trigger software reset to apply new random MAC on next boot
  ESP.restart();
}
