// HARZ SEARCH v0.1 — Portable Engine (pure JS, zero dependencies)
// Works in Node, Deno, Cloudflare Workers. One state, many transports.
// Steps 3 (store), 4 (inverted index), 5 (BM25), 8 (digest/export/import).
"use strict";

var STOP = new Set(("a an the of in on for to and or is are was were be been with as at by from this that it its will can has have not but if you your we they he she i us them there here do does did".split(" ")));

function tokenize(text) {
  if (!text) return [];
  var out = [], m = String(text).toLowerCase().match(/[a-z0-9][a-z0-9'-]{1,30}/g) || [];
  for (var i = 0; i < m.length; i++) {
    var t = m[i].replace(/['-]/g, "");
    if (t.length >= 2 && !STOP.has(t)) out.push(t);
  }
  return out;
}

// ---- Inverted index ----
function buildIndex(docs) {
  var terms = Object.create(null), docLens = {}, N = docs.length, totalLen = 0;
  for (var i = 0; i < N; i++) {
    var d = docs[i];
    var toks = tokenize(d.title).concat(tokenize(d.text));
    var tf = Object.create(null);
    for (var j = 0; j < toks.length; j++) tf[toks[j]] = (tf[toks[j]] || 0) + 1;
    docLens[d.id] = toks.length;
    totalLen += toks.length;
    for (var term in tf) {
      if (!terms[term]) terms[term] = { df: 0, postings: [] };
      terms[term].df++;
      terms[term].postings.push([d.id, tf[term]]);
    }
  }
  return { terms: terms, docLens: docLens, N: N, avgdl: N ? totalLen / N : 0 };
}

// ---- BM25 ranking + title bonus ----
function search(index, docs, query, limit) {
  limit = limit || 10;
  var k1 = 1.2, b = 0.75, N = index.N, avgdl = index.avgdl || 1;
  var qtoks = tokenize(query);
  if (!qtoks.length) return { results: [], total: 0 };
  var qset = Object.create(null);
  for (var q = 0; q < qtoks.length; q++) qset[qtoks[q]] = true;
  var scores = Object.create(null), matched = Object.create(null);
  for (var qi = 0; qi < qtoks.length; qi++) {
    var term = qtoks[qi];
    var e = index.terms[term];
    if (!e) continue;
    var idf = Math.log(1 + (N - e.df + 0.5) / (e.df + 0.5));
    for (var p = 0; p < e.postings.length; p++) {
      var id = e.postings[p][0], tf = e.postings[p][1];
      var dl = index.docLens[id] || avgdl;
      var s = idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avgdl));
      scores[id] = (scores[id] || 0) + s;
      matched[id] = (matched[id] || 0) + 1;
    }
  }
  // title-match bonus: term present in document title
  for (var di = 0; di < docs.length; di++) {
    var d = docs[di];
    if (scores[d.id] === undefined) continue;
    var tt = tokenize(d.title), hit = 0;
    for (var t = 0; t < tt.length; t++) if (qset[tt[t]]) hit++;
    if (hit) scores[d.id] += 1.0 * (hit / Math.max(1, qtoks.length)) * (Math.log(N + 1));
  }
  var ranked = [];
  for (var sid in scores) ranked.push([Number(sid), scores[sid], matched[sid]]);
  ranked.sort(function (a, c) { return c[1] - a[1] || (c[2] - a[2]); });
  var byId = Object.create(null);
  for (var x = 0; x < docs.length; x++) byId[docs[x].id] = docs[x];
  var results = [];
  for (var r = 0; r < Math.min(ranked.length, limit); r++) {
    var doc = byId[ranked[r][0]];
    if (!doc) continue;
    results.push({
      id: doc.id, title: doc.title, url: doc.url, domain: doc.domain,
      snippet: snippet(doc.text, qtoks), score: Math.round(ranked[r][1] * 100) / 100,
      source: doc.source, language: doc.language
    });
  }
  return { results: results, total: ranked.length };
}

function snippet(text, terms, len) {
  len = len || 170;
  if (!text) return "";
  var low = text.toLowerCase(), pos = -1, t = "";
  for (var i = 0; i < terms.length; i++) {
    pos = low.indexOf(terms[i]);
    if (pos > -1) { t = terms[i]; break; }
  }
  if (pos < 0) return text.slice(0, len) + (text.length > len ? "…" : "");
  var start = Math.max(0, pos - 60);
  return (start > 0 ? "…" : "") + text.slice(start, start + len) + (start + len < text.length ? "…" : "");
}

// ---- Deterministic digest (canonical serialization → sha256 hex) ----
// Same corpus on any node must produce the identical digest.
function canonicalIndexString(index, docs) {
  var docHashes = docs.slice().sort(function (a, b) { return a.id - b.id; })
    .map(function (d) { return d.id + ":" + d.content_hash; }).join("|");
  var terms = Object.keys(index.terms).sort();
  var parts = [];
  for (var i = 0; i < terms.length; i++) {
    var e = index.terms[terms[i]];
    var postings = e.postings.slice().sort(function (a, b) { return a[0] - b[0]; })
      .map(function (p) { return p[0] + ":" + p[1]; }).join(",");
    parts.push(terms[i] + ":" + e.df + ":" + postings);
  }
  return "HARZSEARCHv0.1|N=" + index.N + "|DOCS=" + docHashes + "|TERMS=" + parts.join("|");
}

function sha256Hex(str) {
  // Node path
  if (typeof require === "function" && typeof module !== "undefined") {
    try { return require("crypto").createHash("sha256").update(str).digest("hex"); } catch (e) {}
  }
  // Workers/Deno path (WebCrypto)
  throw new Error("async-digest"); // callers use digestAsync in non-Node runtimes
}

function digestAsync(index, docs) {
  var canonical = canonicalIndexString(index, docs);
  var te = new TextEncoder();
  if (typeof crypto !== "undefined" && crypto.subtle) {
    return crypto.subtle.digest("SHA-256", te.encode(canonical)).then(function (buf) {
      var h = "", v = new Uint8Array(buf);
      for (var i = 0; i < v.length; i++) h += v[i].toString(16).padStart(2, "0");
      return { digest: h, canonical_bytes: canonical.length };
    });
  }
  var c = require("crypto");
  return Promise.resolve({ digest: c.createHash("sha256").update(canonical).digest("hex"), canonical_bytes: canonical.length });
}

// ---- Stats ----
function stats(index, docs, crawlMeta) {
  var domains = Object.create(null);
  for (var i = 0; i < docs.length; i++) domains[docs[i].domain] = (domains[docs[i].domain] || 0) + 1;
  return {
    documents: index.N,
    domains: Object.keys(domains).length,
    unique_terms: Object.keys(index.terms).length,
    per_domain: domains,
    last_crawl: crawlMeta ? crawlMeta.last_crawl : null,
    engine: "BM25 v0.1 (k1=1.2, b=0.75) + title bonus"
  };
}

// ---- Export / Import (portable artifact) ----
function exportIndex(index, docs, crawlMeta) {
  var payload = {
    format: "HARZSEARCH-INDEX",
    version: "0.1",
    exported_at: crawlMeta ? crawlMeta.exported_at : null,
    crawl: { last_crawl: crawlMeta ? crawlMeta.last_crawl : null },
    documents: docs,
    index: {
      N: index.N, avgdl: index.avgdl, docLens: index.docLens,
      terms: index.terms
    }
  };
  return payload;
}

function importIndex(payload) {
  if (!payload || payload.format !== "HARZSEARCH-INDEX") throw new Error("BAD FORMAT");
  var docs = payload.documents;
  // Rebuild the index FROM THE DOCUMENTS — proving determinism on the importing node
  var rebuilt = buildIndex(docs);
  return { index: rebuilt, docs: docs, meta: payload.crawl };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { tokenize: tokenize, buildIndex: buildIndex, search: search, snippet: snippet,
    digestAsync: digestAsync, canonicalIndexString: canonicalIndexString, stats: stats,
    exportIndex: exportIndex, importIndex: importIndex };
}
