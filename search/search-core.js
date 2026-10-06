// HARZ SEARCH v0.1.1 — FROZEN SEARCH CONTRACT (search-core.js)
// ONE engine, many nodes. Both Node A (sandbox) and Node B (Cloudflare Worker)
// bundle this exact file. Same corpus + same query = byte-identical results.
//
// FROZEN LAWS (v0.1.1 — changing any of these changes the contract version):
//  L1 Tokenizer: lowercase; tokens match /[a-z0-9][a-z0-9'-]{1,30}/g;
//     strip '-' and '''; min length 2; stopword list below. No stemming.
//  L2 Query: tokenize once, dedupe preserving first-occurrence order.
//  L3 Matching: AND — every query token must appear in the doc's
//     (title+body) postings. Any unknown token => zero results.
//  L4 BM25: k1=1.2, b=0.75, idf = ln(1 + (N - df + 0.5)/(df + 0.5)),
//     dl = doc token count (title+body), avgdl = mean doc length.
//     Accumulation order: terms in query order, postings ascending by doc id
//     (floating-point determinism requires identical addition order).
//  L5 Title bonus: hit = count of title-token occurrences present in the
//     query set; score += (hit / nQueryTokens) * ln(N + 1).
//  L6 Ordering: score DESC, then matched-term-count DESC, then doc id ASC.
//  L7 Score: rounded to 2 decimals.
//  L8 Snippet: computed over the FIRST 2000 chars of stored text; window 170;
//     first occurrence of any query token (query order); '…' markers.
//  L9 Result shape (key order frozen): {id,title,url,domain,snippet,score,
//     source,language}. Response: {query,results,total,took_ms};
//     took_ms is performance metadata, EXCLUDED from the determinism contract.
//  L10 Limit: 12 results. total = number of AND-matched docs.
//
// Two phases so remote backends can batch-fetch between them:
//   phase 1  rankDocs(view, getTitle, query) -> {ranked:[[id,score,matched]…], total, qtoks}
//   phase 2  buildResults(getMeta, query, ranked) -> results[]
// Both phases run the identical math on every node.
"use strict";

var STOP = new Set(("a an the of in on for to and or is are was were be been with as at by from this that it its will can has have not but if you your we they he she i us them there here do does did").split(" "));

function tokenize(text) {
  if (!text) return [];
  var out = [], m = String(text).toLowerCase().match(/[a-z0-9][a-z0-9'-]{1,30}/g) || [];
  for (var i = 0; i < m.length; i++) {
    var t = m[i].replace(/['-]/g, "");
    if (t.length >= 2 && !STOP.has(t)) out.push(t);
  }
  return out;
}

function queryTokens(query) {
  var toks = tokenize(query), seen = Object.create(null), out = [];
  for (var i = 0; i < toks.length; i++) {
    if (!seen[toks[i]]) { seen[toks[i]] = 1; out.push(toks[i]); }
  }
  return out;
}

// phase 1 — ranking (needs only term postings + doc titles)
// view = { N, avgdl, getTerm(term) -> {df, postings:[[id,tf,len],…]} | null }
// getTitle(id) -> string (both backends have titles cheap)
function rankDocs(view, getTitle, query) {
  var k1 = 1.2, b = 0.75, N = view.N, avgdl = view.avgdl || 1;
  var qtoks = queryTokens(query);
  if (!qtoks.length) return { ranked: [], total: 0, qtoks: qtoks };

  // L3 AND law: every term must exist
  var termData = [];
  for (var i = 0; i < qtoks.length; i++) {
    var e = view.getTerm(qtoks[i]);
    if (!e || !e.postings.length) return { ranked: [], total: 0, qtoks: qtoks };
    termData.push(e);
  }

  var scores = Object.create(null), matched = Object.create(null);
  for (var qi = 0; qi < termData.length; qi++) {
    var entry = termData[qi];
    var idf = Math.log(1 + (N - entry.df + 0.5) / (entry.df + 0.5));
    for (var p = 0; p < entry.postings.length; p++) {
      var id = entry.postings[p][0], tf = entry.postings[p][1];
      var dl = entry.postings[p][2] || avgdl;
      var s = idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avgdl));
      scores[id] = (scores[id] || 0) + s;
      matched[id] = (matched[id] || 0) + 1;
    }
  }

  var need = termData.length, ids = [];
  for (var sid in scores) if (matched[sid] === need) ids.push(Number(sid));
  if (!ids.length) return { ranked: [], total: 0, qtoks: qtoks };
  ids.sort(function (a, c) { return a - c; });

  // L5 title bonus
  var qset = Object.create(null);
  for (var q = 0; q < qtoks.length; q++) qset[qtoks[q]] = 1;
  for (var d = 0; d < ids.length; d++) {
    var title = getTitle(ids[d]);
    if (!title) continue;
    var tt = tokenize(title), hit = 0;
    for (var t = 0; t < tt.length; t++) if (qset[tt[t]]) hit++;
    if (hit) scores[ids[d]] += 1.0 * (hit / Math.max(1, qtoks.length)) * Math.log(N + 1);
  }

  // L6 ordering
  var ranked = [];
  for (var r = 0; r < ids.length; r++) ranked.push([ids[r], scores[ids[r]], matched[ids[r]]]);
  ranked.sort(function (a, c) { return c[1] - a[1] || (c[2] - a[2]) || (a[0] - c[0]); });
  return { ranked: ranked, total: ids.length, qtoks: qtoks };
}

// phase 2 — build frozen-shape results for the top `limit`
// getMeta(id) -> {title,text2000,url,domain,source,language}
function buildResults(getMeta, ranked, qtoks, limit) {
  limit = limit || 12;
  var results = [];
  for (var x = 0; x < Math.min(ranked.length, limit); x++) {
    var m = getMeta(ranked[x][0]);
    if (!m) continue;
    results.push({
      id: ranked[x][0],
      title: m.title,
      url: m.url,
      domain: m.domain,
      snippet: makeSnippet(m.text2000, qtoks),
      score: Math.round(ranked[x][1] * 100) / 100,
      source: m.source,
      language: m.language || ""
    });
  }
  return results;
}

// L8 snippet
function makeSnippet(text, terms, len) {
  len = len || 170;
  if (!text) return "";
  var low = text.toLowerCase(), pos = -1;
  for (var i = 0; i < terms.length; i++) {
    pos = low.indexOf(terms[i]);
    if (pos > -1) break;
  }
  if (pos < 0) return text.slice(0, len) + (text.length > len ? "…" : "");
  var start = Math.max(0, pos - 60);
  return (start > 0 ? "…" : "") + text.slice(start, start + len) + (start + len < text.length ? "…" : "");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { tokenize: tokenize, queryTokens: queryTokens, rankDocs: rankDocs, buildResults: buildResults, makeSnippet: makeSnippet, STOP: STOP };
}
if (typeof globalThis !== "undefined") {
  globalThis.HarzSearchCore = { tokenize: tokenize, queryTokens: queryTokens, rankDocs: rankDocs, buildResults: buildResults, makeSnippet: makeSnippet };
}
