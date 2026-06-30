import os
import json
import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

def generate_key_pair():
    # 1. Generate P-224 (SECP224R1) Elliptic Curve Private Key
    private_key = ec.generate_private_key(ec.SECP224R1())
    
    # 2. Extract Private Key Bytes (D value)
    private_value = private_key.private_numbers().private_value
    # P-224 private value is 28 bytes
    private_bytes = private_value.to_bytes(28, byteorder='big')
    private_hex = private_bytes.hex()
    
    # 3. Extract Public Key Point Coordinates (X and Y)
    public_numbers = private_key.public_key().public_numbers()
    x_value = public_numbers.x
    # X coordinate is 28 bytes
    x_bytes = x_value.to_bytes(28, byteorder='big')
    
    # 4. Generate the OpenHaystack Advertisement Key (Base64 of the 28-byte X coordinate)
    advertisement_key_b64 = base64.b64encode(x_bytes).decode('utf-8')
    
    # 5. Compute Apple's search hash (SHA256 of the uncompressed public key or just the advertisement key)
    # The search query hash is SHA256 of the 28-byte advertisement key
    import hashlib
    h = hashlib.sha256()
    h.update(x_bytes)
    search_hash_b64 = base64.b64encode(h.digest()).decode('utf-8')
    
    # Store keys in a JSON file
    key_data = {
        "private_key_hex": private_hex,
        "advertisement_key_base64": advertisement_key_b64,
        "search_hash_base64": search_hash_b64
    }
    
    output_filename = "apple_keys.json"
    with open(output_filename, "w") as f:
        json.dump(key_data, f, indent=4)
        
    print("=" * 60)
    print("      APPLE FIND MY (OPENHAYSTACK) KEY GENERATOR")
    print("=" * 60)
    print(f"Private Key (Hex)        : {private_hex}")
    print(f"Advertisement Key (B64)  : {advertisement_key_b64}")
    print(f"Search Query Hash (B64)  : {search_hash_b64}")
    print("-" * 60)
    print("For AppleFindMy-ESP32.ino:")
    print(f'   Set: const char* BASE64_PUBLIC_KEY = "{advertisement_key_b64}";')
    print("-" * 60)
    print(f"Key pair saved to: {os.path.abspath(output_filename)}")
    print("   WARNING: KEEP THIS FILE SECURE! You need the Private Key to decrypt")
    print("   location reports using FindMy.py or OpenHaystack.")
    print("=" * 60)

if __name__ == "__main__":
    generate_key_pair()
