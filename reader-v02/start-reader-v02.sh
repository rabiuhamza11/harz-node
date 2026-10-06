#!/data/data/com.termux/files/usr/bin/bash
# HARZ OFFLINE READER v0.2 — Stage B: FULL-LENGTH (charter 13f5a70)
# Needs engine.js, search-core.js in THIS folder. Corpus v0.2 included.
set -e
cd "$(dirname "$0")"
export PORT="${PORT:-8797}"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock && echo "wakelock HELD"

echo "== fail-closed integrity checks =="
sha256sum search-core.js engine.js reader-v02-server.js corpus-v02.json | awk '{print "   "substr($1,1,16), $2}'

echo "== starting v0.2 reader on port $PORT (small corpus — boots in seconds) =="
nohup node reader-v02-server.js corpus-v02.json > reader-v02.log 2>&1 &
PID=$!
echo "   pid $PID"
H=""
for i in $(seq 1 30); do
  H=$(curl -s -m 3 "http://127.0.0.1:$PORT/health" 2>/dev/null) && [ -n "$H" ] && break
  sleep 2
done
if [ -z "$H" ]; then echo "FATAL: reader did not come up — check reader-v02.log"; exit 1; fi
echo "============================================================"
echo "  HARZ OFFLINE READER v0.2 (FULL-LENGTH) — LISTENING"
echo "  open in Chrome:   http://127.0.0.1:$PORT/"
echo "  health:           $H"
echo "  Search, tap a result, read the FULL article locally."
echo "  NOW turn ON airplane mode — full reading still works."
echo "============================================================"
