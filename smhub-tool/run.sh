#!/bin/sh
set -eu
TARGET="http://192.168.1.168"
curl -fsS --max-time 15 "$TARGET/assets/index-DKcB-7DL.js" -o /tmp/index.js || true
for KEY in "/login/cookie" "/login/user-session" "/users/signup" "signup" "username" "password"
do
  echo "=== CONTEXT $KEY ==="
  OFF=$(grep -abo "$KEY" /tmp/index.js 2>/dev/null | head -n1 | cut -d: -f1 || true)
  if [ -n "$OFF" ]; then
    START=$((OFF>2600 ? OFF-2600 : 0))
    dd if=/tmp/index.js bs=1 skip="$START" count=7600 2>/dev/null || true
    echo
  fi
done

for P in   "/api/v1/login/user-session"   "/api/v1/users/signup"
do
  echo "=== OPTIONS $P ==="
  curl -sS -i -X OPTIONS --max-time 8 "$TARGET$P" | head -n 40 || true
done

echo "=== DONE ==="
sleep infinity
