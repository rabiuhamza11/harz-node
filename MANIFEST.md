# HARZ NODE KIT v0.1 — MANIFEST (every frozen component, byte-exact, source-pinned)

All components are UNMODIFIED copies of frozen HarzGit sources. Sha256 prefixes below; full hashes verifiable against HarzGit.

| Kit path | sha256 (8) | Frozen source (HarzGit) | Evidence |
|---|---|---|---|
| zone/SIGNED-ZONE-V2.json | b4125ca1 | harz-root-v2/zone-king/ | king 90062faa, digest cac16833, 77 records; field-run Oct 3 |
| harz-dns-core.js | cceebe3f | harz-network-app/v0.1/ | field-proven receipts byte-match (kasuwa 48c3a325, pay fd258227, chain ac4c204b, NXDOMAIN f289fc0e) |
| harz-door.js | 207da35b | harz-network-app/v0.1/ | owner phone run Oct 3, airplane mode |
| harz-netapp-browser.html | 6838c687 | harz-netapp commit 30346f3 | light theme #f0f2f5 + theme-color (OFFLINE-LINKS RULE) |
| transport/mesh-frame.js | 5f4b9bdc | harz-reach/v0.3-mesh/ | 16/16 battery, interop vs frozen Kotlin core |
| transport/mesh-core.js | 4f47e782 | harz-reach/v0.3-mesh/ | 16/16 battery |
| transport/zone-carrier.js | 77b3a379 | harz-reach/v0.3-mesh/ | fail-closed carrier, king baked |
| transport/mesh-phone.js | 22ef4a1d | harz-reach/v0.3-mesh/ | phone wrapper |
| transport/RUNBOOK-PHONES-MESH.md | ba8432a4 | harz-reach/v0.3-mesh/ | two-phone field runbook (pending) |
| merge/engine-v10.js | 434c41d2 | protocol/engine-v10.js (pin 434c41d2) | 13/13 battery, lockstep rail fire |
| internetless/internetless-node.js | c2cd9078 | harz-internetless/v0.1/ | 8/8 workbench |
| internetless/RUNBOOK-PHONES.md | 0964be4e | harz-internetless/v0.1/ | two-phone field runbook (pending) |

Kit-written files (not frozen): README.md, start.sh, selftest.mjs, MANIFEST.md.

Selftest result at build: 8/8 PASS (S1-S6 field-anchored, S7-S8 kit smoke; frozen batteries remain the evidence of record).

Built Oct 3, 2026, on owner's "Go". Freeze → build → verify → receipt.

## v0.2 — SEARCH MODE (Oct 6, 2026) — additive, v0.1 pins untouched
New offline capability: full HARZ Search node on the phone. All files in search/.
Byte-exact frozen copies (verified sha256 against HarzGit originals):
- search-core.js  853dc0ff8af3eb45cc748bb669c578e9ca90540582375b144dfe3cdeec9545a2 (frozen contract)
- server.js       2794cb73c437f47af8b3646413a947fd75447d88ab332db8e0630cad64594071 (Node A server, UI+PWA included)
- engine.js       f442a6a52fa898321fffeae3ec8a4c09eef0724256009a5136e8be6f21c63737 (index engine)
- index-export.json  corpus v0.1 portable artifact, digest 8bdec9df4eb4df5ae3b1f9720d04b478092a021d93b4485832e776e562644d72, 1409 docs / 219 domains
Federation proof (kit copy vs vault originals, both live): 30/30 BYTE-IDENTICAL.
Totals vs Sep 25 recorded Node C evidence: 30/30 match.
Run: bash search/start-search.sh → open http://127.0.0.1:8795/ — works in airplane mode.
