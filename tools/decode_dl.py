"""Decode a JSON dump of data-URLs (saved by browser_evaluate) into image files.

Usage: python decode_dl.py <dump.json> [<out_prefix>]
Items with a "name" field are saved as <slug(name)>_<n>.<ext>, others as <out_prefix>_<n>.<ext>.
Files land next to the dump; the dump is deleted afterwards.
"""
import base64
import json
import pathlib
import re
import sys

dump = pathlib.Path(sys.argv[1])
prefix = sys.argv[2] if len(sys.argv) > 2 else "img"
raw = json.loads(dump.read_text(encoding="utf-8"))
items = json.loads(raw) if isinstance(raw, str) else raw
counts = {}
for item in items:
    head, data = item["d"].split(",", 1)
    ext = head.split("/")[1].split(";")[0]
    base = re.sub(r"[^a-z0-9]+", "_", (item.get("name") or prefix).lower()).strip("_")
    counts[base] = counts.get(base, 0) + 1
    out = dump.parent / f"{base}_{counts[base]}.{ext}"
    out.write_bytes(base64.b64decode(data))
    print(out.name, out.stat().st_size)
dump.unlink()
