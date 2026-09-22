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

m = Path("/app/main.py")
ms = m.read_text()
marker = "    # Create reader to receive commands from STDIN\n"
if "HPD7 Voice Test: starting StartVoiceCom_V30 probe" not in ms:
    if marker not in ms:
        raise SystemExit("main.py probe insertion point not found")
    probe = (
        '    for _, test_doorbell in list(doorbell_registry.items()):\n'
        '        if getattr(getattr(test_doorbell, "_type", None), "name", "") == "HPD7":\n'
        '            logger.info("HPD7 Voice Test: starting StartVoiceCom_V30 probe")\n'
        '            test_doorbell.start_voice_talk()\n'
        '            await asyncio.sleep(1)\n'
        '            test_doorbell.stop_voice_talk()\n\n'
    )
    ms = ms.replace(marker, probe + marker, 1)
m.write_text(ms)
PY
