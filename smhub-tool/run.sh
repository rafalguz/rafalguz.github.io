#!/bin/sh
set -eu

TARGET="http://192.168.1.168"

echo "SMHUB_TOOL target=$TARGET"
echo "=== INDEX ==="
curl -fsS --max-time 10 "$TARGET/" -o /tmp/index.html || true
cat /tmp/index.html 2>/dev/null || true

JS=$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' /tmp/index.html 2>/dev/null | head -n1 || true)
SCHEMA=$(grep -oE '/assets/schemas-[A-Za-z0-9_-]+\.js' /tmp/index.html 2>/dev/null | head -n1 || true)

echo "=== ASSETS ==="
echo "JS=$JS"
echo "SCHEMA=$SCHEMA"

if [ -n "$JS" ]; then
  curl -fsS --max-time 15 "$TARGET$JS" -o /tmp/index.js || true
  echo "=== API PATHS ==="
  grep -aoE '/api/[A-Za-z0-9_./?=&:-]+' /tmp/index.js 2>/dev/null | sort -u | head -n 300 || true
  echo "=== MQTT CONTEXT ==="
  tr ';{}' '\n\n\n' </tmp/index.js 2>/dev/null | grep -aiE 'mqtt|base_topic|client_id|broker|homeassistant|discovery' | head -n 300 || true
fi

if [ -n "$SCHEMA" ]; then
  curl -fsS --max-time 15 "$TARGET$SCHEMA" -o /tmp/schema.js || true
  echo "=== SCHEMA MQTT CONTEXT ==="
  tr ';{}' '\n\n\n' </tmp/schema.js 2>/dev/null | grep -aiE 'mqtt|base_topic|client_id|broker|homeassistant|discovery|username|password|server' | head -n 300 || true
fi

echo "=== DONE ==="
sleep infinity
