#!/bin/sh
set -eu
HOST="192.168.1.139"
echo "=== WORKING SMHUB MQTT ==="
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST \
  'grep -E "^(mqtt:|  server:|  user:|  base_topic:|  client_id:)" /opt/zigbee2mqtt/data/configuration.yaml | grep -v password || true; echo ===NET===; ip route 2>/dev/null | head -n 20' || true
echo "=== DONE ==="
sleep infinity
