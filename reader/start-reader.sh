#!/data/data/com.termux/files/usr/bin/bash
# HARZ OFFLINE READER v0.1 — Stage A (additive; frozen search pins untouched)
# Needs engine.js, search-core.js, index-export.json in THIS folder
# (same files your search kit already extracted — no new download).
set -e
cd "$(dirname "$0")"
export PORT="${PORT:-8796}"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock && echo "wakelock HELD"

echo "== fail-closed integrity checks =="
sha256sum search-core.js engine.js reader-server.js | awk '{print "   "substr($1,1,16), $2}'

echo "== starting reader on port $PORT (index boot takes 1-3 min — be patient) =="
nohup node reader-server.js index-export.json > reader.log 2>&1 &
PID=$!
echo "   pid $PID"
H=""
for i in $(seq 1 90); do
  H=$(curl -s -m 3 "http://127.0.0.1:$PORT/health" 2>/dev/null) && [ -n "$H" ] && break
  sleep 2
done
if [ -z "$H" ]; then echo "FATAL: reader did not come up in 3 min — check reader.log"; exit 1; fi
echo "======================================================"
echo "  HARZ OFFLINE READER — LISTENING"
echo "  open in Chrome:   http://127.0.0.1:$PORT/"
echo "  health:           $H"
echo "  Search, tap a result, READ the local copy."
echo "  NOW turn ON airplane mode — reading still works."
echo "======================================================"
