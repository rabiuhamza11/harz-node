// HARZ DOOR v0.1 — local HTTP door for the desktop adapter.
// The DNSD points every verified *.harz name at 127.0.0.1; this door reads the
// Host header, asks the frozen core for the endpoint, and opens it (302).
// Offline: names with local/harz-native endpoints still serve; internet
// endpoints honestly need the internet — the namespace never lies about that.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const core = require('./harz-dns-core.js');

const PORT = process.env.HARZ_DOOR_PORT ? parseInt(process.env.HARZ_DOOR_PORT, 10) : 80;
const HOST = '127.0.0.1';
const zonePath = process.env.HARZ_ZONE || path.join(__dirname, '..', '..', 'harz-root-v2', 'zone-king', 'SIGNED-ZONE-V2.json');
const state = core.boot(JSON.parse(fs.readFileSync(zonePath, 'utf8')));
if (!state.ok) { console.error('BOOT REFUSED — FAIL-CLOSED:', state.refused); process.exit(1); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const host = (req.headers.host || '').split(':')[0].toLowerCase().trim();
  // the HARZ address bar page
  if (url.pathname === '/' && host !== 'harz' && !host.endsWith('.harz')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'harz-netapp-browser.html'), 'utf8'));
    return;
  }
  // resolve API: name → sealed answer + receipt
  if (url.pathname === '/resolve') {
    const a = core.answer(state, url.searchParams.get('name') || '');
    res.writeHead(a.status === 'NOERROR' ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(a));
    console.log(new Date().toISOString(), 'RESOLVE-API', a.name, a.status, a.receipt.slice(7, 19));
    return;
  }
  if (host !== 'harz' && !host.endsWith('.harz')) {
    res.writeHead(404); res.end('HARZ DOOR — unknown host'); return;
  }
  const a = core.answer(state, host);
  if (a.status !== 'NOERROR' || !a.endpoint) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('HARZ: ' + host + ' does not exist in the sealed zone. Honest NXDOMAIN. Receipt ' + a.receipt);
    return;
  }
  console.log(new Date().toISOString(), 'DOOR', host, '→', a.endpoint, 'rcpt', a.receipt.slice(7, 19));
  res.writeHead(302, { location: a.endpoint, 'x-harz-receipt': a.receipt });
  res.end('Opening ' + host + ' → ' + a.endpoint);
});
server.listen(PORT, HOST, () => console.log('HARZ DOOR v0.1 on ' + HOST + ':' + PORT + ' | zone digest ' + state.digest.slice(0, 8)));
