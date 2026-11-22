#!/bin/sh
set -u
for HOST in 192.168.1.139 192.168.1.168; do
  echo "=== $HOST ==="
  sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST '
    printf "smlight\n" | sudo -S chmod a-x /etc/cron.daily/opkg &&
    ls -l /etc/cron.daily/opkg &&
    if [ -x /etc/cron.daily/opkg ]; then echo OPKG_DAILY_ENABLED; else echo OPKG_DAILY_DISABLED; fi
  ' || echo "HOST_UNREACHABLE_OR_CHANGE_FAILED"
done
sleep infinity
