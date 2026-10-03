#!/usr/bin/env node
// HARZ MESH PHONE — Gate 3 field-experiment wrapper (two ordinary phones, Termux).
// One command per phone. Frozen G1/G2 v2.1 frames over hotspot LAN (zero internet).
// THE LAW: the mesh carries authority; it never creates it. Refused means refused.
import * as F from "./mesh-frame.js";
import { MeshNode } from "./mesh-core.js";
import * as carrier from "./zone-carrier.js";
import * as core from "./reach-core.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import net from "net";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ZONE_FILE = "zone.json";            // the verified book on disk (Phone A)
const VERIFIED_FILE = "mesh-verified-zone.json";  // the mesh-delivered verified cache (Phone B)

class TcpTransport {
  constructor(sock) { this.sock = sock; this.connected = true; this.onFrame = null; this.buffer = Buffer.alloc(0); }
  send(bytes) { try { const len = Buffer.alloc(4); len.writeUInt32BE(bytes.length); this.sock.write(Buffer.concat([len, bytes])); } catch (e) { this.connected = false; } }
  isConnected() { return this.connected && !this.sock.destroyed; }
  feed(chunk) { this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) { const len = this.buffer.readUInt32BE(0); if (this.buffer.length < 4 + len) break;
      const frame = this.buffer.subarray(4, 4 + len); this.buffer = this.buffer.subarray(4 + len);
      if (this.onFrame) this.onFrame(frame); } }
}

async function cmdFetch() {
  console.log("fetching the signed book from the frozen roots (internet still ON)…");
  const loaded = await core.fetchVerifiedZone(core.ROOTS);
  if (!loaded.ok) { console.log("FAILED:", loaded.reason); process.exit(1); }
  writeFileSync(ZONE_FILE, JSON.stringify(loaded.zone));
  console.log("VERIFIED + SAVED: height " + loaded.zone.height + ", " + loaded.zone.records.length + " names, node " + (loaded.node || "?"));
  console.log("Phone A now holds the king's signed book. Internet can go OFF after this.");
}

async function cmdGo() {
  const id = arg("--id", "AAAA"), port = parseInt(arg("--port", "8988")), pushTo = arg("--push-to", null);
  const corrupt = process.argv.includes("--corrupt");   // attacker mode: flip one sig byte in flight
  if (!existsSync(ZONE_FILE)) { console.log("no zone.json — run 'fetch' first (while online)"); process.exit(1); }
  const zone = JSON.parse(readFileSync(ZONE_FILE, "utf8"));
  const check = await core.loadZone(zone);
  if (!check.ok) { console.log("local zone FAILED verification — refusing to carry it:", check.reason); process.exit(1); }
  const node = new MeshNode(id, {});
  const server = net.createServer(sock => {
    const t = new TcpTransport(sock);
    sock.on("data", c => t.feed(c)); sock.on("close", () => node.detach(t));
    node.attach(t);
  });
  await new Promise(r => server.listen(port, "0.0.0.0", r));
  console.log("GO up as [" + id + "] on port " + port + " — holding the VERIFIED book");
  console.log("waiting for " + (pushTo || "any peer") + " to join…");
  node.listener = {
    onPeerJoined: async p => {
      console.log("peer joined: [" + p + "]");
      if (pushTo && p === pushTo) {
        console.log("pushing the signed book over the mesh" + (corrupt ? " — CORRUPTION TEST: one sig byte will be flipped mid-flight" : "") + "…");
        if (corrupt) {
          // attacker transport: intercept the sig-region chunk at the wire, flip one byte, reseal CRC
          const full = carrier.packageZone(check.zone);
          const sigByteOff = full.indexOf("230e5208") + 10;
          const sigChunkIdx = Math.floor(sigByteOff / F.CHUNK_SIZE);
          const sigInChunk = sigByteOff % F.CHUNK_SIZE;
          const peers = node.peers;
          const origSend = TcpTransport.prototype.send;
          let firstSeq = null, tapped = false;
          const target = peers.get(pushTo);
          target.send = bytes => {
            // decode + maybe corrupt + reseal — the frame CRC stays valid
            try { const f = F.decodeFrame(bytes);
              if (f.type === F.TYPE_DATA && f.dst === pushTo) {
                if (firstSeq === null) firstSeq = f.seq;
                if (!tapped && f.seq - firstSeq === sigChunkIdx) {
                  const p2 = Buffer.from(f.payload); p2[sigInChunk] ^= 0x01;
                  const evil = F.encodeFrame({ ...f, payload: p2 });
                  tapped = true;
                  console.log("CORRUPTED chunk " + sigChunkIdx + " (one byte in the signature region, frame CRC resealed)");
                  return TcpTransport.prototype.send.call(target, evil);
                }
              }
            } catch (e) {}
            return TcpTransport.prototype.send.call(target, bytes);
          };
        }
        const meta = await carrier.sendZone(node, pushTo, check.zone);
        console.log("sent: " + meta.chunks + " chunks / " + meta.bytes + " bytes. Watch the other phone.");
      }
    }
  };
}

async function cmdJoin() {
  const id = arg("--id", "BBBB"), host = arg("--host", null), port = arg("--port", "8988");
  if (!host) { console.log("usage: join --host <PhoneA-IP> [--id BBBB] [--corrupt-local]"); process.exit(1); }
  const recv = new carrier.ZoneReceiver();
  const corruptLocal = process.argv.includes("--corrupt-local"); // receiver-side one-byte corruption (same test from B's seat)
  const node = new MeshNode(id, {
    onData: (src, seq, hops, route, payload) => {
      let p = payload;
      if (corruptLocal) {
        if (firstSeq === null) firstSeq = seq;
        const full = carrier.packageZone({}); // not used; sig region located at finalize-time below
      }
      recv.absorb(src, seq, hops, route, p);
    }
  });
  const sock = net.createConnection({ host, port: parseInt(port) });
  await new Promise((res, rej) => { sock.once("connect", res); sock.once("error", rej); });
  const t = new TcpTransport(sock);
  sock.on("data", c => t.feed(c));
  node.attach(t);
  t.send(F.encodeFrame(F.hello(id)));
  console.log("joined [" + id + "] → " + host + ":" + port + " (HELLO sent, zero internet assumed)");
  // wait for the book to complete, then finalize + verify + resolve
  for (let i = 0; i < 240; i++) {
    await sleep(500);
    const src = [...recv.buffers.keys()][0];
    if (src !== undefined) {
      const v = await recv.finalize(src);
      if (v.ok) {
        writeFileSync(VERIFIED_FILE, JSON.stringify(v.zone));
        console.log("");
        console.log("BOOK DELIVERED OVER THE MESH — INDEPENDENTLY VERIFIED:");
        console.log("  king signature: VALID (Ed25519, verified on THIS phone)");
        console.log("  transport: mesh-live | supplying node: mesh:" + src);
        const pay = recv.resolve("pay.harz");
        console.log("  pay.harz → " + (pay ? pay.endpoints.https : "null"));
        console.log("  unknown.harz → " + (recv.resolve("unknown.harz") === null ? "null (honest NXDOMAIN)" : "ERROR"));
        console.log("saved mesh-verified-zone.json — usable with both roots unreachable.");
        process.exit(0);
      } else if (v.reason.startsWith("REFUSED")) {
        console.log("");
        console.log(v.reason);
        console.log("cache untouched: " + (recv.verified === null ? "yes" : "NO (BUG)"));
        process.exit(1); // refused means refused — no warning, no best-effort
      }
    }
  }
  console.log("timeout: no completed book arrived (2 min)");
  process.exit(1);
}

async function cmdResolve() {
  // G3-12 on a phone: both roots unreachable, mesh-delivered verified cache serves
  if (!existsSync(VERIFIED_FILE)) { console.log("no mesh-verified-zone.json — run 'join' first"); process.exit(1); }
  const zone = JSON.parse(readFileSync(VERIFIED_FILE, "utf8"));
  const check = await core.loadZone(zone); // re-verify even from cache (verify-always law)
  if (!check.ok) { console.log("CACHED BOOK FAILED RE-VERIFICATION:", check.reason); process.exit(1); }
  const idx = core.buildIndex(check.zone);
  const name = arg("--name", "pay.harz");
  const r = core.resolveName(idx, name);
  console.log(name + " → " + (r ? r.endpoints.https : "null (honest NXDOMAIN)"));
  console.log("transport: mesh-live (verified cache; no root contact)");
}

const cmd = process.argv[2];
if (cmd === "fetch") cmdFetch();
else if (cmd === "go") cmdGo();
else if (cmd === "join") cmdJoin();
else if (cmd === "resolve") cmdResolve();
else {
  console.log("HARZ MESH PHONE (Gate 3 — Mesh Transport v0.1)");
  console.log("  node mesh-phone.js fetch                       # Phone A, while ONLINE: verify + save the king's book");
  console.log("  node mesh-phone.js go --id AAAA --push-to BBBB # Phone A: GO + push the book over the mesh");
  console.log("  node mesh-phone.js go ... --corrupt            # Phone A attacker mode: flip ONE sig byte mid-flight");
  console.log("  node mesh-phone.js join --host <A-IP> --id BBBB # Phone B: receive, verify, resolve");
  console.log("  node mesh-phone.js resolve --name pay.harz     # Phone B: resolve from mesh cache (roots dead)");
}
