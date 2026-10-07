#!/data/data/com.termux/files/usr/bin/bash
# HARZ Reader v0.3 pocket — ONE-LINE INSTALLER (v2: installs Node, patient boot)
set -e
cd "$HOME"

echo "== HARZ READER v0.3 POCKET INSTALLER =="
command -v curl >/dev/null 2>&1 || { echo "-- installing curl --"; pkg install curl -y; }
command -v curl >/dev/null 2>&1 || { echo "FATAL: run 'pkg install curl -y' manually, then re-run"; exit 1; }
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

# --- Node.js: REQUIRED to boot the reader ---
if ! command -v node >/dev/null 2>&1; then
  echo "-- Node.js not installed. Installing (about 30MB download, takes a few minutes on 3G) --"
  pkg install nodejs-lts -y || pkg install nodejs -y
fi
command -v node >/dev/null 2>&1 || { echo "FATAL: Node install failed. Run 'pkg install nodejs-lts -y' and paste me the error."; exit 1; }
echo "-- Node OK: $(node -v) --"

# --- Download kit with auto-resume ---
URL="https://github.com/rabiuhamza11/harz-node/releases/download/reader-offline-v0.3/harz-reader-v03-pocket.tar.gz"
SHA="411358a8b994c316e1ec29f9bc4ec21128d8b33310dcd8d35b406dd368257252"
n=0
while [ $n -lt 20 ]; do
  n=$((n+1))
  echo "-- download attempt $n (auto-resumes, safe to interrupt) --"
  curl -L -C - --retry 5 --retry-delay 3 -o kit.tar.gz "$URL" && break
  echo "-- network hiccup, retrying in 10s --"
  sleep 10
done
A=$(sha256sum kit.tar.gz | awk '{print $1}')
if [ "$A" != "$SHA" ]; then
  echo "sha mismatch — incomplete download, restarting"
  rm -f kit.tar.gz
  exec bash "$0"
fi
echo "== SHA VERIFIED — kit is byte-perfect =="

mkdir -p harz-reader-v03
tar -xzf kit.tar.gz -C harz-reader-v03
cd harz-reader-v03
export PORT=8801
export NODE_OPTIONS="--max-old-space-size=1024"

echo "== booting reader (2GB phone: give it up to 4 minutes, do NOT close Termux) =="
nohup node reader-v03-pocket-server.js corpus-v03-pocket.json > reader-v03.log 2>&1 &
PID=$!
echo "   pid $PID"
H=""
for i in $(seq 1 120); do
  H=$(curl -s -m 3 "http://127.0.0.1:8801/health" 2>/dev/null) && [ -n "$H" ] && break
  sleep 2
done
if [ -z "$H" ]; then
  echo "FATAL: did not come up in 4 min — last boot lines:"
  tail -5 reader-v03.log
  exit 1
fi
echo "============================================================"
echo "  HARZ OFFLINE READER v0.3 POCKET — LISTENING"
echo "  open in Chrome:   http://127.0.0.1:8801/"
echo "  Search, tap a result, read the FULL article locally."
echo "  Keep Termux open. NOW turn ON airplane mode —"
echo "  search again. It must still work. That closes the rung."
echo "============================================================"
