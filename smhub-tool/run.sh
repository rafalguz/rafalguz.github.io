#!/bin/sh
set -eu
TARGET="http://192.168.1.168"

echo "=== SIGNUP EMPTY JSON ==="
curl -sS -i --max-time 8 -H 'Content-Type: application/json' -d '{}' "$TARGET/api/v1/users/signup" | head -n 80 || true

echo "=== SIGNUP EMPTY FORM ==="
curl -sS -i --max-time 8 -F 'username=' -F 'password=' "$TARGET/api/v1/users/signup" | head -n 80 || true

echo "=== LOGIN EMPTY FORM ==="
curl -sS -i --max-time 8 -F 'username=' -F 'password=' "$TARGET/api/v1/login/cookie" | head -n 80 || true

echo "=== USER SESSION ==="
curl -sS -i --max-time 8 "$TARGET/api/v1/login/user-session" | head -n 60 || true

echo "=== DONE ==="
sleep infinity
