#!/bin/sh
set -eu
HOST="192.168.1.168"
echo "=== Z2M SERVICE DEBUG ==="
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST \
  'echo ===STATUS===; rc-service zigbee2mqtt status || true; echo ===PS===; ps -ef | grep -E "[z]igbee2mqtt|[n]ode.*index" || true; echo ===INIT===; sed -n "1,240p" /etc/init.d/zigbee2mqtt; echo ===RCLOG===; ls -lah /var/log 2>/dev/null | head -n 80; find /var/log /tmp -maxdepth 2 -type f 2>/dev/null | grep -Ei "zigbee|z2m" | head -n 80' || true
echo "=== DONE ==="
sleep infinity
