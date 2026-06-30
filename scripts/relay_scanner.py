import asyncio
import logging
import requests
from bleak import BleakScanner

# Target tracker EID (First 20 bytes of our ESP32 C3 advertisement payload)
TARGET_EID = "73e064d787129722a23cbc0239619b0192f3f418"
FMDN_SERVICE_UUID = "0000feaa-0000-1000-8000-00805f9b34fb" # Eddystone UUID

# Backend API endpoint to post decoded telemetry reports
RELAY_API_URL = "http://localhost:5000/api/relay"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("BLE_Relay")

# Track last sent counter per EID to avoid spamming the backend
last_sent_counters = {}

def detection_callback(device, advertisement_data):
    global last_sent_counters
    
    # Robustly check all service data keys for the 'feaa' (Eddystone) service UUID
    for uuid, raw_data in advertisement_data.service_data.items():
        if "feaa" in uuid.lower():
            # OpenHaystack/FMDN with custom extension should be at least 25 bytes
            if len(raw_data) >= 25:
                # First byte is frame type (0x41)
                # Bytes 1-20 is the rotating EID
                eid_hex = raw_data[1:21].hex().lower()
                
                event_flags = raw_data[22]
                battery = raw_data[23]
                counter = raw_data[24]
                
                # Check for duplicate events using the counter per EID
                if last_sent_counters.get(eid_hex) == counter:
                    return # Suppress duplicate updates
                
                last_sent_counters[eid_hex] = counter
                payload_hex = raw_data.hex()
                
                logger.info(f"✨ Found FMDN Tracker! EID: {eid_hex[:10]}... (MAC: {device.address})")
                logger.info(f"   ↳ Raw Payload: {payload_hex}")
                logger.info(f"   ↳ Telemetry: Event Flags=0x{event_flags:02X}, Battery={battery}%, Counter={counter}")
                logger.info(f"   ↳ RSSI: {device.rssi} dBm")
                
                # Relay to Flask Backend API
                try:
                    res = requests.post(RELAY_API_URL, json={"payload": payload_hex, "rssi": device.rssi}, timeout=5)
                    if res.ok:
                        logger.info("   ✅ Successfully relayed to backend!")
                    else:
                        logger.warning(f"   ❌ Backend error: {res.status_code} - {res.text}")
                except Exception as e:
                    logger.error(f"   ❌ Failed to connect to backend: {e}")

async def main():
    logger.info("============================================================")
    logger.info("             APPLE/GOOGLE BLE RELAY SCANNER")
    logger.info(f" Scanning for tracker EID: {TARGET_EID}")
    logger.info("============================================================")
    
    scanner = BleakScanner(detection_callback)
    
    # Start scanning
    await scanner.start()
    try:
        # Keep running
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        pass
    finally:
        await scanner.stop()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Relay scanner stopped by user.")
