#!/bin/sh
set -eu
TARGET="http://192.168.1.168"
EMAIL="ha-fix-20261121-2@local.invalid"
PASS="$(jq -r '.smhub_api_password // empty' /data/options.json)"

rm -f /data/smhub.cookies
echo "=== AUTH PHASE ==="
curl -sS -c /data/smhub.cookies -b /data/smhub.cookies   -H 'Content-Type: application/json'   -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"   "$TARGET/api/v1/users/signup" -o /tmp/signup -w 'SIGNUP_HTTP=%{http_code}\n' || true
cat /tmp/signup
echo
curl -sS -c /data/smhub.cookies -b /data/smhub.cookies   -F "username=$EMAIL" -F "password=$PASS"   "$TARGET/api/v1/login/cookie" -o /tmp/login -w 'LOGIN_HTTP=%{http_code}\n' || true
cat /tmp/login
echo
echo "=== SESSION ==="
curl -sS -c /data/smhub.cookies -b /data/smhub.cookies   "$TARGET/api/v1/login/user-session" || true
echo
echo "=== CURRENT FLOW ==="
curl -sS -c /data/smhub.cookies -b /data/smhub.cookies   "$TARGET/api/v1/pages/zigbee2mqtt/settings" | jq '{flow_control,adapter,serial_port,baud_rate,base_topic,mqtt_broker_url,ha_enabled}' || true
echo
sleep infinity
