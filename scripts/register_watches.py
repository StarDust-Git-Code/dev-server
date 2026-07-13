import os
import sys
import time

# Ensure Python can find the modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from SpotApi.CreateBleDevice.create_ble_device import register_esp32

# Register both watch groups so the backend can group them as
# "Child Safety Watch 1" (watch_1_*) and "Child Safety Watch 2" (watch_2_*).
# Prints the Advertisement Key (EID) for each — paste those into the matching
# EID_NORMAL / EID_STRAP / EID_SOS constants in C3-Watch-1.ino / C3-Watch-2.ino.


def register_watch_group(group: int):
    for state in ("normal", "strap", "sos"):
        name = f"watch_{group}_{state}"
        print(f"\n=== Registering {name} ===")
        register_esp32(name)
        time.sleep(2)


def main():
    register_watch_group(1)
    register_watch_group(2)
    print("\nDone. Copy the printed Advertisement Keys into:")
    print("  C3-Watch-1.ino -> watch_1_normal / watch_1_strap / watch_1_sos")
    print("  C3-Watch-2.ino -> watch_2_normal / watch_2_strap / watch_2_sos")
    print("Then re-flash both devices and restart api_server.py.")


if __name__ == "__main__":
    main()
