#!/data/data/com.termux/files/usr/bin/bash
# HARZ OFFLINE READER v0.3 POCKET — 1,267 PAGES FOR YOUR PHONE
# Needs engine.js, search-core.js in THIS folder. Corpus v0.3 pocket (18.5MB) included.
set -e
cd "$(dirname "$0")"
export PORT="${PORT:-8801}"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock && echo "wakelock HELD"

echo "== fail-closed integrity checks =="
sha256sum search-core.js engine.js reader-v03-pocket-server.js corpus-v03-pocket.json | awk '{print "   "substr($1,1,16), $2}'

echo "== starting pocket reader on port $PORT (18.5MB — made for the phone, full-length pages) =="
nohup node reader-v03-pocket-server.js corpus-v03-pocket.json > reader-v03-pocket.log 2>&1 &
PID=$!
echo "   pid $PID"
H=""
for i in $(seq 1 30); do
  H=$(curl -s -m 3 "http://127.0.0.1:$PORT/health" 2>/dev/null) && [ -n "$H" ] && break
  sleep 2
done
if [ -z "$H" ]; then echo "FATAL: reader did not come up — check reader-v03-pocket.log"; exit 1; fi
echo "============================================================"
echo "  HARZ OFFLINE READER v0.3 POCKET — LISTENING"
echo "  open in Chrome:   http://127.0.0.1:$PORT/"
echo "  health:           $H"
echo "  Search, tap a result, read the FULL article locally."
echo "  NOW turn ON airplane mode — full reading still works."
echo "============================================================"
