#!/usr/bin/env node
// HARZ INTERNETLESS v0.1 — LOCAL MESH PROOF (frozen milestone)
// One file. Zero dependencies (Node 18+ built-ins only). Ordinary phones (Termux) + any software-capable node.
// LAW: HARZ continues to function when the Internet disappears.
// Operations: init (identity) | whoami | serve (discovery+receive+verify+store) | send (signed message)
//            | inbox | forward (store-and-forward relay) | prove-offline (honest Internet-gone proof)
// The private key NEVER prints. The private key NEVER enters any chat. It lives in identity.json on the device only.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const DIR = process.env.HARZ_NODE_DIR || process.cwd();
const IDFILE = path.join(DIR, "identity.json");
const INBOX = path.join(DIR, "inbox.jsonl");

function die(m) { console.error("REFUSED:", m); process.exit(1); }
function loadId() {
  if (!fs.existsSync(IDFILE)) die("no identity here — run: node internetless-node.js init --name NAME");
  const id = JSON.parse(fs.readFileSync(IDFILE, "utf8"));
  if (!id.priv || !id.pub) die("identity file corrupt");
  return id;
}
function privKey(id) { return crypto.createPrivateKey(id.priv); }
function pubKey(pem) { return crypto.createPublicKey(pem); }
function pubHex(k) { return k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex"); }
function shortPub(h) { return h.slice(0, 8); }

// canonical envelope bytes: FIXED key order, no whitespace (frozen law — any change forks the protocol)
function canonical(env) {
  return JSON.stringify({ from: env.from, name: env.name, text: env.text, ts: env.ts, nonce: env.nonce });
}
function sign(id, env) {
  return crypto.sign(null, Buffer.from(canonical(env), "utf8"), privKey(id)).toString("hex");
}
function verifyEnvelope(env) {
  if (!env || !env.from || typeof env.text !== "string" || !env.ts || !env.nonce) return { ok: false, why: "malformed" };
  const pub = "302a300506032b6570032100" + env.from;
  const k = crypto.createPublicKey({ key: Buffer.from(pub, "hex"), format: "der", type: "spki" });
  const ok = crypto.verify(null, Buffer.from(canonical(env), "utf8"), k, Buffer.from(env.sig, "hex"));
  return ok ? { ok: true } : { ok: false, why: "SIGNATURE FAILED" };
}
function readInbox() {
  if (!fs.existsSync(INBOX)) return [];
  return fs.readFileSync(INBOX, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function appendInbox(rec) {
  fs.appendFileSync(INBOX, JSON.stringify(rec) + "\n");
}
function localIPs() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) for (const i of ifs[name] || []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  return out;
}
function postJSON(host, port, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), "utf8");
    const req = http.request({ host, port, path: "/msg", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length }, timeout: timeoutMs }, res => {
      let b = ""; res.on("data", c => b += c); res.on("end", () => { try { resolve(JSON.parse(b)); } catch { reject(new Error("bad peer response")); } });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("peer unreachable")); });
    req.on("error", reject);
    req.end(data);
  });
}
function getJSON(host, port, p, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: p, timeout: timeoutMs }, res => {
      let b = ""; res.on("data", c => b += c); res.on("end", () => { try { resolve(JSON.parse(b)); } catch { reject(new Error("bad peer response")); } });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("peer unreachable")); });
    req.on("error", reject);
  });
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const cmd = process.argv[2];

async function main() {
  if (cmd === "init") {
    const name = arg("--name") || die("usage: init --name NODE_A");
    if (fs.existsSync(IDFILE)) die("identity already exists in this folder");
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const id = { name, pub: pubHex(publicKey), priv: privateKey.export({ type: "pkcs8", format: "pem" }), created: new Date().toISOString() };
    fs.writeFileSync(IDFILE, JSON.stringify(id, null, 2), { mode: 0o600 });
    console.log("IDENTITY CREATED (private key saved to identity.json on this device only — never printed, never sent)");
    console.log("NAME:", name);
    console.log("PUB:", id.pub, "(" + shortPub(id.pub) + ")");
  } else if (cmd === "whoami") {
    const id = loadId();
    console.log("NAME:", id.name);
    console.log("PUB:", id.pub, "(" + shortPub(id.pub) + ")");
    console.log("LOCAL IPS:", localIPs().join(", ") || "none");
  } else if (cmd === "serve") {
    const id = loadId();
    const port = Number(arg("--port", "8990"));
    const inbox = readInbox();
    const seen = new Set(inbox.map(r => r.envelope && r.envelope.nonce).filter(Boolean));
    const server = http.createServer((req, res) => {
      const reply = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (req.method === "GET" && req.url === "/whoami") {
        return reply(200, { ok: true, protocol: "harz-internetless/0.1", pub: id.pub, name: id.name, peers_seen: seen.size });
      }
      if (req.method === "GET" && req.url === "/inbox") {
        const all = readInbox();
        return reply(200, { count: all.length, inbox: all.slice(-20) });
      }
      if (req.method === "POST" && req.url === "/msg") {
        let b = ""; req.on("data", c => b += c);
        req.on("end", () => {
          let env; try { env = JSON.parse(b); } catch { return reply(400, { ok: false, why: "not json" }); }
          const v = verifyEnvelope(env);
          if (!v.ok) {
            appendInbox({ envelope: env, verified: false, why: v.why, received_at: new Date().toISOString() });
            console.log("RECEIVED from", shortPub(env.from || "?"), "-> SIGNATURE FAILED (stored, marked unverified)");
            return reply(200, { ok: true, verified: false, why: v.why });
          }
          if (seen.has(env.nonce)) return reply(200, { ok: true, verified: true, duplicate: true, note: "already stored" });
          seen.add(env.nonce);
          appendInbox({ envelope: env, verified: true, received_at: new Date().toISOString() });
          console.log("RECEIVED from", env.name, "(" + shortPub(env.from) + "):", JSON.stringify(env.text));
          console.log("VERIFIED: signature VALID — stored in inbox");
          reply(200, { ok: true, verified: true, from_short: shortPub(env.from) });
        });
        return;
      }
      reply(404, { ok: false });
    });
    server.listen(port, () => {
      console.log("HARZ INTERNETLESS NODE serving (no Internet required)");
      console.log("NAME:", id.name, "| PUB short:", shortPub(id.pub));
      console.log("PEERS: connect to -> " + localIPs().map(ip => ip + ":" + port).join("  or  "));
    });
  } else if (cmd === "send") {
    const id = loadId();
    const to = arg("--to") || die("usage: send --to IP:PORT --text \"...\"");
    const text = arg("--text") || die("missing --text");
    const [host, port] = to.split(":");
    const env = { from: id.pub, name: id.name, text, ts: Date.now(), nonce: crypto.randomBytes(16).toString("hex") };
    env.sig = sign(id, env);
    const r = await postJSON(host, Number(port), env, 8000);
    console.log("SENT to", to, "->", JSON.stringify(r));
    if (r && r.verified === true) console.log("PEER VERIFIED MY SIGNATURE — offline packet delivered");
    else if (r && r.duplicate) console.log("peer already had this message (dedup by nonce)");
    else if (r && r.verified === false) console.log("peer REFUSED my signature:", r.why);
  } else if (cmd === "inbox") {
    const all = readInbox();
    console.log("INBOX:", all.length, "messages (disk-persisted, survives restart)");
    for (const r of all.slice(-20)) {
      const e = r.envelope || {};
      console.log((r.verified ? "[VERIFIED]" : "[FAILED]"), shortPub(e.from || "?"), e.name || "?", "->", JSON.stringify(e.text || ""), "| received", r.received_at);
    }
  } else if (cmd === "forward") {
    const id = loadId();
    const to = arg("--to") || die("usage: forward --to IP:PORT (relays stored verified messages onward)");
    const [host, port] = to.split(":");
    const all = readInbox().filter(r => r.verified && r.envelope);
    if (!all.length) die("nothing verified to forward");
    let sent = 0, dup = 0;
    for (const r of all) {
      const res = await postJSON(host, Number(port), r.envelope, 8000);
      if (res.verified === true) sent++;
      if (res.duplicate) dup++;
    }
    console.log("FORWARDED", sent, "verified message(s) onward,", dup, "duplicate(s) skipped by receiver");
  } else if (cmd === "prove-offline") {
    const to = arg("--peer") || die("usage: prove-offline --peer IP:PORT");
    const [host, port] = to.split(":");
    // leg 1: Internet must be GONE (honest probe, 4s timeout)
    let internetGone = false, probeWhy = "reachable";
    await new Promise(res => {
      const req = http.get({ host: "www.cloudflare.com", port: 80, path: "/", timeout: 4000 }, r => { r.resume(); res(); });
      req.on("timeout", () => { req.destroy(); internetGone = true; probeWhy = "timeout"; res(); });
      req.on("error", e => { internetGone = true; probeWhy = e.code || "unreachable"; res(); });
    });
    // leg 2: the HARZ peer must answer
    let peer = null, peerErr = null;
    try { peer = await getJSON(host, Number(port), "/whoami", 6000); } catch (e) { peerErr = e.message; }
    console.log("LEG 1 — Internet probe: " + (internetGone ? "FAILED (" + probeWhy + ") — Internet is GONE, as required" : "REACHABLE — WARNING: Internet still up; turn off mobile data + wifi internet and re-run"));
    if (peer && peer.ok) console.log("LEG 2 — HARZ peer: ANSWERED -> " + peer.name + " (" + shortPub(peer.pub) + "), protocol " + peer.protocol);
    else console.log("LEG 2 — HARZ peer: UNREACHABLE (" + (peerErr || "no answer") + ")");
    if (internetGone && peer && peer.ok) console.log("VERDICT: INTERNET GONE, HARZ ALIVE — the sentence stands: HARZ continues to function when the Internet disappears.");
    else console.log("VERDICT: NOT YET PROVEN — fix the failed leg(s) and re-run. No honest claim until both legs pass.");
  } else if (cmd === "verify") {
    // standalone: verify a saved envelope against its embedded pub (mechanical proof, in-band)
    const file = arg("--file") || die("usage: verify --file envelope.json");
    const env = JSON.parse(fs.readFileSync(file, "utf8"));
    const v = verifyEnvelope(env);
    console.log(v.ok ? "SIGNATURE VALID from " + shortPub(env.from) : "SIGNATURE FAILED (" + v.why + ")");
    process.exit(v.ok ? 0 : 1);
  } else {
    console.log("HARZ INTERNETLESS v0.1 — Local Mesh Proof");
    console.log("commands: init --name X | whoami | serve [--port 8990] | send --to IP:PORT --text \"..\" | inbox | forward --to IP:PORT | prove-offline --peer IP:PORT | verify --file f.json");
  }
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
