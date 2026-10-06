// HARZ OFFLINE READER v0.1 — Stage A (charter 13f5a70, owner Go Oct 6)
// ADDITIVE surface: reuses frozen engine.js + search-core.js + corpus artifact untouched.
// Frozen rule enforced here: a prefix is never a page, a cached page is never live,
// a URL is never proof that its content is locally available.
// Routes: / (search UI) | /search?q= | /reader/:id | /raw/:id | /health | /stats
// ZERO network by construction: local http server only, no outbound calls exist.
"use strict";
var http = require("http");
var fs = require("fs");
var E = require("./engine.js");
var C = require("./search-core.js");

// CORPUS CONTRACT PIN — corpus v0.1 sealed digest (HarzGit 7bc43d0a, contract d912243).
// Fail-closed law (principle 5): a node that cannot verify refuses to serve.
var EXPECTED_DIGEST = "8bdec9df4eb4df5ae3b1f9720d04b478092a021d93b4485832e776e562644d72";

var INDEX_PATH = process.argv[2] || "index-export.json";
var payload = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
var res = E.importIndex(payload); // fail-closed determinism proof at boot
var INDEX = res.index, DOCS = res.docs, META = res.meta;

var BYID = Object.create(null);
for (var i = 0; i < DOCS.length; i++) BYID[DOCS[i].id] = DOCS[i];
var TRUNCATED_COUNT = 0;
for (var j = 0; j < DOCS.length; j++) if ((DOCS[j].text || "").length >= 6000) TRUNCATED_COUNT++;

var view = {
  N: INDEX.N, avgdl: INDEX.avgdl,
  getTerm: function (term) {
    var e = INDEX.terms[term];
    if (!e) return null;
    var ps = e.postings.slice().sort(function (a, b) { return a[0] - b[0]; })
      .map(function (p) { return [p[0], p[1], INDEX.docLens[p[0]] || INDEX.avgdl]; });
    return { df: e.df, postings: ps };
  }
};
var getTitle = function (id) { return BYID[id] ? BYID[id].title : null; };
var getMeta = function (id) {
  var d = BYID[id];
  if (!d) return null;
  return { title: d.title, text2000: d.text.slice(0, 2000), url: d.url,
           domain: d.domain, source: d.source, language: d.language || "" };
};

var bootDigest = null;
var SEALED = false;
E.digestAsync(INDEX, DOCS).then(function (r) {
  bootDigest = r.digest;
  if (bootDigest !== EXPECTED_DIGEST) {
    console.error("FAIL-CLOSED: corpus does not seal to the pinned contract digest.");
    console.error("   expected:", EXPECTED_DIGEST);
    console.error("   computed:", bootDigest);
    console.error("   REFUSING TO SERVE — tampered or wrong-version corpus.");
    process.exit(1);
  }
  SEALED = true;
  console.log("CORPUS SEALED — digest matches pinned contract:", bootDigest.slice(0, 16) + "…");
}).catch(function (e) {
  console.error("FAIL-CLOSED: digest verification error:", e && e.message);
  process.exit(1);
});

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var isTrunc = function (d) { return (d.text || "").length >= 6000; };
var fmtDate = function (d) {
  var fa = d.fetched_at || "";
  return fa ? String(fa).slice(0, 10) : "unknown";
};

var PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f0f2f5">
<title>HARZ Reader</title>
<link rel="manifest" href="/manifest.json">
<style>
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f0f2f5;color:#1a1a2e}
main{max-width:640px;margin:0 auto;padding:16px}
h1{font-size:22px;color:#0056b3;margin:8px 0 2px}
.sub{color:#6c757d;font-size:12px;margin-bottom:14px}
form{display:flex;gap:8px}
input[type=search]{flex:1;padding:12px 14px;border:1px solid #ccc;border-radius:10px;font-size:16px;background:#fff}
button{padding:12px 18px;border:none;border-radius:10px;background:#0056b3;color:#fff;font-weight:700;font-size:14px}
.meta{font-size:11px;color:#6c757d;margin:10px 0 14px}
.res{background:#fff;border-radius:10px;padding:12px 14px;margin-bottom:10px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.res a{color:#0056b3;font-weight:700;text-decoration:none;font-size:15px}
.res .u{font-size:11px;color:#6c757d;word-break:break-all;margin:2px 0}
.res .s{font-size:13px;color:#333;line-height:1.45}
.badge{display:inline-block;font-size:10px;font-weight:700;border-radius:6px;padding:2px 7px;margin-top:5px;margin-right:4px}
.b-read{background:#e7f0ff;color:#0056b3}.b-trunc{background:#fff3cd;color:#7a5c00}.b-cached{background:#e6f4ea;color:#1a7f37}
footer{font-size:10px;color:#8a94a6;padding:14px 0;text-align:center}
mark{background:#ffe58a;border-radius:3px;padding:0 2px}
.pbar{display:flex;gap:8px;align-items:center;margin:14px 0 8px}
.pbar input{flex:1;padding:10px 12px;border:1px solid #ccc;border-radius:10px;font-size:15px;background:#fff}
.pbar button{padding:10px 14px;font-size:13px}
#mcount{font-size:12px;color:#6c757d}
.art{background:#fff;border-radius:10px;padding:18px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,.06);font-size:15px;line-height:1.7;white-space:pre-wrap;word-wrap:break-word}
.hdr{background:#fff;border-radius:10px;padding:14px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.hdr h2{margin:0 0 6px;font-size:18px;line-height:1.35}
.hdr .pv{font-size:11px;color:#6c757d;word-break:break-all}
.nav{font-size:13px;margin-bottom:12px}
.nav a{color:#0056b3;text-decoration:none}
</style></head><body><main>
<h1>HARZ Reader</h1>
<div class="sub">offline reading stage a &middot; opens the local copy, never the url</div>
<form action="/" method="get"><input type="search" name="q" placeholder="Search the index…" autofocus><button type="submit">SEARCH</button></form>
<div class="meta" id="stats"></div>
<script>
fetch('/stats').then(r=>r.json()).then(s=>{document.getElementById('stats').textContent=s.documents+' documents · '+s.truncated_texts+' stored as 6,000-char prefixes (TRUNCATED) · digest '+String(s.index_digest).slice(0,16)+'…'});
</script>
`;

var PAGE_TAIL = `<footer>HARZ Offline Reader v0.1 &middot; stage a &middot; cached copies are never presented as live</footer>
</main></body></html>`;

var server = http.createServer(function (req, res) {
  if (!SEALED) {
    res.writeHead(503, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return res.end(JSON.stringify({ status: "sealing", detail: "corpus digest verification in progress — refusing to serve unverified state" }));
  }
  var u = new URL(req.url, "http://localhost");
  var p = u.pathname;
  var send = function (code, body, type) {
    res.writeHead(code, { "Content-Type": type || "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(body);
  };

  if (p === "/health")
    return send(200, JSON.stringify({ status: "ok", mode: "reader", documents: INDEX.N, digest: bootDigest, truncated_texts: TRUNCATED_COUNT }));
  if (p === "/stats") {
    var st = E.stats(INDEX, DOCS, { last_crawl: META ? META.last_crawl : null });
    st.index_digest = bootDigest; st.mode = "reader"; st.truncated_texts = TRUNCATED_COUNT;
    return send(200, JSON.stringify(st));
  }
  if (p === "/search") {
    var q = u.searchParams.get("q") || "";
    var t0 = Date.now();
    var rk = C.rankDocs(view, getTitle, q); // frozen contract v0.1.1
    var results = C.buildResults(getMeta, rk.ranked, rk.qtoks, 12).map(function (r) {
      var d = BYID[r.id];
      return { id: r.id, title: r.title, domain: r.domain, snippet: r.snippet,
               url: d.url, truncated: d ? isTrunc(d) : false, score: r.score };
    });
    return send(200, JSON.stringify({ query: q, results: results, total: rk.total, took_ms: Date.now() - t0 }));
  }
  var rm = p.match(/^\/reader\/(\d+)$/);
  if (rm) {
    var rid = Number(rm[1]);
    var doc = BYID[rid];
    if (!doc) return send(404, JSON.stringify({ error: "not found" }));
    var trunc = isTrunc(doc);
    var html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f0f2f5">
<title>${esc(doc.title)} — HARZ Reader</title>
<link rel="manifest" href="/manifest.json">
<style>
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f0f2f5;color:#1a1a2e}
main{max-width:640px;margin:0 auto;padding:16px}
.hdr{background:#fff;border-radius:10px;padding:14px;margin-bottom:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.hdr h2{margin:0 0 6px;font-size:18px;line-height:1.35}
.hdr .pv{font-size:11px;color:#6c757d;word-break:break-all}
.badge{display:inline-block;font-size:10px;font-weight:700;border-radius:6px;padding:2px 7px;margin:6px 4px 0 0}
.b-off{background:#e7f0ff;color:#0056b3}.b-cache{background:#e6f4ea;color:#1a7f37}.b-trunc{background:#fff3cd;color:#7a5c00}
.pbar{display:flex;gap:8px;align-items:center;margin:12px 0 8px}
.pbar input{flex:1;padding:10px 12px;border:1px solid #ccc;border-radius:10px;font-size:15px;background:#fff}
.pbar button{padding:10px 12px;border:none;border-radius:10px;background:#0056b3;color:#fff;font-weight:700;font-size:13px}
#mcount{font-size:12px;color:#6c757d;margin:0 0 8px}
.art{background:#fff;border-radius:10px;padding:18px;box-shadow:0 1px 2px rgba(0,0,0,.06);font-size:15px;line-height:1.7;white-space:pre-wrap;word-wrap:break-word}
mark{background:#ffe58a;border-radius:3px;padding:0 2px}
.nav{font-size:13px;margin-bottom:10px}.nav a{color:#0056b3;text-decoration:none}
footer{font-size:10px;color:#8a94a6;padding:14px 0;text-align:center}
.note{font-size:11px;color:#8a94a6;margin-top:10px}
</style></head><body><main>
<div class="nav"><a href="/">&larr; back to search</a></div>
<div class="hdr"><h2>${esc(doc.title)}</h2>
<div class="pv">${esc(doc.url)}</div>
<span class="badge b-off">OFFLINE — served from local storage</span>
<span class="badge b-cache">CACHED — fetched ${esc(fmtDate(doc))}</span>
${trunc ? '<span class="badge b-trunc">TRUNCATED — 6,000-char prefix, not the full page</span>' : ""}
<div class="pv">content_hash ${esc(String(doc.content_hash).slice(0, 16))}</div></div>
<div class="pbar"><input type="search" id="fq" placeholder="Search within this page…"><button id="fb">FIND</button></div>
<div id="mcount"></div>
<div class="art" id="body">${esc(doc.text)}</div>
<div class="note">The URL above names the original source. It is shown for provenance only — this page renders your locally stored copy, and needs no internet. The stored copy is not live data; it is the page as fetched on ${esc(fmtDate(doc))}.</div>
<footer>HARZ Offline Reader v0.1 &middot; a prefix is never a page &middot; a cached page is never live</footer>
</main><script>
(function(){
  var raw = document.getElementById('body').textContent;
  function find(){
    var q = document.getElementById('fq').value.trim();
    var el = document.getElementById('body'), mc = document.getElementById('mcount');
    if(!q){ el.textContent = raw; mc.textContent=''; return; }
    var lq = q.toLowerCase(), lr = raw.toLowerCase();
    var idx = [], i = lr.indexOf(lq);
    while(i !== -1){ idx.push(i); i = lr.indexOf(lq, i + q.length); }
    if(!idx.length){ mc.textContent = '0 matches'; el.textContent = raw; return; }
    var out = '', pos = 0;
    for(var k = 0; k < idx.length; k++){
      out += esc(raw.slice(pos, idx[k])) + '<mark>' + esc(raw.slice(idx[k], idx[k] + q.length)) + '</mark>';
      pos = idx[k] + q.length;
    }
    out += esc(raw.slice(pos));
    el.innerHTML = out;
    var marks = el.getElementsByTagName('mark');
    marks[0].scrollIntoView({block:'center'});
    mc.textContent = idx.length + ' match' + (idx.length > 1 ? 'es' : '') + ' — tap FIND again to jump to next';
    var n = 1;
    document.getElementById('fb').onclick = function(){
      if(marks[n]){ marks[n-1] && marks[n-1].removeAttribute('id'); marks[n].scrollIntoView({block:'center'}); mc.textContent = 'match ' + (n+1) + ' of ' + idx.length; n = (n + 1) % idx.length; }
    };
    // re-arm full find on input change
    document.getElementById('fq').oninput = function(){ document.getElementById('fb').onclick = find; };
  }
  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  document.getElementById('fb').onclick = find;
})();
</script></body></html>`;
    return send(200, html, "text/html; charset=utf-8");
  }
  var raw = p.match(/^\/raw\/(\d+)$/);
  if (raw) {
    var rid2 = Number(raw[1]);
    var doc2 = BYID[rid2];
    if (!doc2) return send(404, JSON.stringify({ error: "not found" }));
    return send(200, doc2.text, "text/plain; charset=utf-8"); // byte-exact stored copy
  }
  var MANIFEST = JSON.stringify({
    name: "HARZ Reader", short_name: "HARZ Reader", start_url: "/",
    display: "standalone", background_color: "#f0f2f5", theme_color: "#f0f2f5",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }]
  });
  var SW = "var C='hreader-v1';self.addEventListener('install',function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(['/'])}))});self.addEventListener('fetch',function(e){e.respondWith(caches.match(e.request).then(function(r){return r||fetch(e.request).catch(function(){return caches.match('/')})}))});";
  var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0056b3"/><path d="M7 6h7a3 3 0 0 1 3 3v9l-3-2H7z" fill="#fff"/></svg>';
  if (p === "/manifest.json") return send(200, MANIFEST, "application/json");
  if (p === "/sw.js") return send(200, SW, "application/javascript");
  if (p === "/icon.svg") return send(200, ICON, "image/svg+xml");

  // home: search UI
  var q = u.searchParams.get("q") || "";
  var body = PAGE;
  if (q) {
    var rk = C.rankDocs(view, getTitle, q);
    var results = C.buildResults(getMeta, rk.ranked, rk.qtoks, 12);
    body += '<div class="meta">' + rk.total + ' results for &ldquo;' + esc(q) + '&rdquo; &middot; tap a title to read the LOCAL copy</div>';
    for (var k = 0; k < results.length; k++) {
      var r = results[k];
      var d = BYID[r.id];
      var trunc = d ? isTrunc(d) : false;
      body += '<div class="res"><a href="/reader/' + r.id + '">' + esc(r.title) + '</a>'
        + '<div class="u">' + esc(r.domain) + ' — read offline</div>'
        + '<div class="s">' + esc(r.snippet) + '</div>'
        + '<span class="badge b-read">READ LOCAL COPY</span>'
        + '<span class="badge b-cache">CACHED ' + (d ? esc(fmtDate(d)) : "") + '</span>'
        + (trunc ? '<span class="badge b-trunc">TRUNCATED</span>' : "")
        + '</div>';
    }
  } else {
    body += '<div class="meta">Search the index, then tap a result to read its locally stored copy — works with airplane mode ON.</div>';
  }
  body += PAGE_TAIL;
  if (p === "/" || p === "/index.html") return send(200, body, "text/html; charset=utf-8");
  send(404, JSON.stringify({ error: "not found" }));
});
server.listen(Number(process.env.PORT || 8796), function () {
  console.log("HARZ Reader node listening on", server.address().port, "| docs:", INDEX.N, "| truncated:", TRUNCATED_COUNT, "| seal: pending digest verification (fails closed on mismatch)");
});
