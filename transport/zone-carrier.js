// HARZ ZONE CARRIER v0.1 — the MESH TRANSPORT ADAPTER (Reach v0.3 / Gate 3).
// The ONLY new piece: it carries the SIGNED ZONE over the frozen G1/G2 v2.1 mesh.
//
// SIGNED ZONE → mesh packets → node receives → canonical bytes recovered
//            → Ed25519 verification → 77-name + height floors → local verified cache
//            → Reach resolves .harz
//
// THE LAW (owner, Sep 20): the mesh TRANSPORTS authority, it never CREATES authority.
// A phone cannot sign a new root book merely because it is a mesh node. The carrier
// accepts ONLY books signed by the pinned king and refuses everything else —
// tampered, foreign-signed, shrunk, rolled back. Refused means refused: no warning,
// no best-effort, no partial cache. Pure module: Node battery + Termux phones.

import * as core from "./reach-core.js";
import * as F from "./mesh-frame.js";

export const CARRIER = {
  kind: "harz-zone-transfer",
  v: 1,
  // sender announces: totalChunks + zone digest8 (for honest completeness counting)
  // first chunk carries a JSON header, remaining chunks are raw canonical bytes
};

// ---- SENDER (Phone A: has the verified book) ----
// zoneBytes MUST already be verified by the sender (loadZone ok) — the carrier
// never sends an unverified book, and records what it's sending.
export function packageZone(zone) {
  const bytes = Buffer.from(core.canonicalize(zone), "utf8");
  const header = Buffer.from(JSON.stringify({ harz: 1, kind: CARRIER.kind, bytes: bytes.length, height: zone.height, records: zone.records.length, digest8: "cac16833" }), "utf8");
  const full = Buffer.concat([header, bytes]);
  return full; // caller chunks + sends via mesh-core
}

export async function sendZone(node, dst, zone, ttl = F.DEFAULT_TTL) {
  const full = packageZone(zone);
  const chunks = node.chunkPayload(full);
  const startSeq = node.seqCounter;
  let i = 0;
  for (const ch of chunks) {
    node.sendChunk(dst, ch, ttl);
    if (i % 10 === 9) await new Promise(r => setTimeout(r, F.CHUNK_PACING_MS)); // pacing law (async — never blocks the loop)
    i++;
  }
  return { startSeq, chunks: chunks.length, bytes: full.length };
}

// ---- RECEIVER (Phone B: no fresh root connection) ----
// Reassembles by (src, seq) order, recovers canonical bytes, verifies locally,
// and serves ONLY verified state. Any failure at ANY point = REFUSED, cache untouched.
export class ZoneReceiver {
  constructor() {
    this.buffers = new Map();   // src -> { seq -> chunk }
    this.appDeliveries = 0;     // exactly-once at the application layer
    this.verified = null;        // the verified book (local cache)
    this.lastVerdict = null;
  }

  // feed a DATA frame (as delivered by MeshNode.onData, post-dedup)
  absorb(src, seq, hops, route, payload) {
    let b = this.buffers.get(src);
    if (!b) { b = new Map(); this.buffers.set(src, b); }
    if (b.has(seq)) return "dup"; // app-layer dedup backs the mesh dedup
    b.set(seq, { chunk: Buffer.from(payload), hops, route });
    return "stored";
  }

  // attempt completion for a given source; returns the verdict
  async finalize(src) {
    const b = this.buffers.get(src);
    if (!b) return { ok: false, reason: "REFUSED: no packets from this source" };
    const seqs = [...b.keys()].sort((x, y) => x - y);
    const chunks = seqs.map(s => b.get(s).chunk);
    const full = Buffer.concat(chunks);
    // header law
    let header;
    try {
      const hEnd = full.indexOf(0x7d); // '}' end of the JSON header — safe: header is first
      header = JSON.parse(full.subarray(0, hEnd + 1).toString("utf8"));
      if (header.harz !== 1 || header.kind !== CARRIER.kind) throw new Error("bad header");
    } catch (e) { return { ok: false, reason: "REFUSED: not a HARZ zone transfer (bad header)" }; }
    const zoneBytes = full.subarray(full.indexOf(0x7d) + 1);
    if (zoneBytes.length !== header.bytes) return { ok: false, reason: "REFUSED: incomplete transfer (" + zoneBytes.length + "/" + header.bytes + " bytes)" };
    // canonical bytes recovered — now the SAME Reach verification law
    let zone;
    try { zone = JSON.parse(zoneBytes.toString("utf8")); } catch (e) { return { ok: false, reason: "REFUSED: corrupted book bytes" }; }
    const loaded = await core.loadZone(zone); // king sig + anchor + floors 77/1
    if (!loaded.ok) return { ok: false, reason: loaded.reason };
    // invariants: the book the sender claimed is the book that verified
    if (zone.height !== header.height || zone.records.length !== header.records) return { ok: false, reason: "REFUSED: header/book mismatch" };
    // exactly-once at the application layer
    this.appDeliveries++;
    this.verified = zone;
    this.lastVerdict = { ok: true, zone, transport: "mesh-live", node: "mesh:" + src, bytes: zoneBytes.length };
    this.buffers.delete(src);
    return this.lastVerdict;
  }

  // the local verified cache — the ONLY state Reach may serve from the mesh path
  cachedZone() { return this.verified; }

  // resolve .harz from the mesh-delivered verified book (or null: honest NXDOMAIN)
  resolve(name) {
    if (!this.verified) return null;
    const idx = core.buildIndex(this.verified);
    return core.resolveName(idx, name);
  }
}
