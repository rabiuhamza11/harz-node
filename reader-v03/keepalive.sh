#!/data/data/com.termux/files/usr/bin/bash
# HARZ READER KEEPALIVE: restarts the reader if Android kills it. Run once, leave Termux alone.
cd "$HOME/harz-reader-v03" || { echo "kit folder missing"; exit 1; }
export PORT=8802
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
echo "keepalive running. Reader is restarted automatically if killed. Ctrl+C to stop."
while true; do
  if ! curl -s -m 2 "http://127.0.0.1:8802/health" >/dev/null 2>&1; then
    echo "$(date +%H:%M:%S) reader down, starting..."
    nohup node reader-v03-micro-server.js corpus-v03-micro.json > reader-v03.log 2>&1 &
    sleep 8
  fi
  sleep 5
done
