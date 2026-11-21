#!/bin/sh
set -eu
HOST="192.168.1.168"
echo "=== MQTT BLOCK REDACTED ==="
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST \
  'awk '\''BEGIN{inmqtt=0} /^mqtt:/{inmqtt=1} inmqtt{ if ($0 ~ /^[^ ]/ && $0 !~ /^mqtt:/ && NR>1) exit; if ($0 ~ /password:/) {sub(/:.*/,": <redacted>")} print }'\'' /opt/zigbee2mqtt/data/configuration.yaml; echo ===PASSWORD_META===; awk '\''/^mqtt:/{inmqtt=1;next} inmqtt && /^[^ ]/{exit} inmqtt && /password:/{v=$0; sub(/^[^:]*:[ ]*/,"",v); print "present=yes length=" length(v); found=1} END{if(!found) print "present=no"}'\'' /opt/zigbee2mqtt/data/configuration.yaml' || true
echo "=== DONE ==="
sleep infinity
