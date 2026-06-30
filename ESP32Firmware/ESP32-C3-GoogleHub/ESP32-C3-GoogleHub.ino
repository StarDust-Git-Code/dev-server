/*
 * Google Find My Device Network (FMDN) - Child Safety Watch
 * 
 * Hardware: ESP32-C3 Super Mini
 * Features:
 *   - EID Multiplexing for State Exfiltration
 *   - SOS Button Support (Hardware Pin)
 *   - Strap Removal Detection (TTP223 Capacitive Touch IC)
 *
 * This firmware cycles through different EIDs to communicate its physical
 * state (Normal, Strap Removed, SOS) across the Google Find My network.
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEAdvertising.h>
#include "esp_bt.h"
#include "nimble/ble.h"
#include "host/ble_hs.h"

// ─── Hardware Configuration ───
#define ONBOARD_LED        8
#define SOS_BUTTON_PIN     9      // Boot button (Active LOW)
#define STRAP_SENSOR_PIN   4      // TTP223 Touch IC (Active HIGH = Worn, LOW = Removed)

// ─── EID Configuration ───
// These EIDs correspond to the registered states on the Google Find Hub
const char* EID_NORMAL = "285cd8d981400aa6b606f42e0c8543c4392dfeea";
const char* EID_STRAP  = "470638b1ebeeac3688780e0176a6babadefad389";
const char* EID_SOS    = "5bc2b0eef5ce2b1a617dd01fec717151a9e5fb90";

// ─── Operational Configuration ───
#define STATE_UPDATE_MS    2000   // Sensor check interval
#define MAC_ROTATE_CYCLES  5      // Force MAC rotation every N loops to ensure rapid reporting

enum WatchState {
  STATE_NORMAL,
  STATE_STRAP_REMOVED,
  STATE_SOS
};

// Global state
BLEAdvertising *pAdvertising;
uint8_t service_data[22];
uint32_t cycle_count = 0;
WatchState currentState = STATE_NORMAL;
WatchState lastState = STATE_NORMAL;

// Hex string to byte array
void hex_string_to_bytes(const char *hex, uint8_t *bytes, size_t len) {
  for (size_t i = 0; i < len; i++) {
    sscanf(hex + 2 * i, "%2hhx", &bytes[i]);
  }
}

// Randomize BLE MAC address using NimBLE API
void randomizeMAC() {
  uint8_t addr[6];
  for (int i = 0; i < 6; i++) {
    addr[i] = (uint8_t)random(0, 256);
  }
  // Set top 2 bits = 11 for "Random Static Address"
  addr[5] |= 0xC0;

  ble_hs_id_set_rnd(addr);
}

// Removed unreliable software ADCTouch logic

// Apply the selected EID to the BLE payload
void applyEID(const char* eid_string) {
  service_data[0] = 0x41; // Frame type
  hex_string_to_bytes(eid_string, &service_data[1], 20);
  service_data[21] = 0x00; // Hashed flags

  BLEAdvertisementData oAdvertisementData;
  oAdvertisementData.setFlags(0x06);

  String service_data_str = "";
  for (int i = 0; i < 22; i++) {
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

  // Configure sensors
  pinMode(SOS_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STRAP_SENSOR_PIN, INPUT); // TTP223 actively drives the pin HIGH/LOW, no pullup needed

  for (int i = 0; i < 2; i++) {
    digitalWrite(ONBOARD_LED, LOW);
    delay(100);
    digitalWrite(ONBOARD_LED, HIGH);
    delay(100);
  }

  Serial.println("--- Child Safety Watch (Google Find Hub) ---");

  BLEDevice::init("Child-Watch");

  // Max TX power (+21 dBm on C3)
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, ESP_PWR_LVL_P21);
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_DEFAULT, ESP_PWR_LVL_P21);

  randomizeMAC();

  pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setMinInterval(0x20);
  pAdvertising->setMaxInterval(0x40);

  // Start with normal state
  applyEID(EID_NORMAL);
  pAdvertising->start();

  Serial.println("✅ Watch tracking active!");
}

void loop() {
  delay(STATE_UPDATE_MS);
  
  // Read hardware sensors
  // Button is active LOW (pressed = 0)
  bool isSOS = (digitalRead(SOS_BUTTON_PIN) == LOW);
  
  // TTP223 Touch Sensor (Default is active HIGH)
  // Worn (Touched) = HIGH
  // Removed (Not Touched) = LOW
  bool isStrapRemoved = (digitalRead(STRAP_SENSOR_PIN) == LOW);

  // Determine current priority state
  // SOS takes highest priority
  if (isSOS) {
    currentState = STATE_SOS;
  } else if (isStrapRemoved) {
    currentState = STATE_STRAP_REMOVED;
  } else {
    currentState = STATE_NORMAL;
  }

  bool stateChanged = (currentState != lastState);

  // Stop advertising to update payload or rotate MAC
  pAdvertising->stop();

  cycle_count++;
  if (cycle_count % MAC_ROTATE_CYCLES == 0 || stateChanged) {
    randomizeMAC(); // Force new MAC on state change to avoid tracking continuity issues
  }

  // Apply the correct EID based on state
  if (currentState == STATE_SOS) {
    applyEID(EID_SOS);
    Serial.println("🚨 EMERGENCY: SOS Triggered!");
  } else if (currentState == STATE_STRAP_REMOVED) {
    applyEID(EID_STRAP);
    Serial.println("⚠ WARNING: Strap Removed!");
  } else {
    applyEID(EID_NORMAL);
    Serial.println("✅ NORMAL: Tracking active.");
  }

  pAdvertising->start();
  lastState = currentState;

  // Blink LED based on state
  if (currentState == STATE_SOS) {
    // Fast blink for SOS
    for(int i=0; i<3; i++) {
      digitalWrite(ONBOARD_LED, LOW); delay(50);
      digitalWrite(ONBOARD_LED, HIGH); delay(50);
    }
  } else if (currentState == STATE_STRAP_REMOVED) {
    // Slow blink for Strap
    digitalWrite(ONBOARD_LED, LOW); delay(200);
    digitalWrite(ONBOARD_LED, HIGH);
  } else {
    // Single quick blink for Normal
    digitalWrite(ONBOARD_LED, LOW); delay(30);
    digitalWrite(ONBOARD_LED, HIGH);
  }
}
