#!/data/data/com.termux/files/usr/bin/bash
# HARZ Reader v0.3 pocket — ONE-LINE INSTALLER
# Downloads with auto-resume, verifies sha, extracts, boots. Just run it.
set -e
cd "$HOME"
command -v curl >/dev/null 2>&1 || pkg install curl -y
command -v curl >/dev/null 2>&1 || { echo "FATAL: run 'pkg install curl -y' first"; exit 1; }
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
URL="https://github.com/rabiuhamza11/harz-node/releases/download/reader-offline-v0.3/harz-reader-v03-pocket.tar.gz"
SHA="411358a8b994c316e1ec29f9bc4ec21128d8b33310dcd8d35b406dd368257252"
echo "== HARZ READER v0.3 POCKET INSTALLER =="
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
  echo "sha mismatch — file incomplete, restarting download"
  rm -f kit.tar.gz
  exec bash "$0"
fi
echo "== SHA VERIFIED — kit is byte-perfect =="
mkdir -p harz-reader-v03
tar -xzf kit.tar.gz -C harz-reader-v03
cd harz-reader-v03
bash start-reader-v03-pocket.sh
