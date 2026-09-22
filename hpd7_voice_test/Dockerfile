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

setup = "    def setup_alarm(self):\n"
if "HPD7 test: skipping setup_alarm" not in s:
    if setup not in s:
        raise SystemExit("setup_alarm insertion point not found")
    s = s.replace(
        setup,
        setup + '        if self._type is DeviceType.HPD7:\n'
                '            logger.info("HPD7 test: skipping setup_alarm")\n'
                '            return\n',
        1,
    )

p.write_text(s)
PY
