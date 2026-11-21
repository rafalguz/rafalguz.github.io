#!/bin/sh
set -eu
HOST="192.168.1.168"
echo "=== SSH CHECK ==="
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST 'echo SSH_OK; uname -a; id; echo ===FILES===; find /etc /opt /data /home -maxdepth 4 -type f \( -iname "*zigbee*" -o -iname "*z2m*" -o -iname "configuration.yaml" -o -iname "*mqtt*" \) 2>/dev/null | head -n 200; echo ===PROCESSES===; ps w | grep -Ei "zigbee|mqtt|node" | grep -v grep | head -n 80' || true
echo "=== DONE ==="
sleep infinity
