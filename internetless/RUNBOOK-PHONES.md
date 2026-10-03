# HARZ INTERNETLESS v0.1 — TWO-PHONE FIELD PROOF (runbook)

MILESTONE LAW: "HARZ continues to function when the Internet disappears."
Node A = Rabiu's Infinix (Node C role, portable). Node B = any second ordinary phone.
No dedicated hardware. No server. No Internet. No payments, tokens, DNS, or apps on top — transport only.

## PREP (while still online, once per phone)
1. Install Termux (F-Droid or Play). Open it.
2. pkg update -y && pkg install nodejs -y
3. curl the node file from HarzGit raw:
   curl -o internetless-node.js https://raw.githubusercontent.com/rabiuhamza11/harz-git/main/harz-internetless/v0.1/internetless-node.js
4. Make two folders, one per phone: mkdir nodeA (on phone A), mkdir nodeB (on phone B)

## THE TEST (Internet OFF from here)
Phone B: Settings -> Hotspot & tethering -> Hotspot ON (mobile data can stay off; the hotspot is a LAN, not Internet).
Phone A: WiFi -> join B's hotspot.
1. IDENTITY — on each phone, inside its folder:
   node ../internetless-node.js init --name NODE_A   (B: NODE_B)
   Each phone now holds its own local HARZ identity. Private key never printed, never sent.
2. DISCOVERY — Phone B:
   node ../internetless-node.js serve --port 8990
   It prints B's LAN address (e.g. 192.168.43.x:8990).
   Phone A: node ../internetless-node.js prove-offline --peer 192.168.43.x:8990
   LEG 1 must say Internet probe FAILED (Internet gone). LEG 2 must say peer ANSWERED.
3. MESSAGE — Phone A:
   node ../internetless-node.js send --to 192.168.43.x:8990 --text "first genuine offline packet"
   B's screen prints RECEIVED + VERIFIED.
4. VERIFICATION — Phone B:
   node ../internetless-node.js inbox
   Shows [VERIFIED] record of A's message, signature checked locally, no server.
5. STORE-AND-FORWARD — Phone B keeps the message. When a third node (or A restarted) serves:
   node ../internetless-node.js forward --to <that-node-ip>:8990
   The relayed message still carries A's ORIGINAL signature; the receiver verifies A, not B.
6. DEATH TEST — kill Termux on both phones. Toggle airplane mode ON then OFF. Restart both phones.
   Reopen Termux, cd to the node folders, run serve again on B, then inbox:
   PASS only if identity + the verified message are intact and still verify with zero server.

## PASS CONDITION
All five operations work with: mobile data OFF, Wi-Fi Internet OFF, Cloudflare/Deno/sandbox NOT involved.
The honest sentence is then earned, on real phones: "HARZ continues to function when the Internet disappears."
Sandbox battery 8/8 is WORKBENCH EVIDENCE ONLY — the claim comes only from this field proof.

## HONEST LIMITS (v0.1)
- Signature verification here proves POSSESSION of the identity key, not AUTHORITY. Authority binding
  to the root chain (king 90062faa) is the next rung after this proof.
- Transport is hotspot LAN (ordinary phones, zero new software beyond Termux). BLE / Wi-Fi Direct are
  later transport rungs (BLE SDK lives in the Edge APK track, pending desk freeze).
- serve must be running on the receiving phone for live delivery; store-and-forward covers the gaps.
