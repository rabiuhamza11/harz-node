# HARZ NODE KIT v0.1

One command. Any device. A sovereign HARZ node: serves `.harz` names from sealed state, fails closed, receipts on every answer.

## Run (any phone, laptop, VPS, or Pi with Node.js >= 18)

```bash
git clone https://github.com/rabiuhamza11/harz-node.git
cd harz-node
bash start.sh
```

The door boots on `http://127.0.0.1:8080` — the `.harz` address bar. Type `kasuwa.harz`, `pay.harz`, or `chain.harz` and press Open: the sealed zone answers with a machine-checkable receipt. Unknown names get an honest NXDOMAIN, also receipted. No VPN, no extension, no permission from anyone.

Serving needs ZERO internet: the sealed zone is carried in the kit. This was proven live — on Oct 3, 2026, this exact resolve engine ran on an owner's phone in airplane mode and answered `chain.harz` with zero network (`FIELD-RECORD-RUN03.md`, HarzGit).

## Self-test

```bash
node selftest.mjs
```

8 checks: sealed state (77 records, king `90062faa`), fail-closed boot (digest `cac16833` + king signature), field-proven receipts byte-matched to the Oct 3 phone run, honest NXDOMAIN, tampered book refused, wrong anchor refused, mesh frame wire round-trip, merge engine determinism (lockstep + repeat → byte-identical digest).

## What this node does

1. **SERVE** — `.harz` name resolution from the sealed zone v2 (king `90062faa`, digest `cac16833`, 77 records). Field-proven on a real phone, online and offline.
2. **TRANSPORT** — frozen mesh frame v2.1 (byte-exact twin of the Kotlin core), included for LAN mesh work between nodes.
3. **MERGE** — deterministic reconciliation engine v1.0.0: two nodes that worked apart merge cleanly when they meet, contradictions verdicted, never smoothed.
4. **INTERNETLESS** — signed envelope exchange between ordinary phones with zero Internet.

## Honest labels (HarzNet Protocol Law v1, principle 8)

- SERVE/resolve: **FIELD-PROVEN** (owner's hands, Oct 3, 2026, airplane mode, 8% battery).
- Mesh transport: workbench-proven 16/16 (incl. interop with the frozen Kotlin core); **two-phone field run pending** (`transport/RUNBOOK-PHONES-MESH.md`).
- Merge engine: workbench-proven 13/13; live rail fire lockstep-verified; **live two-node adoption pending**.
- Internetless: workbench-proven 8/8; **two-phone field run pending** (`internetless/RUNBOOK-PHONES.md`).
- This kit claims: "the identity/resolution layer survives offline." It does NOT claim "live data survives offline" — fresh state honestly disappears when connectivity disappears, and returns when connectivity returns.

## Trust

- Ink is the keystore. Authority keys are born on paper; the zone is signed by king `90062faa` (Ed25519).
- Fail-closed: tampered book, wrong anchor, forged signature — refused, nothing served.
- Determinism is the contract: same sealed input, byte-identical answer, any substrate (proven on Node/workerd, Deno, and a phone).
- No wallet private keys anywhere in this kit. Ever.

## Files

See `MANIFEST.md` for the sha256 of every frozen component and its source of truth in HarzGit. This kit is the distribution copy; HarzGit is the vault.

Source of truth: HarzGit `harz-node-kit/` (build record with receipts).

## SEARCH — offline search engine (v0.2, Oct 6)

The full HARZ Search runs on your phone, zero internet required after install:

    bash search/start-search.sh

Then open http://127.0.0.1:8795/ in Chrome. Search box, real results, PWA installable.
Turn ON airplane mode — it keeps working. Everything (corpus, index, engine, UI) is local.

Together with the door (bash start.sh → http://127.0.0.1:8080), you have the HARZ browser
experience offline: .harz name resolution + search, no internet needed.
