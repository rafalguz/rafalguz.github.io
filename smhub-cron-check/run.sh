#!/bin/sh
set -eu
sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@192.168.1.139 '
echo ===CRONTAB===
cat /etc/cron/crontabs/root 2>/dev/null || cat /etc/crontabs/root 2>/dev/null || true
echo ===CRON_DAILY===
ls -l /etc/cron.daily 2>/dev/null || true
for f in /etc/cron.daily/*; do echo "--- $f"; cat "$f" 2>/dev/null || true; done
echo ===VERSIONS===
cat /etc/os-release 2>/dev/null || true
opkg list-installed 2>/dev/null | grep -E "smhub-(os|services|web|ui|broker)|zigbee2mqtt" || true
' || true
sleep infinity
