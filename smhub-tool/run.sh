#!/bin/sh
set -eu
TARGET="http://192.168.1.168"
for P in /openapi.json /api/openapi.json /api/v1/openapi.json; do
  echo "=== $P ==="
  curl -sS --max-time 8 "$TARGET$P" -o /tmp/openapi || true
  grep -oE '"/[^"]*(users|login)[^"]*"' /tmp/openapi 2>/dev/null | sort -u | head -n 120 || true
  wc -c /tmp/openapi 2>/dev/null || true
done
sleep infinity
