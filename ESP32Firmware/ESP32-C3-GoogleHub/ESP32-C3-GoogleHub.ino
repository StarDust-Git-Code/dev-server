/*
 * Google Find My Device Network (FMDN) - Child Safety Watch
 * 
 * Hardware: ESP32-C3 Super Mini + MAX30102 Heart Rate Sensor
 * Features:
 *   - EID Multiplexing for State Exfiltration
 *   - Wear Detection using MAX30102 IR Readings (checked every 12 seconds)
 *   - SOS Button (GPIO 9) - Press to trigger SOS broadcast; hold 5s to enter deep sleep.
 *   - Long Press Bootup - Hold button for 6 seconds to wake up/boot the device.
 *
 * This firmware cycles through different EIDs to communicate its physical
 * state (Normal, Strap Removed, SOS) across the Google Find My network.
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEAdvertising.h>
#include <Wire.h>
#include "MAX30105.h"
#include "esp_bt.h"
#include "nimble/ble.h"
#include "host/ble_hs.h"
#include "esp_sleep.h"

// ─── Hardware Configuration ───
#define ONBOARD_LED        8
#define SOS_BUTTON_PIN     9      // Boot button (Active LOW)
#define I2C_SDA            6      // Connected to GY-MAX30102 SDA
#define I2C_SCL            7      // Connected to GY-MAX30102 SCL
#define MAX30102_INT       5      // Connected to GY-MAX30102 INT (input, not used for power control)

// ─── EID Configuration ───
// These EIDs correspond to the registered states on the Google Find Hub
const char* EID_NORMAL = "285cd8d981400aa6b606f42e0c8543c4392dfeea";
const char* EID_STRAP  = "470638b1ebeeac3688780e0176a6babadefad389";
const char* EID_SOS    = "5bc2b0eef5ce2b1a617dd01fec717151a9e5fb90";

// ─── Operational Configuration ───
#define STATE_UPDATE_MS    12000  // Sensor check interval (12 seconds)
#define MAC_ROTATE_CYCLES  5      // Force MAC rotation every N loops to ensure rapid reporting
#define IR_WORN_THRESHOLD  70000  // IR reading above this = skin contact (worn). Below = not worn.

enum WatchState {
  STATE_NORMAL,
  STATE_STRAP_REMOVED,
  STATE_SOS
};

// Global state
MAX30105 particleSensor;
BLEAdvertising *pAdvertising;
uint8_t service_data[22];
uint32_t cycle_count = 0;
WatchState currentState = STATE_NORMAL;
WatchState lastState = STATE_NORMAL;

// Button tracking state variables
uint32_t buttonPressStartTime = 0;
bool isButtonPressed = false;

// Wear sensor checking state
uint32_t last_sensor_check_time = 0;

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
    addr[i] = (uint8_t)(esp_random() & 0xFF); // Hardware RNG for true randomness
  }
  // Set top 2 bits = 11 for "Random Static Address"
  addr[5] |= 0xC0;

  int rc = ble_hs_id_set_rnd(addr);
  if (rc == 0) {
    Serial.printf("🔀 MAC rotated → %02X:%02X:%02X:%02X:%02X:%02X\n",
      addr[5], addr[4], addr[3], addr[2], addr[1], addr[0]);
  } else {
    Serial.printf("⚠ MAC rotation failed (rc=%d)\n", rc);
  }
}

// Apply the selected EID to the BLE payload
void applyEID(const char* eid_string) {
  service_data[0] = 0x41; // Frame type
  hex_string_to_bytes(eid_string, &service_data[1], 20);
  service_data[21] = 0x00; // Hashed flags

  BLEAdvertisementData oAdvertisementData;
  oAdvertisementData.setFlags(0x06);

  // Build service data String byte-by-byte to safely preserve 0x00 bytes
  String service_data_str;
  service_data_str.reserve(22);
  for (int i = 0; i < 22; i++) {
    service_data_str += (char)service_data[i];
  }
  oAdvertisementData.setServiceData(BLEUUID((uint16_t)0xFEAA), service_data_str);

  pAdvertising->setAdvertisementData(oAdvertisementData);
  pAdvertising->setScanResponse(false);
}

void setup() {
  Serial.begin(115200);
  
  // Wait up to 3 seconds for USB CDC Serial Monitor to connect
  uint32_t start_serial = millis();
  while (!Serial && (millis() - start_serial < 3000)) {
    delay(10);
  }
  
  pinMode(ONBOARD_LED, OUTPUT);
  digitalWrite(ONBOARD_LED, HIGH); // LED OFF

  pinMode(SOS_BUTTON_PIN, INPUT_PULLUP);

  // Wakeup check: Check if button is held LOW for 6 seconds to confirm bootup
  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
  if (wakeup_reason == ESP_SLEEP_WAKEUP_GPIO) {
    Serial.println("☀️ GPIO Wakeup detected. Checking for 6-second long press to confirm boot...");
    uint32_t start_press = millis();
    bool boot_confirmed = false;
    
    while (digitalRead(SOS_BUTTON_PIN) == LOW) {
      if (millis() - start_press >= 6000) { // 6-second threshold
        boot_confirmed = true;
        break;
      }
      // Small indicator tick every 500ms to show the device is measuring
      digitalWrite(ONBOARD_LED, (millis() % 500 < 50) ? LOW : HIGH);
      delay(10);
    }
    
    // If released before 6 seconds, return to sleep immediately
    if (!boot_confirmed) {
      Serial.println("💤 Button released too early. Returning to deep sleep...");
      digitalWrite(ONBOARD_LED, HIGH); // LED OFF
      esp_deep_sleep_enable_gpio_wakeup(1ULL << SOS_BUTTON_PIN, ESP_GPIO_WAKEUP_GPIO_LOW);
      delay(50); // Debounce delay
      esp_deep_sleep_start();
    }
    
    Serial.println("✅ Boot confirmed! Blinking blue light for 5 seconds...");
    // Blink blue onboard LED for 5 seconds to tell the user the device has booted
    uint32_t start_blink = millis();
    while (millis() - start_blink < 5000) {
      digitalWrite(ONBOARD_LED, LOW);  // LED ON
      delay(250);
      digitalWrite(ONBOARD_LED, HIGH); // LED OFF
      delay(250);
    }
  } else {
    // Normal/cold power-on: Visual boot confirmation (blink twice)
    for (int i = 0; i < 2; i++) {
      digitalWrite(ONBOARD_LED, LOW);
      delay(100);
      digitalWrite(ONBOARD_LED, HIGH);
      delay(100);
    }
  }

  Serial.println("--- Child Safety Watch (Google Find Hub) ---");
  Serial.println(">>> MAX30102 Wear Detection + SOS Trigger");
  Serial.println(">>> Long Press 5s to Deep Sleep / Bootup");

  // Initialize I2C with specified pins
  Wire.begin(I2C_SDA, I2C_SCL);

  // Configure INT pin as input (interrupt output from MAX30102, directly)
  pinMode(MAX30102_INT, INPUT);

  // If waking from deep sleep, the sensor was in shutDown mode — wake it up first
  if (wakeup_reason == ESP_SLEEP_WAKEUP_GPIO) {
    particleSensor.wakeUp();
    delay(100); // Give the sensor time to resume
  }

  // Initialize MAX30102 sensor
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("⚠ MAX30102 was not found. Please check wiring/power.");
    // Alert user by blinking LED rapidly
    for (int i = 0; i < 10; i++) {
      digitalWrite(ONBOARD_LED, LOW); delay(50);
      digitalWrite(ONBOARD_LED, HIGH); delay(50);
    }
  } else {
    Serial.println("✅ MAX30102 initialized successfully.");
    particleSensor.setup(); // Configure sensor with default settings
  }

  // Init BLE
  BLEDevice::init("Child-Watch");

  // Configure BLE to use Random Static Address for dynamic MAC rotation
  BLEDevice::setOwnAddrType(BLE_OWN_ADDR_RANDOM);

  // Max TX power (+21 dBm on C3)
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, ESP_PWR_LVL_P21);
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_DEFAULT, ESP_PWR_LVL_P21);

  randomizeMAC();

  pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setMinInterval(0x4000); // 10.24 seconds (maximum BLE specification limit to save power)
  pAdvertising->setMaxInterval(0x4000);

  // Start with normal state
  applyEID(EID_NORMAL);
  pAdvertising->start();

  Serial.println("✅ Watch tracking active!");
}

void loop() {
  uint32_t current_time = millis();

  // 1. Read SOS button
  bool buttonState = (digitalRead(SOS_BUTTON_PIN) == LOW); // True if pressed

  if (buttonState) {
    if (!isButtonPressed) {
      // Button transition from released to pressed
      isButtonPressed = true;
      buttonPressStartTime = current_time;
      Serial.println("🔘 Button pressed. Measuring duration...");
    }
    
    uint32_t pressDuration = current_time - buttonPressStartTime;
    
    // Check if it is a long press of 5 seconds to enter deep sleep
    if (pressDuration >= 5000) {
      Serial.println("🚨 5-second long press detected! Entering deep sleep...");
      
      // Stop BLE advertising cleanly before sleep
      pAdvertising->stop();

      // Software shutdown MAX30102 (turns off LEDs + ADC, ~0.7µA standby)
      particleSensor.shutDown();
      Serial.println("💤 MAX30102 Powered Off (software shutdown).");

      // Turn off onboard LED
      digitalWrite(ONBOARD_LED, HIGH);

      // Configure GPIO 9 as deep sleep wakeup pin (Active LOW)
      esp_deep_sleep_enable_gpio_wakeup(1ULL << SOS_BUTTON_PIN, ESP_GPIO_WAKEUP_GPIO_LOW);

      Serial.println("💤 Entering Deep Sleep. Long press 6s to wake up.");
      delay(100); // Allow serial to flush
      esp_deep_sleep_start(); // Trigger deep sleep
    }
    
    // While pressed (and under 5 seconds), trigger SOS state
    currentState = STATE_SOS;
  } else {
    // Button is released
    if (isButtonPressed) {
      // Button transition from pressed to released
      isButtonPressed = false;
      buttonPressStartTime = 0;
      Serial.println("🔘 Button released.");
      
      // Force an immediate sensor check to restore correct state
      uint32_t irValue = particleSensor.getIR();
      currentState = (irValue < IR_WORN_THRESHOLD) ? STATE_STRAP_REMOVED : STATE_NORMAL;
    }
  }

  // 2. Wear Sensor Checking (Every 12 seconds, non-blocking)
  // Only evaluate wear state if the button is not pressed (not in SOS state)
  bool sensorCheckedThisTick = false;
  if (!buttonState) {
    if (current_time - last_sensor_check_time >= STATE_UPDATE_MS) {
      last_sensor_check_time = current_time;
      sensorCheckedThisTick = true;

      // Read raw IR value from MAX30102
      uint32_t irValue = particleSensor.getIR();
      Serial.printf("🔍 MAX30102 IR Reading: %d (threshold: %d)\n", irValue, IR_WORN_THRESHOLD);

      // If IR value is below threshold, the watch is not being worn
      bool isStrapRemoved = (irValue < IR_WORN_THRESHOLD);

      // Determine current state
      if (isStrapRemoved) {
        currentState = STATE_STRAP_REMOVED;
      } else {
        currentState = STATE_NORMAL;
      }
    }
  }

  // 3. State update: re-broadcast on every sensor cycle (for discoverability) or on state change
  if (currentState != lastState || sensorCheckedThisTick) {
    bool stateChanged = (currentState != lastState);

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
      Serial.println("⚠ WARNING: Strap Removed (Not Worn)!");
    } else {
      applyEID(EID_NORMAL);
      Serial.println("✅ NORMAL: Watch is worn.");
    }

    pAdvertising->start();
    lastState = currentState;
  }

  // 4. LED Blinking Indication based on current state
  if (currentState == STATE_SOS) {
    // Fast blink for SOS
    digitalWrite(ONBOARD_LED, LOW); delay(50);
    digitalWrite(ONBOARD_LED, HIGH); delay(50);
  } else if (currentState == STATE_STRAP_REMOVED) {
    // Slow blink for Strap removal (only brief flash to not block loop)
    if (current_time - last_sensor_check_time < 500) {
      digitalWrite(ONBOARD_LED, LOW); delay(200);
      digitalWrite(ONBOARD_LED, HIGH);
    }
  } else {
    // Single quick blink for Normal
    if (current_time - last_sensor_check_time < 100) {
      digitalWrite(ONBOARD_LED, LOW); delay(30);
      digitalWrite(ONBOARD_LED, HIGH);
    }
  }

  delay(10);
}
