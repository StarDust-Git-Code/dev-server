import os
import sys

# Ensure Python can find the modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from SpotApi.CreateBleDevice.create_ble_device import register_esp32
import time

def main():
    print("Registering watch_1_normal...")
    register_esp32("watch_1_normal")
    time.sleep(2)
    
    print("\nRegistering watch_1_strap...")
    register_esp32("watch_1_strap")
    time.sleep(2)
    
    print("\nRegistering watch_1_sos...")
    register_esp32("watch_1_sos")

if __name__ == "__main__":
    main()
