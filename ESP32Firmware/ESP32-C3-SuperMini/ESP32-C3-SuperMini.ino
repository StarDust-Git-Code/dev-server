  #include <BLEDevice.h>
  #include <BLEUtils.h>
  #include <BLEAdvertising.h>
  #include <BLEServer.h>
  #include <BLE2902.h>
  #include "esp_bt.h"
  #include "nimble/ble.h"
  #include "host/ble_hs.h"

  // Onboard Blue LED on ESP32-C3 Super Mini (Active Low)
  #define ONBOARD_LED 8

  // Advertisement Key from GoogleFindMyTools registration
  const char* EID_STRING = "73e064d787129722a23cbc0239619b0192f3f418";

  // ─── Configuration ───
  #define STATE_UPDATE_MS    2000   // Telemetry cycle interval
  #define MAC_ROTATE_CYCLES  5     // Rotate MAC every N cycles

  // Event modes to cycle
  const uint8_t event_modes[] = {
    0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40
  };
  const size_t NUM_MODES = sizeof(event_modes) / sizeof(event_modes[0]);

  // Global state
  BLEAdvertising *pAdvertising;
  BLEServer *pServer;
  BLECharacteristic *pBatteryCharacteristic;

  uint8_t service_data[25];

  // Telemetry state
  uint8_t current_mode_index = 0;
  uint8_t event_counter = 43;
  uint8_t battery_level = 92;
  uint32_t cycle_count = 0;

  // Hex string to byte array
  void hex_string_to_bytes(const char *hex, uint8_t *bytes, size_t len) {
    for (size_t i = 0; i < len; i++) {
      sscanf(hex + 2 * i, "%2hhx", &bytes[i]);
    }
  }

  // Randomize BLE MAC address using NimBLE API (no reboot needed)
  void randomizeMAC() {
    uint8_t addr[6];
    for (int i = 0; i < 6; i++) {
      addr[i] = (uint8_t)random(0, 256);
    }
    // Set top 2 bits = 11 for "Random Static Address" per BLE spec
    addr[5] |= 0xC0;

    int rc = ble_hs_id_set_rnd(addr);
    if (rc == 0) {
      Serial.printf("🔀 MAC rotated → %02X:%02X:%02X:%02X:%02X:%02X\n",
        addr[5], addr[4], addr[3], addr[2], addr[1], addr[0]);
    } else {
      Serial.printf("⚠ MAC rotation failed (rc=%d)\n", rc);
    }
  }

  // Build and apply BLE advertisement payload
  void applyAdvertisement() {
    BLEAdvertisementData oAdvertisementData;
    oAdvertisementData.setFlags(0x06);

    String service_data_str = "";
    for (int i = 0; i < 25; i++) {
      service_data_str.concat((char)service_data[i]);
    }
    oAdvertisementData.setServiceData(BLEUUID((uint16_t)0xFEAA), service_data_str);

    pAdvertising->setAdvertisementData(oAdvertisementData);
    pAdvertising->setScanResponse(false);
  }

  void setup() {
    Serial.begin(115200);
    pinMode(ONBOARD_LED, OUTPUT);
    digitalWrite(ONBOARD_LED, HIGH); // LED OFF

    // Startup blink
    for (int i = 0; i < 2; i++) {
      digitalWrite(ONBOARD_LED, LOW);
      delay(100);
      digitalWrite(ONBOARD_LED, HIGH);
      delay(100);
    }

    Serial.println("--- FMDN ESP32-C3 Super Mini ---");
    Serial.println(">>> Random MAC | Max TX | Fast Send | GATT Services");

    // Init BLE
    BLEDevice::init("FMDN-Tracker");

    // Max TX power (+21 dBm on C3)
    esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, ESP_PWR_LVL_P21);
    esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_DEFAULT, ESP_PWR_LVL_P21);
    Serial.println("TX Power: +21 dBm (max)");

    // Set initial random MAC
    randomizeMAC();

    // Create BLE Server
    pServer = BLEDevice::createServer();

    // 1. Standard Battery Service (0x180F)
    BLEService *pBatteryService = pServer->createService(BLEUUID((uint16_t)0x180F));
    pBatteryCharacteristic = pBatteryService->createCharacteristic(
                              BLEUUID((uint16_t)0x2A19),
                              BLECharacteristic::PROPERTY_READ |
                              BLECharacteristic::PROPERTY_NOTIFY
                            );
    pBatteryCharacteristic->addDescriptor(new BLE2902());
    
    // Set initial battery value
    pBatteryCharacteristic->setValue(&battery_level, 1);
    pBatteryService->start();

    // 2. FMDN Beacon Service (0xFE2C)
    BLEService *pFMDNService = pServer->createService(BLEUUID((uint16_t)0xFE2C));
    // Create a dummy characteristic just to ensure the service is fully registered
    BLECharacteristic *pFMDNCharacteristic = pFMDNService->createCharacteristic(
                              BLEUUID((uint16_t)0x0001),
                              BLECharacteristic::PROPERTY_READ
                            );
    pFMDNCharacteristic->setValue("FMDN");
    pFMDNService->start();

    Serial.println("GATT Services Started (Battery: 0x180F, FMDN: 0xFE2C)");

    // Get advertising handle
    pAdvertising = BLEDevice::getAdvertising();

    // Aggressive advertising interval (20-40ms)
    pAdvertising->setMinInterval(0x20);
    pAdvertising->setMaxInterval(0x40);

    // Build initial payload
    service_data[0] = 0x41; // Eddystone-EID frame type
    hex_string_to_bytes(EID_STRING, &service_data[1], 20);
    service_data[21] = 0x00; // Hashed flags
    service_data[22] = event_modes[current_mode_index];
    service_data[23] = battery_level;
    service_data[24] = event_counter;

    applyAdvertisement();
    pAdvertising->start();

    Serial.println("✅ Beacon active!");
    Serial.printf("State: Mode=0x%02X, Counter=%d, Battery=%d%%\n",
                  event_modes[current_mode_index], event_counter, battery_level);

    digitalWrite(ONBOARD_LED, LOW);
    delay(300);
    digitalWrite(ONBOARD_LED, HIGH);
  }

  void loop() {
    delay(STATE_UPDATE_MS);

    // Cycle event mode
    current_mode_index = (current_mode_index + 1) % NUM_MODES;
    uint8_t new_mode = event_modes[current_mode_index];

    // Increment counter
    event_counter = (event_counter + 1) % 256;

    // Drain battery (demo)
    if (battery_level > 10) battery_level--;
    else battery_level = 92;

    // Update payload bytes
    service_data[22] = new_mode;
    service_data[23] = battery_level;
    service_data[24] = event_counter;
    
    // Update GATT Battery Characteristic
    pBatteryCharacteristic->setValue(&battery_level, 1);
    pBatteryCharacteristic->notify();

    // Stop → rotate MAC if needed → update payload → restart
    pAdvertising->stop();

    cycle_count++;
    if (cycle_count % MAC_ROTATE_CYCLES == 0) {
      randomizeMAC();
    }

    applyAdvertisement();
    pAdvertising->start();

    Serial.printf("📡 Mode=0x%02X Counter=%d Bat=%d%% Cycle=%d\n",
                  new_mode, event_counter, battery_level, cycle_count);

    // Quick blink
    digitalWrite(ONBOARD_LED, LOW);
    delay(30);
    digitalWrite(ONBOARD_LED, HIGH);
  }
