// HARZ SEARCH v0.1 — Search Node (Node.js) (STEP 6)
// GET /search?q= | /document/:id | /health | /stats | / (UI)
// Loads the exported index artifact once at boot (survives restart from disk).
"use strict";
var http = require("http");
var fs = require("fs");
var E = require("./engine.js");
var C = require("./search-core.js");

var INDEX_PATH = process.argv[2] || "corpus/index-export.json";
var payload = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
var res = E.importIndex(payload); // rebuilds index from documents — determinism proof at boot
var INDEX = res.index, DOCS = res.docs, META = res.meta;

// v0.1.1 frozen contract view: shared search-core over the imported index
var BYID = Object.create(null);
for (var i = 0; i < DOCS.length; i++) BYID[DOCS[i].id] = DOCS[i];
var view = {
  N: INDEX.N,
  avgdl: INDEX.avgdl,
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

var PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f0f2f5">
<title>HARZ Search</title>
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
.res .u{font-size:11px;color:#28811a;word-break:break-all;margin:2px 0}
.res .s{font-size:13px;color:#333;line-height:1.45}
.res .b{font-size:10px;color:#8a94a6;margin-top:4px}
footer{font-size:10px;color:#8a94a6;padding:14px 0;text-align:center}
</style></head><body><main>
<h1>HARZ Search</h1>
<div class="sub">independently indexed · portable corpus · honest ranking</div>
<form action="/" method="get"><input type="search" name="q" placeholder="Search the HARZ index…" autofocus><button type="submit">SEARCH</button></form>
<div class="meta" id="stats">loading…</div>
<div id="out"></div>
<footer>HARZ Search v0.1.1 · frozen contract · one engine, many nodes</footer>
</main>
<script>
fetch('/stats').then(r=>r.json()).then(s=>{document.getElementById('stats').textContent=s.documents+' documents · '+s.domains+' domains · '+s.unique_terms+' terms · digest '+String(s.index_digest).slice(0,16)+'…'});
var q=new URLSearchParams(location.search).get('q');
if(q){document.querySelector('input').value=q;
fetch('/search?q='+encodeURIComponent(q)).then(r=>r.json()).then(d=>{
document.getElementById('stats').textContent=d.total+' results · '+d.took_ms+' ms';
document.getElementById('out').innerHTML=d.results.map(r=>'<div class="res"><a href="'+r.url+'" target="_blank" rel="noopener">'+esc(r.title)+'</a><div class="u">'+r.url+'</div><div class="s">'+esc(r.snippet)+'</div><div class="b">'+r.domain+' · '+r.source+' · score '+r.score+'</div></div>').join('')||'<div class="res">No results.</div>';
});}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
</script>
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}</script>
</body></html>`;

var MANIFEST = JSON.stringify({name:"HARZ Search",short_name:"HARZ Search",start_url:"/",display:"standalone",background_color:"#f0f2f5",theme_color:"#f0f2f5",icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml"}]});
var SW = "const C='harz-search-v1';self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(c=>c!==C).map(c=>caches.delete(c))))));self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{if(r&&r.status===200){caches.open(C).then(c=>c.put(e.request,r.clone()))}return r}).catch(()=>caches.match(e.request)))});";
var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#f0f2f5"/><circle cx="44" cy="42" r="22" fill="none" stroke="#0056b3" stroke-width="8"/><line x1="60" y1="58" x2="84" y2="82" stroke="#0056b3" stroke-width="10" stroke-linecap="round"/></svg>';

var bootDigest = null;
E.digestAsync(INDEX, DOCS).then(function (r) { bootDigest = r.digest; });

var server = http.createServer(function (req, res) {
  var u = new URL(req.url, "http://localhost");
  var p = u.pathname;
  var send = function (code, body, type) {
    res.writeHead(code, { "Content-Type": type || "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(body);
  };
  if (p === "/health") return send(200, JSON.stringify({ status: "ok", documents: INDEX.N, digest: bootDigest }));
  if (p === "/stats") {
    var st = E.stats(INDEX, DOCS, { last_crawl: META ? META.last_crawl : null });
    st.index_digest = bootDigest;
    return send(200, JSON.stringify(st));
  }
  if (p === "/search") {
    var q = u.searchParams.get("q") || "";
    var t0 = Date.now();
    var rk = C.rankDocs(view, getTitle, q); // FROZEN CONTRACT v0.1.1 phase 1
    var results = C.buildResults(getMeta, rk.ranked, rk.qtoks, 12); // phase 2
    return send(200, JSON.stringify({ query: q, results: results, total: rk.total, took_ms: Date.now() - t0 }));
  }
  var dm = p.match(/^\/document\/(\d+)$/);
  if (dm) {
    var id = Number(dm[1]);
    var doc = BYID[id];
    if (!doc) return send(404, JSON.stringify({ error: "not found" }));
    return send(200, JSON.stringify({ id: doc.id, title: doc.title, url: doc.url,
      domain: doc.domain, source: doc.source, language: doc.language || "",
      fetched_at: doc.fetched_at, content_hash: doc.content_hash,
      redirect_chain: doc.redirect_chain || [], text: doc.text.slice(0, 2000) }));
  }
  if (p === "/" || p === "/index.html") return send(200, PAGE, "text/html; charset=utf-8");
  if (p === "/manifest.json") return send(200, MANIFEST, "application/json");
  if (p === "/sw.js") return send(200, SW, "application/javascript");
  if (p === "/icon.svg") return send(200, ICON, "image/svg+xml");
  send(404, JSON.stringify({ error: "not found" }));
});
server.listen(Number(process.env.PORT || 8787), function () {
  console.log("HARZ Search node listening on", server.address().port, "| docs:", INDEX.N, "| digest:", bootDigest);
});
