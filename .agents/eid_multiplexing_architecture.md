# EID Multiplexing Architecture Rules

## Context
When working with Google's Find My Device (Find Hub) network, be aware that Google's relay devices (Android phones) **strip out all custom Manufacturer Specific Data** (like battery levels, counters, or custom event flags) before forwarding the location report to the cloud. You cannot exfiltrate custom bytes via a single BLE advertisement payload on this network.

## The Workaround: EID Multiplexing
To exfiltrate hardware state (e.g., SOS button pressed, Strap removed) purely through Google's network without relying on local custom scanner apps, you **must** use the EID Multiplexing architecture.

### How it works:
1. **Provisioning**: You must register multiple virtual EIDs (Ephemeral Identifiers) for a single physical tracker. For example:
   - EID 1 represents `Normal State`
   - EID 2 represents `SOS Triggered`
   - EID 3 represents `Strap Removed`
2. **Firmware Execution**: The ESP32 firmware monitors hardware pins. When a state changes, it stops advertising, swaps the payload to the corresponding EID, rotates the MAC address, and resumes advertising.
3. **Backend Aggregation**: The backend API (`api_server.py`) groups these 3 EIDs under a single logical device. When queried, it fetches locations for all 3 EIDs simultaneously.
4. **State Inference**: The backend infers the active state by checking which EID has the most recent location timestamp reported by Google.

### Rule
Whenever a user asks to "transmit a new state" or "add a new event flag" to a tracker meant for Google Find Hub, **do not attempt to add it to the payload bytes**. Instead, you must instruct the user to register a new EID, and implement the multiplexing logic in both the firmware and the backend.
