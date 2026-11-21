#!/bin/sh
set -eu
HOST="192.168.1.168"
echo "=== Z2M LOG DISCOVERY ==="
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST \
  'echo ===LOGFILES===; find /opt/zigbee2mqtt/data -maxdepth 3 -type f -iname "*.log" -o -iname "log.txt" 2>/dev/null | tail -n 40; echo ===LOGREAD===; logread 2>/dev/null | grep -Ei "zigbee2mqtt|mqtt|error|failed" | tail -n 140 || true; echo ===SOCKETS===; netstat -tnp 2>/dev/null | grep -E "(:1883|node)" || true' || true
echo "=== DONE ==="
sleep infinity
