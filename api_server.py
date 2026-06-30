#
#  GoogleFindMyTools - Dashboard API Server
#  A Flask REST API wrapping the existing Python modules
#

import binascii
import datetime
import hashlib
import json
import time
import threading

from flask import Flask, jsonify, request as flask_request
from flask_cors import CORS

from NovaApi.ListDevices.nbe_list_devices import request_device_list
from NovaApi.ExecuteAction.LocateTracker.location_request import create_location_request
from NovaApi.ExecuteAction.LocateTracker.decrypt_locations import (
    retrieve_identity_key,
    is_mcu_tracker,
    create_google_maps_link,
)
from NovaApi.nova_request import nova_request
from NovaApi.scopes import NOVA_ACTION_API_SCOPE
from NovaApi.util import generate_random_uuid
from Auth.fcm_receiver import FcmReceiver
from ProtoDecoders import DeviceUpdate_pb2
from ProtoDecoders import Common_pb2
from ProtoDecoders.decoder import parse_device_list_protobuf, get_canonic_ids, parse_device_update_protobuf
from FMDNCrypto.foreign_tracker_cryptor import decrypt as fmdn_decrypt
from KeyBackup.cloud_key_decryptor import decrypt_aes_gcm
from SpotApi.UploadPrecomputedPublicKeyIds.upload_precomputed_public_key_ids import refresh_custom_trackers

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://127.0.0.1:5173"])

# In-memory cache for multiplexed EID groups
WATCH_1_GROUP_CACHE = []

@app.route('/api/devices', methods=['GET'])
def list_devices():
    """Fetch all registered trackers from Google Find My Device."""
    try:
        result_hex = request_device_list()
        device_list = parse_device_list_protobuf(result_hex)

        refresh_custom_trackers(device_list)
        canonic_ids = get_canonic_ids(device_list)

        global WATCH_1_GROUP_CACHE
        WATCH_1_GROUP_CACHE = []

        devices = []
        for idx, (device_name, canonic_id) in enumerate(canonic_ids, start=1):
            if "watch_1_" in device_name:
                WATCH_1_GROUP_CACHE.append((device_name, canonic_id))
            else:
                devices.append({
                    "id": idx,
                    "name": device_name,
                    "canonic_id": canonic_id,
                })
                
        if watch_1_group_ids:
            devices.insert(0, {
                "id": 999,
                "name": "Child Safety Watch 1",
                "canonic_id": "child_watch_group",
            })

        return jsonify({"devices": devices})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/locate', methods=['POST'])
def locate_device():
    """Fetch and decrypt live location for a specific tracker."""
    try:
        data = flask_request.get_json()
        canonic_id = data.get('canonic_id')
        name = data.get('name', 'Unknown')

        if not canonic_id:
            return jsonify({"error": "canonic_id is required"}), 400

        print(f"[API] Requesting location data for {name}...")

        if canonic_id == "child_watch_group":
            import concurrent.futures
            
            def fetch_single(d_name, d_canonic):
                """Helper to fetch location for a single EID in the group."""
                result = None
                request_uuid = generate_random_uuid()
                def handle_loc(res):
                    nonlocal result
                    try:
                        upd = parse_device_update_protobuf(res)
                        if upd.fcmMetadata.requestUuid == request_uuid:
                            result = upd
                    except: pass
                
                fcm_token = FcmReceiver().register_for_location_updates(handle_loc)
                nova_request(NOVA_ACTION_API_SCOPE, create_location_request(d_canonic, fcm_token, request_uuid))
                
                elapsed = 0
                while result is None and elapsed < 30:
                    time.sleep(0.2)
                    elapsed += 0.2
                
                if result:
                    return _extract_locations(result), d_name
                return [], d_name

            all_locations = []
            latest_status = "Normal"
            
            # Fetch all multiplexed EIDs in parallel to avoid 90-second delays
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
                futures = [executor.submit(fetch_single, n, c) for n, c in WATCH_1_GROUP_CACHE]
                for future in concurrent.futures.as_completed(futures):
                    locs, d_name = future.result()
                    for l in locs:
                        l['state_source'] = d_name
                        all_locations.append(l)

            # Sort all retrieved locations by timestamp to find the most recent state
            all_locations.sort(key=lambda x: x["timestamp"], reverse=True)
            
            # Determine active state
            if all_locations:
                most_recent_source = all_locations[0]['state_source']
                if "sos" in most_recent_source:
                    latest_status = "SOS"
                elif "strap" in most_recent_source:
                    latest_status = "Strap Removed"
            
            # Inject fake telemetry so dashboard shows it
            with telemetry_lock:
                telemetry_cache["child_watch_group"] = {
                    "battery_pct": 100, # Fake, or could be passed
                    "active_events": [latest_status] if latest_status != "Normal" else [],
                    "timestamp_formatted": datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                }

            return jsonify({"locations": all_locations, "device_name": "Child Safety Watch 1 (State: " + latest_status + ")"})
        else:
            result = None
            request_uuid = generate_random_uuid()
            error_holder = [None]
    
            def handle_location_response(response):
                nonlocal result
                try:
                    device_update = parse_device_update_protobuf(response)
                    if device_update.fcmMetadata.requestUuid == request_uuid:
                        result = parse_device_update_protobuf(response)
                except Exception as e:
                    error_holder[0] = str(e)
    
            fcm_token = FcmReceiver().register_for_location_updates(handle_location_response)
    
            hex_payload = create_location_request(canonic_id, fcm_token, request_uuid)
            nova_request(NOVA_ACTION_API_SCOPE, hex_payload)
    
            timeout = 30
            elapsed = 0
            while result is None and elapsed < timeout:
                time.sleep(0.2)
                elapsed += 0.2
    
            if result is None:
                if error_holder[0]:
                    return jsonify({"error": error_holder[0]}), 500
                return jsonify({"error": "Timeout waiting for location response from Google servers"}), 504
    
            locations = _extract_locations(result)
    
            return jsonify({"locations": locations, "device_name": name})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


def _extract_locations(device_update_protobuf):
    """
    Extract and decrypt location data from the protobuf response.
    Returns a list of location dicts instead of printing.
    """
    device_registration = device_update_protobuf.deviceMetadata.information.deviceRegistration

    identity_key = retrieve_identity_key(device_registration)
    locations_proto = device_update_protobuf.deviceMetadata.information.locationInformation.reports.recentLocationAndNetworkLocations
    is_mcu = is_mcu_tracker(device_registration)

    # At All Areas Reports or Own Reports
    recent_location = locations_proto.recentLocation
    recent_location_time = locations_proto.recentLocationTimestamp

    # High Traffic Reports
    network_locations = list(locations_proto.networkLocations)
    network_locations_time = list(locations_proto.networkLocationTimestamps)

    if locations_proto.HasField("recentLocation"):
        network_locations.append(recent_location)
        network_locations_time.append(recent_location_time)

    locations = []
    for loc, loc_time in zip(network_locations, network_locations_time):

        if loc.status == Common_pb2.Status.SEMANTIC:
            locations.append({
                "type": "semantic",
                "name": loc.semanticLocation.locationName,
                "timestamp": int(loc_time.seconds),
                "timestamp_formatted": datetime.datetime.fromtimestamp(
                    int(loc_time.seconds)
                ).strftime('%Y-%m-%d %H:%M:%S'),
                "status": int(loc.status),
                "is_own_report": True,
                "latitude": None,
                "longitude": None,
                "altitude": None,
                "accuracy": 0,
                "maps_link": None,
            })
        else:
            encrypted_location = loc.geoLocation.encryptedReport.encryptedLocation
            public_key_random = loc.geoLocation.encryptedReport.publicKeyRandom

            if public_key_random == b"":  # Own Report
                identity_key_hash = hashlib.sha256(identity_key).digest()
                decrypted_location = decrypt_aes_gcm(identity_key_hash, encrypted_location)
            else:
                time_offset = 0 if is_mcu else loc.geoLocation.deviceTimeOffset
                decrypted_location = fmdn_decrypt(identity_key, encrypted_location, public_key_random, time_offset)

            proto_loc = DeviceUpdate_pb2.Location()
            proto_loc.ParseFromString(decrypted_location)

            latitude = proto_loc.latitude / 1e7
            longitude = proto_loc.longitude / 1e7
            altitude = proto_loc.altitude

            locations.append({
                "type": "geo",
                "latitude": latitude,
                "longitude": longitude,
                "altitude": altitude,
                "accuracy": loc.geoLocation.accuracy,
                "timestamp": int(loc_time.seconds),
                "timestamp_formatted": datetime.datetime.fromtimestamp(
                    int(loc_time.seconds)
                ).strftime('%Y-%m-%d %H:%M:%S'),
                "status": int(loc.status),
                "is_own_report": loc.geoLocation.encryptedReport.isOwnReport,
                "maps_link": create_google_maps_link(latitude, longitude),
                "name": None,
            })

    # Sort by timestamp descending (most recent first)
    locations.sort(key=lambda x: x["timestamp"], reverse=True)

    return locations


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "GoogleFindMyTools API"})


# Cache for custom BLE telemetry reports (rotating ID -> telemetry dict)
telemetry_cache = {}
telemetry_lock = threading.Lock()

@app.route('/api/relay', methods=['POST'])
def relay_telemetry():
    """
    Relay endpoint for custom Android/hardware relays.
    Accepts: { "payload": "raw_hex_from_ble_advertisement" }
    """
    try:
        data = flask_request.get_json() or {}
        payload_hex = data.get("payload")
        if not payload_hex:
            return jsonify({"error": "payload is required"}), 400
            
        payload = binascii.unhexlify(payload_hex.strip())
        if len(payload) < 25:
            return jsonify({"error": "Payload too short (must be at least 25 bytes)"}), 400
            
        # Parse fields
        frame_type = payload[0]
        eid = payload[1:21].hex()
        hashed_flags = payload[21]
        event_flags = payload[22]
        battery = payload[23]
        counter = payload[24]
        
        # Decode active events
        active_events = []
        if event_flags & 0x01: active_events.append("Lost")
        if event_flags & 0x02: active_events.append("Entered Zone")
        if event_flags & 0x04: active_events.append("Exit Zone")
        if event_flags & 0x08: active_events.append("Strap Removed")
        if event_flags & 0x10: active_events.append("SOS")
        if event_flags & 0x20: active_events.append("Low Battery")
        if event_flags & 0x40: active_events.append("Motion")
        
        telemetry = {
            "eid": eid,
            "frame_type": hex(frame_type),
            "hashed_flags": hex(hashed_flags),
            "event_flags_raw": hex(event_flags),
            "active_events": active_events,
            "battery_pct": battery,
            "counter": counter,
            "timestamp": int(time.time()),
            "timestamp_formatted": datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        with telemetry_lock:
            # Store under EID
            telemetry_cache[eid] = telemetry
            # Also store under any partial matches for ease of frontend query
            telemetry_cache[eid[:10]] = telemetry
            
        print(f"[API] Relayed telemetry for {eid[:10]}... - Battery: {battery}%, Events: {active_events}")
        return jsonify({"status": "success", "decoded": telemetry})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/telemetry/<device_id>', methods=['GET'])
def get_device_telemetry(device_id):
    """
    Fetch the latest custom telemetry (battery, counter, events) for a device.
    Supports matching by canonic_id or EID.
    """
    with telemetry_lock:
        cleaned_id = device_id.replace("-", "").lower()
        
        # Explicit mapping for test-1_C3 (canonic prefix '6a3e56' -> EID '3c7a00ec95...')
        if cleaned_id.startswith("6a3e56"):
            target_eid = "73e064d787129722a23cbc0239619b0192f3f418"
            if target_eid in telemetry_cache:
                return jsonify(telemetry_cache[target_eid])
        
        # Try exact lookup first
        if device_id in telemetry_cache:
            return jsonify(telemetry_cache[device_id])
            
        # Try matching prefix
        prefix = cleaned_id[:6]
        for key, val in telemetry_cache.items():
            if key.startswith(prefix) or prefix in key:
                return jsonify(val)
                
        return jsonify({"error": "No telemetry found for device"}), 404


if __name__ == '__main__':
    print("=" * 50)
    print("  GoogleFindMyTools API Server")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5000, debug=False)
