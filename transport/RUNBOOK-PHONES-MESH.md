# RUNBOOK — GATE 3 FIELD EXPERIMENT (two ordinary phones, zero internet)

Owner's experiment (Sep 20): Phone A holds the verified HARZ book and sends the
signed zone over the mesh. Phone B — no fresh root connection — receives the
packet, verifies it independently, resolves pay.harz. Then corrupt ONE byte in
transit. Expected: B refuses the book. Not "warning." Not "best effort." Refused.

Sandbox evidence BEFORE this field run (all proven tonight, real sockets):
- Existing G1/G2 harness unchanged: 20/20 ALL PASS (audit/G3-1-HARNESS-RUN.txt)
- Gate 3 battery: 16/16 ALL PASS over real TCP (MESH-TRANSPORT-V01-RECORD.md)
- Frame interop: JS twin byte-identical with the frozen Kotlin core, both directions
  (audit/INTEROP-RUN.txt)
The field experiment is the live-fire confirmation on real radios.

## PREP (both phones, while still ONLINE — ~10 min)

On EACH phone (Termux):
1. `pkg update -y && pkg install nodejs -y`   (if nodejs not installed yet)
2. Make the mesh folder and pull the 6 files (raw from HarzGit main):
```mkdir -p ~/mesh && cd ~/mesh
for f in mesh-phone.js mesh-frame.js mesh-core.js zone-carrier.js reach-core.js; do curl -o $f https://raw.githubusercontent.com/rabiuhamza11/harz-git/main/harz-reach/v0.3-mesh/$f; done```
3. `node mesh-phone.js` (no args) — should print the usage menu. If it does, the phone is ready.

## PHONE A (the Infinix, or whichever is the sender)

1. `cd ~/mesh`
2. `node mesh-phone.js fetch`
   → must print "VERIFIED + SAVED: height 1, 77 names, node https://harz-root.harz.workers.dev"
   → Phone A now holds the king's signed book. Note A's hotspot IP (Termux: `ifconfig wlan0`).

## THE OFFLINE SETUP (the whole point)

1. Phone A: turn ON hotspot. Mobile data OFF. (The mesh runs on the LAN — zero internet.)
2. Phone B: connect to A's hotspot WiFi. Mobile data OFF on B too.
3. Confirm zero internet: `curl -m 5 https://harz-root.harz.workers.dev/zone` → must FAIL on both.

## RUN 1 — THE TRANSFER (the sentence-earning run)

Phone A (Termux):
`node mesh-phone.js go --id AAAA --port 8988 --push-to BBBB`
→ prints "GO up as [AAAA] … waiting for BBBB"

Phone B (Termux):
`node mesh-phone.js join --host <A's IP> --id BBBB`
→ expected:
```
BOOK DELIVERED OVER THE MESH — INDEPENDENTLY VERIFIED:
  king signature: VALID (Ed25519, verified on THIS phone)
  transport: mesh-live | supplying node: mesh:AAAA
  pay.harz → https://harzpay.harz.workers.dev
  unknown.harz → null (honest NXDOMAIN)
```
That is the owner's sentence: authority traveled a non-root transport, verified on
a device that never touched the internet for it.

## RUN 2 — THE DEATH TEST (corruption)

Phone A: Ctrl-C, then:
`node mesh-phone.js go --id AAAA --port 8988 --push-to BBBB --corrupt`
Phone B: delete mesh-verified-zone.json first (`rm mesh-verified-zone.json`), then:
`node mesh-phone.js join --host <A's IP> --id BBBB`
→ expected on B:
```
REFUSED: SIGNATURE FAILED — zone not loaded (fail-closed)
cache untouched: yes
```
One flipped byte (inside the king's signature, frame CRC resealed so the transport
saw a valid frame) — and B refused the whole book. That is the negative proof.

## RUN 3 — ROOTS DEAD, MESH BOOK SERVES (optional, same as G3-12)

Phone B (still offline):
`node mesh-phone.js resolve --name pay.harz`
→ `pay.harz → https://harzpay.harz.workers.dev` from the mesh-delivered verified
cache, with no root contact possible. Then try `--name nothing.harz` → null.

## FILM IT

Airplane-style proof: film B's Termux screen during RUN 1 + RUN 2 — B joining,
receiving, verifying, resolving, then refusing the corrupted book. Include A's
screen showing --corrupt mode. The film is the field evidence for the record.

## HONEST LIMITS

- Transport here is the hotspot LAN (same v0.1 ruling as internetless: BLE is the
  Edge APK track, still pending desk freeze). "Mesh transport" claim = the frozen
  G1/G2 protocol over a non-root transport; the radio is WiFi LAN, not BLE.
- One hop, two phones. Multihop/route-append is proven in the battery + Kotlin
  harness, not in this field run.
- Phone B verifies with the BAKED king anchor — the same pinned anchor as the roots
  and Reach. The mesh adds zero new trust.
