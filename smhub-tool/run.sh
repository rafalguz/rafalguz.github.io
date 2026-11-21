#!/bin/sh
set -eu
TARGET="http://192.168.1.168"
EMAIL="chatgpt-smhub-$(date +%s)@local.invalid"
PASS="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"

echo "=== SIGNUP ==="
curl -sS -c /tmp/cookies -b /tmp/cookies -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$TARGET/api/v1/users/signup" -o /tmp/signup -w 'HTTP=%{http_code}\n' || true
cat /tmp/signup
echo

echo "=== LOGIN ==="
curl -sS -c /tmp/cookies -b /tmp/cookies \
  -F "username=$EMAIL" -F "password=$PASS" \
  "$TARGET/api/v1/login/cookie" -o /tmp/login -w 'HTTP=%{http_code}\n' || true
cat /tmp/login
echo

echo "=== SESSION ==="
curl -sS -c /tmp/cookies -b /tmp/cookies "$TARGET/api/v1/login/user-session" || true
echo

echo "=== PAGE SETTINGS ==="
curl -sS -c /tmp/cookies -b /tmp/cookies "$TARGET/api/v1/pages/zigbee2mqtt/settings" || true
echo

echo "=== PACKAGE SETTINGS ==="
curl -sS -c /tmp/cookies -b /tmp/cookies "$TARGET/api/v1/smhub/packages/zigbee2mqtt/settings" || true
echo

sleep infinity
