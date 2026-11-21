#!/bin/sh
set -eu
for HOST in 192.168.1.139 192.168.1.168; do
  echo "=== HOST $HOST ==="
  sshpass -p smlight ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 smlight@$HOST \
    'echo ===SERIAL_CONFIG===; awk '\''BEGIN{x=0} /^serial:/{x=1} x{if($0 ~ /^[^ ]/ && $0 !~ /^serial:/ && NR>1) exit; print}'\'' /opt/zigbee2mqtt/data/configuration.yaml 2>/dev/null || true; echo ===TTYS===; ls -l /dev/ttyS* /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true; echo ===PERIPHERALS===; ls -1 /etc/peripherals 2>/dev/null || true; grep -R -E "ttyS|ember|efr|cc26|zigbee" /etc/peripherals /opt/share 2>/dev/null | head -n 120 || true; echo ===DMESG===; dmesg 2>/dev/null | grep -Ei "tty|serial|zigbee|efr|cc26" | tail -n 80 || true' || true
done
echo "=== DONE ==="
sleep infinity
