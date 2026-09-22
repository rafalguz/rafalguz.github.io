ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN python3 - <<'PY'
from pathlib import Path
p = Path("/app/doorbell.py")
s = p.read_text()
needle = "    OUTDOOR = 603\n"
if "    HPD7 = 2211\n" not in s:
    if needle not in s:
        raise SystemExit("DeviceType insertion point not found")
    s = s.replace(needle, needle + "    HPD7 = 2211\n", 1)
p.write_text(s)
PY
