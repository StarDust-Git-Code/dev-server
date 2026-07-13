import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from NovaApi.ListDevices.nbe_list_devices import request_device_list
from ProtoDecoders.decoder import parse_device_list_protobuf, get_canonic_ids

result_hex = request_device_list()
device_list = parse_device_list_protobuf(result_hex)
devices = get_canonic_ids(device_list)

print(f"Registered trackers ({len(devices)}):")
for name, canonic_id in devices:
    print(f"  - {name:24s} {canonic_id}")

# Summarize watch groups
import re
groups = {}
for name, _ in devices:
    m = re.match(r"watch_(\d+)_", name)
    if m:
        groups.setdefault(int(m.group(1)), []).append(name)

print("\nWatch groups found:")
for g in sorted(groups):
    needed = {"watch_%d_normal" % g, "watch_%d_strap" % g, "watch_%d_sos" % g}
    have = set(groups[g])
    missing = needed - have
    status = "OK" if not missing else f"MISSING {sorted(missing)}"
    print(f"  Group {g}: {status}")

print("\nWatch 1 & 2 registered?" ,
      all(f"watch_{n}_{s}" in dict(devices) for n in (1, 2) for s in ("normal", "strap", "sos")))
