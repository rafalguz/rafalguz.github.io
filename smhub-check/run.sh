#!/bin/sh
set -eu
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@192.168.1.168 '
echo ===SERIAL===
grep -E "^(serial:|  port:|  adapter:|  baudrate:|  rtscts:)" /opt/zigbee2mqtt/data/configuration.yaml
echo ===STATUS===
rc-service zigbee2mqtt status || true
echo ===LOG===
tail -n 120 /tmp/zigbee2mqtt.log 2>/dev/null | grep -E "Starting Zigbee2MQTT|EZSP|Ember|Coordinator|MQTT|Connected|error:|info:" | tail -n 120
' || true
sleep infinity
