#!/bin/sh
set -eu
TARGET="http://192.168.1.168"
EMAIL="ha-fix-20261121-2@local.invalid"
PASS="$(jq -r '.smhub_api_password // empty' /data/options.json)"

curl -sS -c /data/smhub.cookies -b /data/smhub.cookies   -F "username=$EMAIL" -F "password=$PASS"   "$TARGET/api/v1/login/cookie" >/tmp/login
echo "=== LOGIN ==="
cat /tmp/login
echo
echo "=== RAW SETTINGS ==="
curl -sS -i -c /data/smhub.cookies -b /data/smhub.cookies   "$TARGET/api/v1/pages/zigbee2mqtt/settings"
echo
sleep infinity
