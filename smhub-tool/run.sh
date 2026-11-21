#!/bin/sh
set -eu
TARGET="http://192.168.1.168"

echo "SMHUB_TOOL target=$TARGET"
for P in   "/api/v1/pages/zigbee2mqtt"   "/api/v1/pages/mqtt"   "/api/v1/pages/settings/zigbee2mqtt"   "/api/v1/pages/settings/mqtt"   "/api/v1/zigbee2mqtt"   "/api/v1/mqtt"
do
  echo "=== GET $P ==="
  CODE=$(curl -sS --max-time 8 -o /tmp/out -w '%{http_code}' "$TARGET$P" || true)
  echo "HTTP=$CODE"
  head -c 12000 /tmp/out 2>/dev/null || true
  echo
done

curl -fsS --max-time 15 "$TARGET/assets/index-DKcB-7DL.js" -o /tmp/index.js || true
for KEY in mqtt_broker_url base_topic client_id ha_enabled zigbee2mqtt "/pages/"
do
  echo "=== CONTEXT $KEY ==="
  OFF=$(grep -abo "$KEY" /tmp/index.js 2>/dev/null | head -n1 | cut -d: -f1 || true)
  if [ -n "$OFF" ]; then
    START=$((OFF>1800 ? OFF-1800 : 0))
    dd if=/tmp/index.js bs=1 skip="$START" count=5200 2>/dev/null || true
    echo
  fi
done

echo "=== DONE ==="
sleep infinity
