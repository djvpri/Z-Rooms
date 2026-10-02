#!/bin/bash
# Jalankan self-check lib/uang via tunnel SSH ke PG ZXRoom (10.0.1.2:5432).
set -e
DBURL=$(ssh djvpri@103.93.129.94 "sudo -n grep '^DATABASE_URL=' /data/coolify/applications/s1wonif2ibsl2jse0zoyrnkw/.env" | cut -d= -f2-)
DBURL="${DBURL/adyf5mac2kjppwuoqebk7naf:5432/127.0.0.1:15435}"
cd /opt/data/Z-Rooms
DATABASE_URL="$DBURL" node scripts/check-uang-fisik.mjs > /tmp/uangcheck6.log 2>&1
rc=$?
echo "rc=$rc"
grep -oE "GAGAL:.*|Can.t reach.*|Authentication.*|\{\"sewaHelper.*" /tmp/uangcheck6.log | head -3
exit $rc
