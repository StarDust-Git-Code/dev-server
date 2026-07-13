/*
 * Google Find My Device Network (FMDN) - Child Safety Watch 2
 * Ultra-Low-Power Deep Sleep Architecture + OTA
 *
 * Fixes vs. previous version:
 *   - Pins aligned to the proven-working wiring (SOS on GPIO9, MAX30102 on I2C 6/7,
 *     no separate sensor power pin). The old GPIO0/GPIO1 mapping did not match the
 *     working hardware and silently broke SOS / wear detection.
 *   - Longer on-air window (6 s) and a NimBLE startup delay so the short deep-sleep
 *     wake actually transmits before the window closes.
 *   - EIDs are kept as constants. They MUST equal the values printed by
 *     scripts/register_watches.py for the names watch_2_normal / watch_2_strap /
 *     watch_2_sos. If they do not match a registered tracker, Google never reports
 *     a location (the #1 reason this "didn't work").
 *
 * OTA:
 *   - Hold the SOS button ~3-7s on a wake to enter OTA mode (blue LED blinks fast).
 *     The watch connects WiFi and serves Arduino OTA until the upload finishes or
 *     OTA_SERVE_MS elapses, then returns to normal operation. Battery is unaffected
 *     during normal operation because WiFi is only brought up in OTA mode.
 *
 * NOTE: This uses a static EID + 4-day precompute trick (same as sketch_jul7a).
 * Re-run scripts/register_watches.py before the registration window expires, or
 * implement on-device EID rotation for unlimited operation.
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
#include "driver/gpio.h"

// ─── OTA Config (set ENABLE_OTA to false to exclude WiFi/OTA and save flash) ───
#define ENABLE_OTA         true
#define WIFI_SSID          "YOUR_SSID"
#define WIFI_PASSWORD      "YOUR_PASSWORD"
#define OTA_PASSWORD       ""      // set non-empty to require a password in the Arduino IDE
#define OTA_HOSTNAME       "cw2-ota"
#define OTA_SERVE_MS       120000  // serve OTA up to 2 min per wake when in OTA mode
#define OTA_TRIGGER_MS     3000    // hold SOS this long (but < SLEEP_HOLD_MS) to enter OTA mode

#if ENABLE_OTA
#include <WiFi.h>
#include <ArduinoOTA.h>
volatile bool otaUpdating = false;
#endif

// ─── Hardware Pins (match the working board) ───
#define BLUE_LED          8     // Active LOW — onboard blue LED
#define SOS_BUTTON_PIN    9     // GPIO9 — SOS button (Active LOW, internal pull-up)
#define I2C_SDA           6
#define I2C_SCL           7
// Optional power gating: wire GPIO1 to MAX30102 VIN and uncomment to save power.
// #define MAX30102_POWER_PIN  1

// ─── EIDs (REPLACE with scripts/register_watches.py output for watch_2_*) ───
const char* EID_NORMAL = "d69603f6679c7776f1b5d6b490e87a074f218c7f";
const char* EID_STRAP  = "443535922f7bd8c8d0804cc91a09a0b57119139a";
const char* EID_SOS    = "160684d44f866486db0f85e9f730e079aa5b805a";

// ─── Timing Config ───
#define SLEEP_DURATION_US   15000000   // 15s deep sleep cycle
#define BLE_ADV_ACTIVE_MS   6000       // Advertise 6s per wake (was 2s — too short)
#define BLE_NIMBLE_WARMUP_MS 500       // Let NimBLE come up after deep-sleep reboot
#define BLE_ADV_INTERVAL    320        // 200ms in BLE units (0.625ms/unit)
#define SENSOR_WARMUP_MS    200        // Stabilisation time for MAX30102
#define IR_WORN_THRESHOLD   70000      // Skin contact threshold
#define BOOT_HOLD_MS        6000       // 6s hold to boot from power-off
#define SLEEP_HOLD_MS       7000       // 7s hold to enter power-off sleep

// ─── States ───
enum WatchState { STATE_NORMAL = 0, STATE_STRAP_REMOVED = 1, STATE_SOS = 2 };

// ─── RTC Memory (Persists through Deep Sleep) ───
RTC_DATA_ATTR static int      rtc_state      = STATE_NORMAL;
RTC_DATA_ATTR static uint32_t sos_cycles     = 0;   // Remaining SOS cycles
RTC_DATA_ATTR static int      rtc_sleep_mode = 0;   // 0=normal sleep, 1=power-off
RTC_DATA_ATTR static bool     rtc_ota_mode   = false;

// ─── Utilities ───
inline void ledOn()  { digitalWrite(BLUE_LED, LOW);  }
inline void ledOff() { digitalWrite(BLUE_LED, HIGH); }

void ledBlink(int onMs, int offMs, int count) {
    for (int i = 0; i < count; i++) {
        ledOn();  delay(onMs);
        ledOff(); delay(offMs);
    }
}

void hex_to_bytes(const char* hex, uint8_t* out, size_t len) {
    for (size_t i = 0; i < len; i++) {
        sscanf(hex + 2 * i, "%2hhx", &out[i]);
    }
}

void randomizeMAC() {
    uint8_t addr[6];
    for (int i = 0; i < 6; i++) addr[i] = (uint8_t)(esp_random() & 0xFF);
    addr[5] |= 0xC0; // Random Static Address bits
    ble_hs_id_set_rnd(addr);
}

// ─── OTA ───
#if ENABLE_OTA
void otaSetup() {
    ArduinoOTA.setHostname(OTA_HOSTNAME);
    if (strlen(OTA_PASSWORD) > 0) ArduinoOTA.setPassword(OTA_PASSWORD);
    ArduinoOTA.onStart([]() {
        otaUpdating = true;
        ledOn();
        Serial.println("\n[OTA] Update start");
    });
    ArduinoOTA.onEnd([]() {
        otaUpdating = false;
        Serial.println("\n[OTA] Update done, rebooting");
    });
    ArduinoOTA.onProgress([](unsigned int p, unsigned int t) {
        Serial.printf("[OTA] %u%%\n", p * 100 / t);
    });
    ArduinoOTA.onError([](ota_error_t e) {
        otaUpdating = false;
        Serial.printf("[OTA] Error[%u]\n", e);
    });
    ArduinoOTA.begin();
}

void runOTA() {
    Serial.println("[OTA] Connecting WiFi...");
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
        digitalWrite(BLUE_LED, ((millis() / 100) % 2 == 0) ? LOW : HIGH);
        delay(100);
    }
    ledOff();
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[OTA] WiFi failed — returning to normal mode");
        WiFi.mode(WIFI_OFF);
        rtc_ota_mode = false;
        return;
    }
    Serial.printf("[OTA] WiFi connected (%s). Serving OTA...\n", WiFi.localIP().toString().c_str());
    otaSetup();
    unsigned long otaStart = millis();
    while (otaUpdating || (millis() - otaStart < (uint32_t)OTA_SERVE_MS)) {
        ArduinoOTA.handle();
        delay(10);
    }
    WiFi.mode(WIFI_OFF);
    rtc_ota_mode = false;
    Serial.println("[OTA] Serve window ended.");
}
#endif

// ─── MAX30102 Read (sensor assumed always powered) ───
uint32_t readIR() {
    Wire.begin(I2C_SDA, I2C_SCL);
    MAX30105 sensor;
    uint32_t ir = 0;

    if (sensor.begin(Wire, I2C_SPEED_FAST)) {
        sensor.setup();
        delay(SENSOR_WARMUP_MS);
        ir = sensor.getIR();
        Serial.printf("[MAX30102] IR = %u\n", ir);
    } else {
        Serial.println("[MAX30102] Sensor not found");
    }

    Wire.end();
    return ir;
}

// ─── BLE Advertisement ───
void advertiseBLE(const char* eid, int state) {
    uint8_t sd[22];
    sd[0] = 0x41; // FMDN frame type
    hex_to_bytes(eid, &sd[1], 20);
    sd[21] = 0x00; // Hashed flags

    BLEDevice::init("CW-2");
    delay(BLE_NIMBLE_WARMUP_MS); // Critical after deep-sleep reboot
    BLEDevice::setOwnAddrType(BLE_OWN_ADDR_RANDOM);
    randomizeMAC();

    BLEAdvertising* adv = BLEDevice::getAdvertising();
    adv->setMinInterval(BLE_ADV_INTERVAL);
    adv->setMaxInterval(BLE_ADV_INTERVAL);

    BLEAdvertisementData payload;
    payload.setFlags(0x06);

    // Construct String safely avoiding null truncation
    String sdStr;
    sdStr.reserve(22);
    for (int i = 0; i < 22; i++) sdStr += (char)sd[i];

    payload.setServiceData(BLEUUID((uint16_t)0xFEAA), sdStr);
    adv->setAdvertisementData(payload);
    adv->setScanResponse(false);
    adv->start();

    Serial.printf("[BLE] Advertising EID for %d ms\n", BLE_ADV_ACTIVE_MS);

    uint32_t t = millis();
    while (millis() - t < (uint32_t)BLE_ADV_ACTIVE_MS) {
        if (state == STATE_SOS) {
            ledOn();  delay(80);
            ledOff(); delay(80);
        } else if (state == STATE_STRAP_REMOVED) {
            ledOn();  delay(200);
            ledOff(); delay(200);
            ledOn();  delay(200);
            ledOff(); delay(400);
        } else {
            if (millis() - t < 100) ledOn();
            else ledOff();
            delay(10);
        }
    }

    ledOff();
    adv->stop();
    BLEDevice::deinit(true); // Free memory before deep sleep
}

// ─── Sleep Modes ───
void goSleep() {
    Serial.println("[Sleep] Normal timer + GPIO wake (15s)");
    Serial.flush();
    ledOff();
    rtc_sleep_mode = 0;
    rtc_ota_mode = false; // any unserved OTA attempt ends on a normal sleep
    esp_sleep_enable_timer_wakeup((uint64_t)SLEEP_DURATION_US);
    esp_deep_sleep_enable_gpio_wakeup(1ULL << SOS_BUTTON_PIN, ESP_GPIO_WAKEUP_GPIO_LOW);
    esp_deep_sleep_start();
}

void goPowerOffSleep() {
    Serial.println("[Sleep] Power-off mode — hold 6s to wake");
    Serial.flush();
    ledBlink(60, 60, 3);
    ledOff();
    rtc_sleep_mode = 1;
    esp_deep_sleep_enable_gpio_wakeup(1ULL << SOS_BUTTON_PIN, ESP_GPIO_WAKEUP_GPIO_LOW);
    esp_deep_sleep_start();
}

// ─── Setup (Runs on every wake) ───
void setup() {
    Serial.begin(115200);
    delay(50);

    pinMode(BLUE_LED, OUTPUT);         ledOff();
    pinMode(SOS_BUTTON_PIN, INPUT_PULLUP);

    esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
    Serial.printf("\n[Boot] Wakeup=%d | Mode=%d | State=%d | OTA=%d\n",
                  cause, rtc_sleep_mode, rtc_state, (int)rtc_ota_mode);

#if ENABLE_OTA
    // If OTA mode was requested, keep serving on every wake until done/timeout.
    if (rtc_ota_mode) {
        runOTA();
        goSleep();
        return;
    }
#endif

    // [Case A] Waking from Power-Off Mode (requires long hold)
    if (cause == ESP_SLEEP_WAKEUP_GPIO && rtc_sleep_mode == 1) {
        Serial.println("[Boot] Confirming 6s hold to wake...");
        uint32_t t = millis();
        bool confirmed = false;
        while (digitalRead(SOS_BUTTON_PIN) == LOW) {
            if (millis() - t >= (uint32_t)BOOT_HOLD_MS) { confirmed = true; break; }
            uint32_t elapsed = millis() - t;
            digitalWrite(BLUE_LED, ((elapsed / 400) % 2 == 0) ? LOW : HIGH);
            delay(10);
        }
        if (!confirmed) {
            Serial.println("[Boot] Button released too early.");
            goPowerOffSleep();
        }
        Serial.println("[Boot] Success!");
        ledBlink(200, 200, 5);
        rtc_state = STATE_NORMAL;
        sos_cycles = 0;
    }
    // [Case B] Waking from Normal Sleep via SOS Button (also handles OTA entry)
    else if (cause == ESP_SLEEP_WAKEUP_GPIO && rtc_sleep_mode == 0) {
        uint32_t hold = millis();
        while (digitalRead(SOS_BUTTON_PIN) == LOW) {
            uint32_t dur = millis() - hold;
            uint32_t p = (dur < 3000) ? 200 : 100;
            digitalWrite(BLUE_LED, ((millis() / p) % 2 == 0) ? LOW : HIGH);
            if (dur >= (uint32_t)SLEEP_HOLD_MS) {
                Serial.println("[Sleep] Turning OFF...");
                rtc_state = STATE_NORMAL;
                sos_cycles = 0;
                goPowerOffSleep();
            }
            delay(10);
        }
        ledOff();
        uint32_t held = millis() - hold;
#if ENABLE_OTA
        if (held >= (uint32_t)OTA_TRIGGER_MS) {
            Serial.println("[OTA] Entering OTA mode");
            rtc_ota_mode = true;
            rtc_sleep_mode = 0;
            runOTA();
            goSleep();
            return;
        }
#endif
        Serial.println("[SOS] Triggered!");
        rtc_state = STATE_SOS;
        sos_cycles = 3; // Broadcast SOS for a few cycles
    }
    // [Case C] Timer wake, but check if button held simultaneously
    else if (digitalRead(SOS_BUTTON_PIN) == LOW && rtc_state != STATE_SOS) {
        uint32_t hold = millis();
        while (digitalRead(SOS_BUTTON_PIN) == LOW) {
            uint32_t dur = millis() - hold;
            digitalWrite(BLUE_LED, ((millis() / 150) % 2 == 0) ? LOW : HIGH);
            if (dur >= (uint32_t)SLEEP_HOLD_MS) {
                rtc_state = STATE_NORMAL;
                sos_cycles = 0;
                goPowerOffSleep();
            }
            delay(10);
        }
        ledOff();
        rtc_state = STATE_SOS;
        sos_cycles = 3;
    }

    // Wear Detection
    if (rtc_state != STATE_SOS) {
        uint32_t ir = readIR();
        if (ir == 0) {
            Serial.println("[Wear] Error, keeping state");
        } else if (ir >= (uint32_t)IR_WORN_THRESHOLD) {
            rtc_state = STATE_NORMAL;
        } else {
            rtc_state = STATE_STRAP_REMOVED;
        }
    } else {
        if (sos_cycles > 0) sos_cycles--;
        if (sos_cycles == 0) {
            uint32_t ir = readIR();
            rtc_state = (ir >= (uint32_t)IR_WORN_THRESHOLD) ? STATE_NORMAL : STATE_STRAP_REMOVED;
        }
    }

    // Determine EID based on state
    const char* eid;
    switch (rtc_state) {
        case STATE_SOS:           eid = EID_SOS;    Serial.println("[State] SOS"); break;
        case STATE_STRAP_REMOVED: eid = EID_STRAP;  Serial.println("[State] Strap Removed"); break;
        default:                  eid = EID_NORMAL; Serial.println("[State] Normal"); break;
    }

    // Broadcast BLE payload
    advertiseBLE(eid, rtc_state);

    // Deep Sleep
    goSleep();
}

void loop() { goSleep(); }
