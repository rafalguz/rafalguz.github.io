#!/bin/sh
set -eu
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@192.168.1.168 '
echo UPTIME
uptime
echo Z2M_STATUS
rc-service zigbee2mqtt status || true
echo MQTT
ss -tn 2>/dev/null | grep 1883 || true
echo LOG
tail -n 80 /tmp/zigbee2mqtt.log 2>/dev/null | grep -E "Connected to MQTT|Connecting to MQTT|error:|Exiting|started!" | tail -n 80 || true
' || true
sleep infinity
