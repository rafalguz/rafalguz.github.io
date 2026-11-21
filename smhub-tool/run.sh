#!/bin/sh
set -eu
HOST="192.168.1.168"
echo "=== SECOND Z2M LOG ==="
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST \
  'tail -n 220 /tmp/zigbee2mqtt.log 2>/dev/null | sed -E "s/(password[^:]*:).*/\\1 <redacted>/I"' || true
echo "=== DONE ==="
sleep infinity
