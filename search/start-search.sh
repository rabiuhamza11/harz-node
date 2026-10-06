#!/data/data/com.termux/files/usr/bin/bash
# HARZ SEARCH — OFFLINE PHONE NODE (node kit v0.2, search mode)
# All local: corpus, index, engine, UI. Once this is running,
# airplane mode changes NOTHING — search keeps working at 127.0.0.1.
set -e
cd "$(dirname "$0")"
export PORT="${PORT:-8795}"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock && echo "wakelock HELD"

echo "== fail-closed integrity checks =="
sha256sum search-core.js server.js engine.js | awk '{print "   "substr($1,1,16), $2}'

echo "== starting on port $PORT (index boot takes 1-3 min on phone — be patient) =="
nohup node server.js index-export.json > search.log 2>&1 &
PID=$!
echo "   pid $PID"
for i in $(seq 1 90); do
  H=$(curl -s -m 3 "http://127.0.0.1:$PORT/health" 2>/dev/null) && [ -n "$H" ] && break
  sleep 2
done
if [ -z "$H" ]; then echo "FATAL: node did not come up in 3 min — check search.log"; exit 1; fi
echo "=============================================="
echo "  HARZ SEARCH — OFFLINE NODE LISTENING"
echo "  open in Chrome:   http://127.0.0.1:$PORT/"
echo "  health:           $H"
echo "  NOW turn ON airplane mode — search still works."
echo "=============================================="
