#!/bin/sh
set -eu
HOST="192.168.1.168"
echo "=== Z2M NONSECRET CONFIG ==="
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST \
  'grep -E "^(mqtt:|  server:|  user:|  base_topic:|  client_id:|homeassistant:|  enabled:|  discovery_topic:|  status_topic:|serial:|  port:|  adapter:|advanced:|  channel:|  network_key:|frontend:)" /opt/zigbee2mqtt/data/configuration.yaml | grep -v password || true; echo ===SERVICE===; rc-service zigbee2mqtt status || true; echo ===OWNER===; ls -l /opt/zigbee2mqtt/data/configuration.yaml' || true
echo "=== DONE ==="
sleep infinity
