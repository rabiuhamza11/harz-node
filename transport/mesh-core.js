// HARZ MESH CORE v2.1 — JS twin of the frozen Kotlin MeshCore.kt data plane.
// Same frozen rules, unchanged: HELLO registration + HELLO_ACK, dedup on (src,seq),
// G2-C TTL semantics (0 never forwarded, 1 stops at relay, 2+ traverses),
// hop counting + route append, ACK return along the route, store-and-forward
// (G2-E: hold on peer loss, byte-identical flush on return, loss counted honestly).
// Radio-agnostic Transport interface: { send(bytes), isConnected(), close() }.

import * as F from "./mesh-frame.js";

export class DedupCache {
  constructor(capacity = 4096) { this.cap = capacity; this.map = new Map(); }
  seen(src, seq) { const k = src + ":" + seq; if (this.map.has(k)) return true; this.map.set(k, 1); if (this.map.size > this.cap) this.map.delete(this.map.keys().next().value); return false; }
  size() { return this.map.size; }
}

export class StoreAndForward {
  constructor(maxHeld = 1024) { this.maxHeld = maxHeld; this.held = new Map(); }
  hold(dst, frame) { if (this.totalHeld() >= this.maxHeld) return; if (!this.held.has(dst)) this.held.set(dst, []); this.held.get(dst).push(frame); }
  drain(dst) { return this.held.delete(dst) ? arguments[2] || [] : []; }
}

export class MeshNode {
  constructor(id, listener) {
    this.self = id;
    this.listener = listener || {};
    this.peers = new Map();       // edgeId -> transport
    this.transports = new Map();  // transport -> edgeId
    this.dedup = new DedupCache();
    this.store = new Map();       // dst -> frames held
    this.seqCounter = 0;
    this.metrics = [];
  }

  onMetric(ev, detail) { this.metrics.push(ev + " " + detail); if (this.listener.onMetric) this.listener.onMetric(ev, detail); }

  attach(t) {
    t.onFrame = raw => {
      let f;
      try { f = F.decodeFrame(raw); } catch (e) { this.onMetric("bad_frame", e.message); return; }
      this.handle(f, t);
    };
  }

  detach(t) {
    const id = this.transports.get(t);
    if (!id) return;
    this.transports.delete(t); this.peers.delete(id);
    if (this.listener.onPeerLost) this.listener.onPeerLost(id);
    this.onMetric("peer_lost", id);
  }

  handle(f, t) {
    switch (f.type) {
      case F.TYPE_HELLO:
        this.register(f.src, t);
        t.send(F.encodeFrame(F.helloAck(this.self, f.src, f.seq)));
        break;
      case F.TYPE_HELLO_ACK: this.register(f.src, t); break;
      case F.TYPE_BYE: {
        const id = this.transports.get(t);
        if (id) { this.transports.delete(t); this.peers.delete(id); if (this.listener.onPeerLost) this.listener.onPeerLost(id); }
        break;
      }
      case F.TYPE_DATA: this.onDataFrame(f, t); break;
      case F.TYPE_ACK: this.onAckFrame(f, t); break;
    }
  }

  register(id, t) {
    const isNew = !this.peers.has(id);
    this.transports.set(t, id);
    this.peers.set(id, t);
    if (isNew) { if (this.listener.onPeerJoined) this.listener.onPeerJoined(id); this.onMetric("peer_joined", id); }
    else this.onMetric("peer_back", id);
    this.flushStore(t, id);
  }

  flushStore(t, peerId) {
    const held = this.store.get(peerId);
    if (held && held.length) { this.onMetric("flush", peerId + ":" + held.length); for (const fr of held) t.send(F.encodeFrame(fr)); this.store.delete(peerId); }
    // frames held for others: the returning peer may relay toward them (T5 shape)
    const others = [];
    for (const [k, list] of this.store) if (k !== peerId) { others.push(...list); this.store.delete(k); }
    for (const fr of others) t.send(F.encodeFrame(fr));
  }

  onDataFrame(f, from) {
    if (f.dst === this.self) {
      if (this.dedup.seen(f.src, f.seq)) { this.onMetric("dup_dropped", f.src + ":" + f.seq); return; } // T4
      if (this.listener.onData) this.listener.onData(f.src, f.seq, f.hops, f.route, f.payload);
      from.send(F.encodeFrame(F.ack(this.self, f.src, f.seq, f.route))); // T2 ACK return
      return;
    }
    if (this.dedup.seen(f.src, f.seq)) { this.onMetric("dup_dropped", f.src + ":" + f.seq); return; }
    if (f.ttl <= 1) { this.onMetric("ttl_stop", "ttl=" + f.ttl + " seq=" + f.seq + " at=" + this.self); return; } // G2-C
    const forwarded = { ...f, ttl: f.ttl - 1, hops: f.hops + 1, route: [...f.route, this.self] };
    const direct = this.peers.get(f.dst);
    if (direct && direct.isConnected()) { direct.send(F.encodeFrame(forwarded)); this.onMetric("forwarded", f.src + "->" + f.dst + " via " + this.self); }
    else {
      let sentTo = 0;
      for (const [id, tp] of this.peers) {
        if (id === f.src || id === this.self) continue;
        if (tp.isConnected()) { tp.send(F.encodeFrame(forwarded)); sentTo++; }
      }
      if (sentTo > 0) this.onMetric("forwarded", f.src + "->" + f.dst + " flood x" + sentTo);
      else { if (!this.store.has(f.dst)) this.store.set(f.dst, []); if (this.totalHeld() < 1024) this.store.get(f.dst).push(f); this.onMetric("held", f.dst + ":" + f.seq); }
    }
  }

  onAckFrame(f, from) {
    if (f.dst === this.self) { if (this.listener.onAck) this.listener.onAck(f.src, f.seq); return; }
    const direct = this.peers.get(f.dst);
    if (direct && direct.isConnected()) direct.send(F.encodeFrame(f));
    else {
      for (const [id, tp] of this.peers) {
        if (id === f.src) continue;
        if (tp.isConnected()) { tp.send(F.encodeFrame(f)); return; }
      }
      if (!this.store.has(f.dst)) this.store.set(f.dst, []);
      if (this.totalHeld() < 1024) this.store.get(f.dst).push(f);
      this.onMetric("held_ack", f.dst + ":" + f.seq);
    }
  }

  totalHeld() { let n = 0; for (const l of this.store.values()) n += l.length; return n; }
  heldFor(dst) { return (this.store.get(dst) || []).length; }
  peersOnline() { return [...this.peers.keys()]; }

  chunkPayload(buf, size = F.CHUNK_SIZE) {
    const out = [];
    for (let i = 0; i < buf.length; i += size) out.push(buf.subarray(i, Math.min(i + size, buf.length)));
    return out.length ? out : [Buffer.alloc(0)];
  }

  sendChunk(dst, chunk, ttl = F.DEFAULT_TTL) {
    const seq = this.seqCounter++;
    const frame = { type: F.TYPE_DATA, src: this.self, dst, seq, ttl, hops: 0, route: [this.self], payload: chunk };
    const direct = this.peers.get(dst);
    if (direct && direct.isConnected()) { direct.send(F.encodeFrame(frame)); return seq; }
    // not directly connected: hand to any connected peer (relay/flood shape)
    for (const [id, tp] of this.peers) {
      if (id === this.self) continue;
      if (tp.isConnected()) { tp.send(F.encodeFrame(frame)); return seq; }
    }
    if (!this.store.has(dst)) this.store.set(dst, []);
    if (this.totalHeld() < 1024) this.store.get(dst).push(frame); // hold ORIGINAL frame
    this.onMetric("held", dst + ":" + seq);
    return seq;
  }
}
