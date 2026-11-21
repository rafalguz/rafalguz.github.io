#!/bin/sh
set -eu

HOST="192.168.1.168"
CFG="/opt/zigbee2mqtt/data/configuration.yaml"
PASS="$(jq -r '.mqtt_password // empty' /data/options.json)"

if [ -z "$PASS" ]; then
  echo "ERROR: mqtt_password option is empty"
  sleep infinity
fi

PASS64="$(printf '%s' "$PASS" | base64 | tr -d '\n')"

echo "=== PRECHECK ==="
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST \
  "nc -z -w 3 192.168.1.172 1883 >/dev/null 2>&1 && echo BROKER_PORT_OK || echo BROKER_PORT_FAIL; rc-service zigbee2mqtt status || true"

echo "=== APPLY ==="
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST \
  "PASS=\$(printf '%s' '$PASS64' | base64 -d); \
   CFG='$CFG'; \
   BAK=\"${CFG}.bak-ha-20261121-\$(date +%H%M%S)\"; \
   cp -p \"$CFG\" \"$BAK\"; \
   awk -v pass=\"$PASS\" '\
     BEGIN { inmqtt=0; have_client=0 } \
     /^mqtt:/ { inmqtt=1; print; next } \
     inmqtt && /^[^ ]/ { if (!have_client) print \"  client_id: smhub_sisu_02\"; inmqtt=0 } \
     inmqtt && /^  client_id:/ { have_client=1; print \"  client_id: smhub_sisu_02\"; next } \
     inmqtt && /^  password:/ { print \"  password: \" pass; next } \
     { print } \
     END { if (inmqtt && !have_client) print \"  client_id: smhub_sisu_02\" }' \
     \"$CFG\" > \"${CFG}.new\"; \
   mv \"${CFG}.new\" \"$CFG\"; \
   echo BACKUP_CREATED; \
   grep -E '^(mqtt:|  server:|  user:|  base_topic:|  client_id:)' \"$CFG\" | grep -v password; \
   printf 'smlight\\n' | sudo -S rc-service zigbee2mqtt restart >/tmp/z2m-restart.out 2>&1 || { cat /tmp/z2m-restart.out; exit 1; }; \
   echo Z2M_RESTARTED"

sleep 10

echo "=== VERIFY_REMOTE ==="
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST \
  "rc-service zigbee2mqtt status || true; \
   netstat -tn 2>/dev/null | grep '192.168.1.172:1883' || true; \
   ps -ef | grep '[n]ode' | grep zigbee2mqtt || true"

echo "=== DONE ==="
sleep infinity
