#!/usr/bin/env bash
# HARZ NODE KIT v0.1 — boot a sovereign node: serve .harz from sealed state.
# Zero dependencies beyond Node.js (>= 18). No install, no permission, no network needed to serve.
set -e
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "node missing — install Node.js >= 18 (Termux: pkg install nodejs -y)"; exit 1; }
[ -f zone/SIGNED-ZONE-V2.json ] || { echo "sealed zone missing"; exit 1; }
HARZ_ZONE="$(pwd)/zone/SIGNED-ZONE-V2.json" HARZ_DOOR_PORT="${HARZ_DOOR_PORT:-8080}" node harz-door.js &
DOOR_PID=$!
sleep 1
echo ""
echo "HARZ node is up. Address bar: http://127.0.0.1:${HARZ_DOOR_PORT:-8080}"
echo "Sealed zone: king 90062faa, digest cac16833, 77 records. Fail-closed, receipts on every answer."
echo "Stop with Ctrl+C. Self-test: node selftest.mjs"
wait $DOOR_PID
