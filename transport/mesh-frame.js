// HARZ MESH FRAME v2.1 — byte-exact JS twin of the frozen Kotlin MeshFrame.kt
// (frozen G1/G2 v2.1 protocol, Sep 6 report; unchanged from commit 12b5991).
// Wire layout (all big-endian):
//   magic u32 0x48415A5A | type u8 | src 4B | dst 4B | seq u32 | ttl u8 | hops u8
//   routeLen u8 | route*4B | sigLen u8 (0|64) | sig | payLen u32 | payload | crc32 u32
// CRC32 over ALL preceding bytes. Cross-verified against the Kotlin core (InteropDriver).

import { crc32 } from "zlib";

export const MAGIC = 0x48415A5A;
export const PORT_GO = 8988;
export const CHUNK_SIZE = 900;
export const CHUNK_PACING_MS = 20;
export const DEFAULT_TTL = 8;
export const MAX_ROUTE = 16;
export const TYPE_HELLO = 0x01, TYPE_HELLO_ACK = 0x02, TYPE_DATA = 0x03, TYPE_ACK = 0x04, TYPE_BYE = 0x05;

function edgeBytes(id) {
  const s = String(id);
  if (s.length !== 4) throw new Error("EdgeId must be exactly 4 chars, got '" + s + "'");
  for (const ch of s) { const c = ch.charCodeAt(0); if (c < 0x20 || c > 0x7e) throw new Error("EdgeId must be printable ASCII"); }
  return Buffer.from(s, "ascii");
}
function edgeFrom(buf, off) {
  if (buf.length - off < 4) throw new Error("EdgeId needs 4 bytes");
  return buf.toString("ascii", off, off + 4);
}

export function encodeFrame(f) {
  const route = f.route || [];
  if (route.length > MAX_ROUTE) throw new Error("route overflow: " + route.length);
  const sig = f.sig || Buffer.alloc(0);
  if (sig.length !== 0 && sig.length !== 64) throw new Error("bad sigLen " + sig.length);
  const parts = [];
  const head = Buffer.alloc(17);
  head.writeUInt32BE(MAGIC, 0);
  head.writeUInt8(f.type, 4);
  edgeBytes(f.src).copy(head, 5);
  edgeBytes(f.dst).copy(head, 9);
  head.writeUInt32BE(f.seq >>> 0, 13);
  parts.push(head);
  const th = Buffer.alloc(2);
  th.writeUInt8(f.ttl, 0);
  th.writeUInt8(f.hops, 1);
  parts.push(th);
  parts.push(Buffer.from([route.length]));
  for (const e of route) parts.push(edgeBytes(e));
  parts.push(Buffer.from([sig.length]));
  parts.push(sig);
  const plen = Buffer.alloc(4);
  plen.writeUInt32BE(f.payload ? f.payload.length : 0, 0);
  parts.push(plen);
  parts.push(f.payload || Buffer.alloc(0));
  const body = Buffer.concat(parts);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([body, crc]);
}

export function decodeFrame(raw) {
  if (raw.length < 29) throw new Error("frame too short: " + raw.length + "B");
  const magic = raw.readUInt32BE(0);
  if (magic !== MAGIC) throw new Error("bad magic 0x" + magic.toString(16).padStart(8, "0"));
  let off = 4;
  const type = raw.readUInt8(off); off += 1;
  const src = edgeFrom(raw, off); off += 4;
  const dst = edgeFrom(raw, off); off += 4;
  const seq = raw.readUInt32BE(off); off += 4;
  const ttl = raw.readUInt8(off); off += 1;
  const hops = raw.readUInt8(off); off += 1;
  const routeLen = raw.readUInt8(off); off += 1;
  if (routeLen > MAX_ROUTE) throw new Error("route overflow: " + routeLen);
  const route = [];
  for (let i = 0; i < routeLen; i++) { route.push(edgeFrom(raw, off)); off += 4; }
  const sigLen = raw.readUInt8(off); off += 1;
  if (sigLen !== 0 && sigLen !== 64) throw new Error("bad sigLen " + sigLen);
  const sig = raw.subarray(off, off + sigLen); off += sigLen;
  const payLen = raw.readUInt32BE(off); off += 4;
  if (payLen < 0 || payLen > 1_048_576) throw new Error("payload length out of bounds: " + payLen);
  const payload = raw.subarray(off, off + payLen); off += payLen;
  if (raw.length - off !== 4) throw new Error("trailing bytes after payload: " + (raw.length - off - 4));
  const crcStored = raw.readUInt32BE(off);
  const crcComputed = crc32(raw.subarray(0, off)) >>> 0;
  if (crcStored !== crcComputed) throw new Error("CRC mismatch: stored=" + crcStored + " computed=" + crcComputed);
  return { type, src, dst, seq, ttl, hops, route, sig, payload };
}

export const hello    = (id, seq = 0) => ({ type: TYPE_HELLO, src: id, dst: "    ", seq, ttl: 0, hops: 0, route: [] });
export const helloAck = (goId, to, seq) => ({ type: TYPE_HELLO_ACK, src: goId, dst: to, seq, ttl: 0, hops: 0, route: [] });
export const data     = (src, dst, seq, ttl, chunk) => ({ type: TYPE_DATA, src, dst, seq, ttl, hops: 0, route: [], payload: chunk });
export const ack      = (receiver, sender, seq, route) => ({ type: TYPE_ACK, src: receiver, dst: sender, seq, ttl: 0, hops: 0, route });
export const bye      = (id) => ({ type: TYPE_BYE, src: id, dst: "    ", seq: 0, ttl: 0, hops: 0, route: [] });
