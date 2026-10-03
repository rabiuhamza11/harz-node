// HARZ DNS CORE v0.1 — the frozen answering engine of the HARZ Network App.
//
// LAW (HarzNet Protocol Law v1):
//   - Substrate hosts, never defines. This core is substrate-free: zero network
//     calls, zero filesystem reads after boot, zero clock dependence.
//     The same file must produce byte-identical answers on every substrate.
//   - Fail-closed: a zone that cannot be verified is refused, nothing is served.
//   - Honest NXDOMAIN: unknown names are answered NXDOMAIN, never invented.
//   - Receipts on everything: every answer carries a machine-checkable receipt.
//   - Determinism is the contract: took_ms and other performance metadata are
//     outside the contract by design.
//
// PINNED TRUST (frozen):
//   KING ANCHOR : ed25519:90062faa4947be141d5e18987aea5d14dd1c570329b57b0c50a3f6cddfc54c0f
//   ZONE DIGEST : cac16833f4d43fb59115786aebb2619f471e1bc353734ffdad6a757f90928fcb
//   FLOORS      : records >= 77, height >= 1, zone == "harz"
//
// Endpoints priority (frozen): https > harz-native > mesh > dial > local.

'use strict';
const crypto = require('crypto');

const PIN = Object.freeze({
  king: '90062faa4947be141d5e18987aea5d14dd1c570329b57b0c50a3f6cddfc54c0f',
  digest: 'cac16833f4d43fb59115786aebb2619f471e1bc353734ffdad6a757f90928fcb',
  minRecords: 77,
  minHeight: 1,
  zone: 'harz',
});
const ENDPOINT_PRIORITY = Object.freeze(['https', 'harz-native', 'mesh', 'dial', 'local']);
const NAME_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.harz$/;

// ---------- canonical serialization (frozen law — identical to zone-king-sign.js) ----------
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}
function canonicalBytes(obj) { return Buffer.from(canonicalize(obj), 'utf8'); }

// ---------- boot: fail-closed verification of the sealed zone ----------
function boot(zoneJson) {
  let z;
  try { z = typeof zoneJson === 'string' ? JSON.parse(zoneJson) : zoneJson; }
  catch (e) { return refused('unparseable zone'); }
  if (!z || typeof z !== 'object') return refused('zone not an object');
  if (z.zone !== PIN.zone) return refused('wrong zone name');
  if (typeof z.height !== 'number' || z.height < PIN.minHeight) return refused('height below floor');
  if (!Array.isArray(z.records) || z.records.length < PIN.minRecords) return refused('records below floor');
  if (z.signed_by !== 'ed25519:' + PIN.king) return refused('WRONG ANCHOR');
  if (typeof z.sig !== 'string' || !/^ed25519:[0-9a-f]{128}$/.test(z.sig)) return refused('bad sig format');

  const unsigned = Object.assign({}, z); delete unsigned.sig;
  const canon = canonicalBytes(unsigned);
  const digest = crypto.createHash('sha256').update(canon).digest('hex');
  if (digest !== PIN.digest) return refused('digest mismatch');

  let sigValid = false;
  try {
    const pub = Buffer.from(PIN.king, 'hex');
    const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub]);
    sigValid = crypto.verify(null, canon, { key: spki, format: 'der', type: 'spki' },
      Buffer.from(z.sig.replace('ed25519:', ''), 'hex'));
  } catch (e) { sigValid = false; }
  if (!sigValid) return refused('KING SIG INVALID');

  // strict record validation + index build
  const index = new Map();
  for (const r of z.records) {
    if (!r || typeof r.name !== 'string' || !NAME_RE.test(r.name)) return refused('bad record name');
    if (index.has(r.name)) return refused('duplicate record name');
    const ep = r.endpoints && typeof r.endpoints === 'object' ? r.endpoints : {};
    const primary = ENDPOINT_PRIORITY.find(k => typeof ep[k] === 'string' && ep[k]);
    index.set(r.name, { name: r.name, service: r.service || '', endpoints: ep, primary: primary ? ep[primary] : '' , via: primary || '' });
  }
  return { ok: true, digest, height: z.height, records: index.size, signedBy: z.signed_by, index };
}
function refused(reason) { return { ok: false, refused: reason }; }

// ---------- answer: deterministic, receipt-carrying ----------
// state = successful boot() result.
function answer(state, name) {
  if (!state || !state.ok) return { name, status: 'REFUSED', reason: state && state.refused ? state.refused : 'no state' };
  const n = String(name || '').toLowerCase().trim().replace(/\.$/, '');
  const rec = state.index.get(n);
  if (!rec) {
    const receipt = receiptOf(state.digest, n, 'NXDOMAIN', '');
    return { name: n, status: 'NXDOMAIN', endpoint: '', receipt };
  }
  const receipt = receiptOf(state.digest, n, 'NOERROR', rec.primary);
  return { name: n, status: 'NOERROR', service: rec.service, endpoint: rec.primary, via: rec.via, receipt };
}
function receiptOf(digest, name, status, endpoint) {
  return 'sha256:' + crypto.createHash('sha256')
    .update('harz-dns-core/v1|' + name + '|' + status + '|' + endpoint + '|' + digest, 'utf8')
    .digest('hex');
}

module.exports = { PIN, boot, answer, canonicalize };
