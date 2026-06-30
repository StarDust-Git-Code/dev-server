#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEAdvertising.h>
#include <esp_bt.h>
#include <esp_gap_ble_api.h>

// Onboard LED Pin configuration
// - ESP32-C3 Super Mini: GPIO 8 (Active Low)
// - ESP32-S3: Set to your board's LED pin (e.g., GPIO 48 for built-in RGB or standard GPIO)
#define ONBOARD_LED 8 

// ─── APPLE FIND MY (OPENHAYSTACK) PUBLIC KEY ───
// Replace this with your 28-byte Base64 public key (retrieved from OpenHaystack or FindMy.py)
const char* BASE64_PUBLIC_KEY = "e/wKYtCVtUjnWKZTcDCnq0+0bynu3Aw7NTNkdA=="; 

// Base64 decoding lookup table
const char b64_chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

bool decode_base64(const char* input, uint8_t* output, size_t max_len) {
  int val = 0, valb = -8;
  size_t out_len = 0;
  for (const char* p = input; *p && *p != '='; p++) {
    const char* f = strchr(b64_chars, *p);
    if (!f) continue;
    val = (val << 6) + (f - b64_chars);
    valb += 6;
    if (valb >= 0) {
      if (out_len >= max_len) return false;
      output[out_len++] = (val >> valb) & 0xFF;
      valb -= 8;
    }
  }
  return out_len == max_len;
}

// Global advertising parameters
static esp_ble_adv_params_t ble_adv_params = {
  .adv_int_min        = 0x0640, // 1000ms advertising interval
  .adv_int_max        = 0x0640,
  .adv_type           = ADV_TYPE_NONCONN_IND,
  .own_addr_type      = BLE_ADDR_TYPE_RANDOM,
  .channel_map        = ADV_CHNL_ALL,
  .adv_filter_policy  = ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY,
};

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("--- Apple Find My (OpenHaystack) ESP32-C3 / S3 Init ---");

  // Configure Status LED
  pinMode(ONBOARD_LED, OUTPUT);
  digitalWrite(ONBOARD_LED, HIGH); // Turn LED OFF (active low)

  // Blink twice to indicate setup start
  for (int i = 0; i < 2; i++) {
    digitalWrite(ONBOARD_LED, LOW); delay(100);
    digitalWrite(ONBOARD_LED, HIGH); delay(100);
  }

  // 1. Decode Public Key
  uint8_t public_key[28];
  if (!decode_base64(BASE64_PUBLIC_KEY, public_key, 28)) {
    Serial.println("❌ ERROR: Failed to decode 28-byte Base64 Public Key!");
    // LED fast blinking error state
    while (true) {
      digitalWrite(ONBOARD_LED, LOW); delay(50);
      digitalWrite(ONBOARD_LED, HIGH); delay(50);
    }
  }
  Serial.println("✅ Public Key decoded successfully.");

  // 2. Derive Device Random MAC Address from Public Key
  // Apple Find My requires the static random BLE MAC address to match the key payload:
  // First byte must have its 2 MSBs set to 1 (static random address spec)
  esp_bd_addr_t rnd_addr;
  rnd_addr[0] = public_key[0] | 0b11000000;
  rnd_addr[1] = public_key[1];
  rnd_addr[2] = public_key[2];
  rnd_addr[3] = public_key[3];
  rnd_addr[4] = public_key[4];
  rnd_addr[5] = public_key[5];

  char mac_str[18];
  sprintf(mac_str, "%02X:%02X:%02X:%02X:%02X:%02X", rnd_addr[0], rnd_addr[1], rnd_addr[2], rnd_addr[3], rnd_addr[4], rnd_addr[5]);
  Serial.printf("📡 Spoofing MAC Address: %s\n", mac_str);

  // 3. Format Apple Find My BLE Advertisement Frame (31 bytes)
  uint8_t adv_data[31] = {
    0x1e,       // Length: 30 bytes following
    0xff,       // Manufacturer Specific Data type
    0x4c, 0x00, // Apple Company ID (0x004c)
    0x12, 0x19, // Type: Offline Finding (0x12), Payload Length (25 bytes)
    0x00,       // State byte (0x00 = default)
    // Bytes 7-28 (22 bytes): bytes 6-27 of Public Key (copied below)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00,       // Byte 29: First two bits of public key (public_key[0] >> 6)
    0x00        // Byte 30: Status hint byte
  };

  // Copy P-224 public key bytes 6-27 to offset 7
  memcpy(&adv_data[7], &public_key[6], 22);
  // Place key's MSBs at offset 29
  adv_data[29] = public_key[0] >> 6;

  // 4. Initialize ESP32 BLE Stack using ESP-IDF APIs for custom raw data and address control
  if (!BLEDevice::getInitialized()) {
    BLEDevice::init("FindMyTag");
  }
  
  // Configure controller
  esp_err_t status;
  if ((status = esp_ble_gap_set_rand_addr(rnd_addr)) != ESP_OK) {
    Serial.printf("❌ ERROR: Failed to set random MAC address: %s\n", esp_err_to_name(status));
    return;
  }

  if ((status = esp_ble_gap_config_adv_data_raw(adv_data, sizeof(adv_data))) != ESP_OK) {
    Serial.printf("❌ ERROR: Failed to configure raw advertising data: %s\n", esp_err_to_name(status));
    return;
  }

  if ((status = esp_ble_gap_start_advertising(&ble_adv_params)) != ESP_OK) {
    Serial.printf("❌ ERROR: Failed to start BLE advertising: %s\n", esp_err_to_name(status));
    return;
  }

  Serial.println("🚀 Apple Find My beacon is now ACTIVE and advertising!");
  
  // Light up LED to confirm activation
  digitalWrite(ONBOARD_LED, LOW);
  delay(1000);
  digitalWrite(ONBOARD_LED, HIGH);
}

void loop() {
  // Advertising runs in background, main CPU keeps sleeping
  delay(10000);
}
