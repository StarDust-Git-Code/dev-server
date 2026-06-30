# BLE Advertising Guidelines

These guidelines document key constraints and recommendations for Bluetooth Low Energy (BLE) advertisement payloads to ensure compatibility across target devices (e.g., ESP32-C3, ESP32-S3).

## Legacy BLE Advertising (31-Byte Limit)

When developing trackers and beacons relying on legacy advertising channels, the total advertising payload is strictly limited to **31 bytes**.

### Payload Overhead Breakdown
Custom data is encapsulated in AD (Advertising Data) structures, each introducing metadata overhead:

| Field | Length | Description |
|---|---|---|
| **Length** | 1 byte | Indicates the length of the AD structure following it. |
| **Type** | 1 byte | AD Type (e.g., `0xFF` for Manufacturer Specific Data, `0x16` for Service Data). |
| **Flags** | 3 bytes | Standard LE discoverable mode and flags. Includes length/type overhead. |

### Manufacturer Specific Data (`0xFF`)
When using the Manufacturer Specific Data structure:
* **Total available size:** 31 bytes.
* **Overhead:** 2 bytes (Length + Type) + 2 bytes (Company Identifier, e.g., `0x004c` for Apple, `0x00e0` for Google).
* **Usable custom payload:** **~27 bytes** remaining.
* Including additional fields (like device name or TX power level) further reduces this usable space.

## Bluetooth 5 Extended Advertising
* If both the transmitter and receiver support Bluetooth 5 Extended Advertising, payloads can be up to **255 bytes**.
* **Recommendation:** For maximum device compatibility (especially with older mobile phones), firmware should continue using legacy 31-byte advertising structures.

## ESP32-C3 & S3 Payload Target
* For custom trackers built on the ESP32-C3 or ESP32-S3, target a custom payload size of **20–24 bytes** (leaving safety headroom).
* This makes the firmware much easier to scale, test, and adapt for other standards.
* For specialized networks like Apple Find My, the payload matches their custom 31-byte frame layout (consisting of the 28-byte EC public key coordinate and associated flags).

## Google Find Hub Data Exfiltration (EID Multiplexing)

Because the official Google Find My Device network strips out all custom Manufacturer Data (battery, event flags, counters) from standard advertisements during relay, state exfiltration using a single tracker ID is impossible.

To exfiltrate hardware state (like SOS or Strap Removal) purely through Google's network without relying on local custom scanner apps, use the **EID Multiplexing** architecture.

### EID Multiplexing Architecture
1. **Provisioning**: Register multiple virtual EIDs for a single physical tracker. For example:
   - EID 1: `Normal State`
   - EID 2: `SOS Triggered`
   - EID 3: `Strap Removed`
2. **Firmware Execution (ESP32-C3)**: 
   - The tracker defaults to broadcasting EID 1.
   - When a hardware interrupt fires (e.g., SOS button pressed, TTP223 touch sensor detects removal), the firmware instantly stops BLE advertising.
   - The firmware rotates the MAC address and swaps the advertisement payload to broadcast the corresponding EID (EID 2 or 3).
3. **Backend Aggregation**:
   - The custom API server groups these 3 EIDs under a single logical device.
   - When queried, it triggers parallel location requests for all 3 EIDs to the Google API.
   - The state is inferred based on which EID has the most recent location timestamp returned by Google's network.

