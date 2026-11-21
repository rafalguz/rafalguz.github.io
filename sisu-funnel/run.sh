#!/bin/sh
set -eu
export TS_SOCKET=/data/sisu-tailscaled.sock
echo 'SMHUB168_FETCH_BEGIN'
wget -qO- --timeout=5 http://192.168.1.168/ 2>&1 | head -c 20000 || true
echo '\nSMHUB168_FETCH_END'
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
echo 'SISU: Enabling temporary Funnel for SMHUB 2 on HTTPS 8443'
until tailscale --socket="$TS_SOCKET" funnel --bg --https=8443 http://192.168.1.168:80; do
  echo 'SISU: Waiting for Funnel/HTTPS permission on port 8443'
  sleep 15
done
tailscale --socket="$TS_SOCKET" funnel status
wait "$PID"
