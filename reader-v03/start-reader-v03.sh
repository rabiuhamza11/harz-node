#!/data/data/com.termux/files/usr/bin/bash
# HARZ OFFLINE READER v0.3 — SCALE BUILD: 11,430 PAGES FULL-LENGTH
# Needs engine.js, search-core.js in THIS folder. Corpus v0.3 (135MB full) included.
set -e
cd "$(dirname "$0")"
export PORT="${PORT:-8798}"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock && echo "wakelock HELD"

echo "== fail-closed integrity checks =="
sha256sum search-core.js engine.js reader-v03-server.js corpus-v03.json | awk '{print "   "substr($1,1,16), $2}'

echo "== starting v0.3 reader on port $PORT (135MB full corpus — workbench; boots in minutes) =="
nohup node reader-v03-server.js corpus-v03.json > reader-v03.log 2>&1 &
PID=$!
echo "   pid $PID"
H=""
for i in $(seq 1 30); do
  H=$(curl -s -m 3 "http://127.0.0.1:$PORT/health" 2>/dev/null) && [ -n "$H" ] && break
  sleep 2
done
if [ -z "$H" ]; then echo "FATAL: reader did not come up — check reader-v03.log"; exit 1; fi
echo "============================================================"
echo "  HARZ OFFLINE READER v0.3 (11,430-PAGE CORPUS) — LISTENING"
echo "  open in Chrome:   http://127.0.0.1:$PORT/"
echo "  health:           $H"
echo "  Search, tap a result, read the FULL article locally."
echo "  NOW turn ON airplane mode — full reading still works."
echo "============================================================"
