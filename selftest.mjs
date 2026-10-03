// HARZ NODE KIT v0.1 — SELFTEST (kit smoke, honest labels)
// This is NOT a replacement for the frozen batteries (mesh 16/16, merge 13/13,
// internetless 8/8, search federation 30/30). It verifies that THIS kit, as
// shipped, still carries the frozen laws and the field-proven receipts.
// Zero dependencies. Zero network. Run: node selftest.mjs
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const PASS = [], FAIL = [];
const check = (id, name, ok, detail) => { (ok ? PASS : FAIL).push(id + ' ' + name); console.log((ok ? 'PASS ' : 'FAIL ') + id + ' — ' + name + (detail ? '  [' + detail + ']' : '')); };

// ---- load frozen core ----
const core = require('./harz-dns-core.js');
const zoneRaw = readFileSync('./zone/SIGNED-ZONE-V2.json', 'utf8');
const zone = JSON.parse(zoneRaw);

// S1 — sealed state: pinned trust intact
{
  const ok = zone.records.length === 77 && zone.signed_by === 'ed25519:90062faa4947be141d5e18987aea5d14dd1c570329b57b0c50a3f6cddfc54c0f';
  check('S1', 'sealed zone present: 77 records, king 90062faa', ok, zone.records.length + ' records');
}
// S2 — fail-closed boot: digest + king signature verified
{
  const st = core.boot(zoneRaw);
  check('S2', 'boot verifies king signature + pinned digest cac16833', st.ok && st.digest === core.PIN.digest, st.ok ? st.digest.slice(0, 8) : 'REFUSED: ' + st.refused);
}
// S3 — field-proven resolutions, byte-match to the Oct 3 owner phone run
{
  const st = core.boot(zoneRaw);
  const want = {
    'kasuwa.harz': 'sha256:48c3a325b18c21f662729d31956d4d504c0dd7d5bdfba37767e1b1fc53e2ea6a',
    'pay.harz':    'sha256:fd258227d8dc91decff3668db3af555a9aa3dac9f04b4b7db6a91afd21f1a84b',
    'chain.harz':  'sha256:ac4c204b9aed4f7945f9320ea8264d5e6611149e687fe694cd4d0229f306c7de',
  };
  let ok = true, d = [];
  for (const [name, receipt] of Object.entries(want)) {
    const a = core.answer(st, name);
    if (a.status !== 'NOERROR' || a.receipt !== receipt) { ok = false; d.push(name + ' MISMATCH'); }
  }
  check('S3', 'kasuwa/pay/chain receipts byte-match the Oct 3 field run', ok, d.join(',') || '3/3 exact');
}
// S4 — honest NXDOMAIN, receipt byte-matches the field run
{
  const st = core.boot(zoneRaw);
  const a = core.answer(st, 'harzchain.harz');
  const want = 'sha256:f289fc0e47138dfcd05bc05f398ae0574739cf3273e67e1c6409e3eeb4c6a082';
  check('S4', 'unknown name → honest NXDOMAIN, exact field receipt', a.status === 'NXDOMAIN' && a.receipt === want, a.receipt.slice(7, 19));
}
// S5 — fail-closed: one corrupted record byte → whole zone refused, nothing served
{
  const tampered = JSON.parse(zoneRaw);
  tampered.records[3].name = tampered.records[3].name === 'arch.harz' ? 'arch.harz' : tampered.records[3].name; // keep structure
  tampered.records[3].endpoints = Object.assign({}, tampered.records[3].endpoints, { https: 'https://evil.example.com' });
  const st = core.boot(JSON.stringify(tampered));
  check('S5', 'tampered book refused — nothing served', !st.ok, 'REFUSED: ' + (st.refused || '?'));
}
// S6 — fail-closed: wrong anchor → refused
{
  const forged = JSON.parse(zoneRaw);
  forged.signed_by = 'ed25519:' + 'a'.repeat(64);
  const st = core.boot(JSON.stringify(forged));
  check('S6', 'wrong anchor refused', !st.ok && st.refused === 'WRONG ANCHOR', st.refused || '?');
}
// S7 — mesh frame round-trip: frozen transport wire format intact (byte-identical twin of Kotlin MeshFrame.kt)
{
  const mf = await import('./transport/mesh-frame.js');
  const payload = Buffer.from(JSON.stringify({ proof: 'kit-smoke', zone: 'harz' }));
  const frame = mf.data('node', 'peer', 7, 8, payload);
  const wire = mf.encodeFrame(frame);
  const back = mf.decodeFrame(wire);
  const roundTrip = back.type === mf.TYPE_DATA && back.src === 'node' && back.dst === 'peer' && back.seq === 7 && back.payload.equals(payload);
  let tamperRefused = false;
  try {
    const bad = Buffer.from(wire); bad[bad.length - 5] ^= 0x01; // corrupt CRC region
    mf.decodeFrame(bad);
  } catch (e) { tamperRefused = true; }
  check('S7', 'mesh frame round-trip + corruption refused', roundTrip && tamperRefused, roundTrip ? 'wire intact' : 'round-trip broken');
}
// S8 — merge engine determinism: shared-ancestor books, both orders, repeat run → byte-identical digest
{
  const code = readFileSync('./merge/engine-v10.js', 'utf8');
  const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const E = (new Function(code + '; return { CONTRACT, mergeBooks, verifyExport, digestOf, verifyChain, sha256hex, canonical, receiveBundle };'))();
  const SEED = Buffer.from(sha256hex('harz-node-kit-v01'), 'hex');
  const kp = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEED]), format: 'der', type: 'pkcs8' });
  const PUB = crypto.createPublicKey(kp).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const cSeal = (r) => r.prev_hash + '|' + r.kind + '|' + r.ref + '|' + r.payload;
  const sigOf = (r) => crypto.sign(null, Buffer.from(cSeal(r)), kp).toString('hex');
  const ui = { '/index.html': '<h1>kit-book</h1>' };
  const codeAssets = { '/engine.js': code };
  const uiManifest = {}, codeManifest = {};
  for (const k of Object.keys(ui).sort()) uiManifest[k] = sha256hex(ui[k]);
  for (const k of Object.keys(codeAssets).sort()) codeManifest[k] = sha256hex(codeAssets[k]);
  async function mkBook(baseRecords, extra) {
    const chain = [];
    const push = async (kind, ref, payload, sign) => {
      const prev = chain.length ? chain[chain.length - 1].hash : 'GENESIS';
      const h = await E.sha256hex(prev + '|' + kind + '|' + ref + '|' + payload);
      const s = { id: chain.length + 1, kind, ref, payload, prev_hash: prev, hash: h };
      if (sign) { s.sig = sigOf(s); s.sig_by = PUB; }
      chain.push(s); return s;
    };
    await push('ui_manifest', 'ui', JSON.stringify(uiManifest));
    await push('code_pin', 'code', JSON.stringify(codeManifest));
    await push('key_pin', 'identity', JSON.stringify({ actor: 'kit', pubkey: PUB }));
    const records = [];
    for (const [id, body, created] of baseRecords) {
      const payload = JSON.stringify({ id, body, created, actor: 'kit' });
      await push('record', String(id), payload, true);
      records.push({ id, body, created });
    }
    const state = { records, chain };
    const book = { manifest: { version: 'kit' }, state, ui_manifest: uiManifest, ui, code_manifest: codeManifest, code: codeAssets, digest: await E.digestOf(state, uiManifest, codeManifest) };
    if (extra) for (const [id, body, created] of extra) {
      const payload = JSON.stringify({ id, body, created, actor: 'kit' });
      await push('record', String(id), payload, true);
      book.state.records.push({ id, body, created });
      book.digest = await E.digestOf(book.state, uiManifest, codeManifest);
    }
    const v = await E.verifyExport(book);
    if (!v.ok) throw new Error('kit book does not verify: ' + v.verdict);
    return book;
  }
  // shared ancestor (3 records), then diverged disjoint tails — the real merge path
  const BASE = [[1, 'sovereign ledger opened', '2026-10-01T10:00:00Z'], [2, 'anchor pinned', '2026-10-01T10:30:00Z'], [3, 'identity sealed', '2026-10-01T11:00:00Z']];
  const A = await mkBook(BASE, [[4, 'X-wire-1 from Lagos node', '2026-10-01T18:00:00Z'], [5, 'X-wire-2', '2026-10-01T18:01:00Z']]);
  const B = await mkBook(BASE, [[6, 'Y-wire-1 from Kano node', '2026-10-01T18:05:00Z'], [7, 'Y-wire-2', '2026-10-01T18:06:00Z']]);
  const mAB = await E.mergeBooks({ exportA: A, exportB: B, uiManifest: uiManifest, codeManifest: codeManifest });
  const mBA = await E.mergeBooks({ exportA: B, exportB: A, uiManifest: uiManifest, codeManifest: codeManifest });
  const mAgain = await E.mergeBooks({ exportA: A, exportB: B, uiManifest: uiManifest, codeManifest: codeManifest });
  const ok = mAB.ok && mBA.ok && mAB.digest === mBA.digest && mAB.digest === mAgain.digest;
  check('S8', 'merge: lockstep A↔B + repeat run → byte-identical digest', ok, ok ? mAB.digest.slice(0, 12) : 'engine refused or diverged: ' + (mAB.verdict || '').slice(0, 60));
}
// ---- verdict ----
console.log('');
console.log(FAIL.length === 0
  ? 'HARZ NODE KIT v0.1 SELFTEST: ' + PASS.length + '/' + (PASS.length + FAIL.length) + ' PASS — kit carries the frozen laws.'
  : 'SELFTEST FAILED: ' + FAIL.length + ' check(s) broke. Do not run this kit as evidence.');
console.log('Honest labels: S1-S6 serve/resolve = FIELD-PROVEN (owner phone, Oct 3). S7 mesh, S8 merge = kit smoke only; the frozen batteries (mesh 16/16, merge 13/13) remain the evidence of record. Two-phone field runs pending.');
process.exit(FAIL.length === 0 ? 0 : 1);
