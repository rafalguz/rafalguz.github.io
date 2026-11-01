#!/bin/sh
set -eu
export TS_SOCKET=/data/sisu-tailscaled.sock
mkdir -p /data/state
rm -f "$TS_SOCKET"
echo 'SISU: Starting dedicated Tailscale daemon (userspace mode)'
tailscaled --state=/data/sisu-ts.state --statedir=/data/state --socket="$TS_SOCKET" --tun=userspace-networking --no-logs-no-support --port=0 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT INT TERM
n=0
until [ -S "$TS_SOCKET" ]; do
  n=$((n+1))
  [ "$n" -lt 40 ] || exit 1
  sleep 1
done
echo 'SISU: Authorize the separate device using the login URL in these logs'
tailscale --socket="$TS_SOCKET" up --hostname=sisu-panel --accept-dns=false
echo 'SISU: Enabling Funnel for the SISU app ONLY'
until tailscale --socket="$TS_SOCKET" funnel --bg --https=443 http://127.0.0.1:8098; do
  echo 'SISU: Check Tailscale admin for Funnel/HTTPS permission'
  sleep 45
done
tailscale --socket="$TS_SOCKET" funnel status
wait "$PID"
