#!/usr/bin/env node
// Portable local semantic knowledge graph template.
// Copy into a project as tools/semantic-kg.mjs and customize SEMANTIC_TOPICS.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".semantic-kg");
const GRAPH_PATH = path.join(OUT_DIR, "graph.json");
const CACHE_DIR = path.join(OUT_DIR, "cache");
const INCLUDE_GENERATED = process.argv.includes("--include-generated");

const EXCLUDED_DIRS = new Set([".git", ".semantic-kg", "node_modules", ".next", "dist", "coverage", ".cache", ".turbo"]);
const GENERATED_DIRS = new Set(["build", "dist", "out", "target", "coverage"]);
const TEXT_EXTS = new Set([".md", ".txt", ".rst", ".html", ".js", ".jsx", ".ts", ".tsx", ".css", ".json", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".cs"]);
const CODE_EXTS = new Set([".html", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".cs"]);
const DOC_EXTS = new Set([".md", ".txt", ".rst"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const PDF_EXTS = new Set([".pdf"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const ARCHIVE_EXTS = new Set([".zip", ".tar", ".gz", ".7z"]);

const SEMANTIC_TOPICS = [
  { id: "topic:architecture", label: "Architecture", aliases: ["architecture", "design", "runtime", "system diagram", "data flow"] },
  { id: "topic:build-deploy", label: "Build and deploy", aliases: ["build", "deploy", "pipeline", "release", "dist", "ci", "cloud"] },
  { id: "topic:data-persistence", label: "Data and persistence", aliases: ["database", "storage", "state", "cache", "localstorage", "migration", "schema"] },
  { id: "topic:security", label: "Security and privacy", aliases: ["auth", "permission", "token", "secret", "privacy", "security", "credential"] },
  { id: "topic:ui", label: "User interface", aliases: ["component", "screen", "page", "layout", "css", "style", "button", "modal"] },
  { id: "topic:docs", label: "Documentation", aliases: ["readme", "docs", "documentation", "guide", "handbook", "notes"] },
  { id: "topic:media", label: "Media and assets", aliases: ["image", "screenshot", "diagram", "pdf", "video", "asset", "icon"] },
  { id: "topic:history", label: "Project history", aliases: ["release", "phase", "archive", "changelog", "milestone"] },
];

const STOP = new Set(["the", "and", "for", "with", "this", "that", "from", "into", "your", "you", "are", "was", "were", "has", "have", "function", "const", "return", "class", "true", "false", "null", "undefined"]);

function usage() {
  console.log(`Semantic KG

Usage:
  node tools/semantic-kg.mjs build [--include-generated]
  node tools/semantic-kg.mjs stats
  node tools/semantic-kg.mjs query [--intent=code|docs|media|all] "terms"
  node tools/semantic-kg.mjs impact "SymbolOrFile"
  node tools/semantic-kg.mjs drift
  node tools/semantic-kg.mjs path "A" "B"
  node tools/semantic-kg.mjs baseline "query one" "query two"`);
}
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function posix(p) { return p.split(path.sep).join("/"); }
function rel(abs) { return posix(path.relative(ROOT, abs)); }
function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function tokenize(text) { return [...new Set(String(text).toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) || [])].filter(t => !STOP.has(t)).slice(0, 120); }
function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function fileId(p) { return `file:${p}`; }
function symbolId(p, name) { return `symbol:${p}:${name}`; }
function sectionId(p, line, title) { return `section:${p}:${line}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)}`; }
function words(name) { return String(name).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " "); }

function shouldSkipDir(abs, name) {
  if (EXCLUDED_DIRS.has(name)) return true;
  if (!INCLUDE_GENERATED && GENERATED_DIRS.has(name)) return true;
  return false;
}
function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory() && shouldSkipDir(abs, ent.name)) continue;
    if (ent.isDirectory()) walk(abs, files);
    else if (ent.isFile()) files.push(abs);
  }
  return files;
}
function kindFor(ext) {
  if (CODE_EXTS.has(ext)) return "code_file";
  if (DOC_EXTS.has(ext)) return "doc_file";
  if (IMAGE_EXTS.has(ext)) return "image_file";
  if (PDF_EXTS.has(ext)) return "pdf_file";
  if (VIDEO_EXTS.has(ext)) return "video_file";
  if (ARCHIVE_EXTS.has(ext)) return "archive_file";
  return "file";
}
function lineAt(text, idx) { let line = 1; for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) line++; return line; }
function matchedTopics(text) {
  const hay = String(text).toLowerCase();
  return SEMANTIC_TOPICS.filter(t => t.aliases.some(a => hay.includes(a)));
}
function addNode(g, n) { if (!g._nodes.has(n.id)) { g._nodes.add(n.id); g.nodes.push(n); } }
function addEdge(g, from, to, type, data = {}) { const key = `${from}\0${type}\0${to}`; if (!g._edges.has(key) && from !== to) { g._edges.add(key); g.edges.push({ from, to, type, ...data }); } }

function summarizeFile(p, kind, ext) {
  const base = path.basename(p, ext);
  if (kind === "image_file") return `Visual asset inferred from filename: ${words(base)}.`;
  if (kind === "pdf_file") return `PDF document inferred from filename: ${words(base)}.`;
  if (kind === "video_file") return `Video asset inferred from filename: ${words(base)}.`;
  if (kind === "archive_file") return `Archive inferred from filename: ${words(base)}.`;
  return `${kind.replace(/_/g, " ")}: ${p}.`;
}
function summarizeSymbol(name, body, p) {
  const hay = `${words(name)} ${body.slice(0, 3000)}`.toLowerCase();
  const facts = [];
  if (/auth|token|secret|permission|privacy/.test(hay)) facts.push("touches security or privacy concerns");
  if (/fetch|api|route|request|response/.test(hay)) facts.push("participates in API or request flow");
  if (/state|cache|storage|database|schema/.test(hay)) facts.push("handles data, state, or persistence");
  if (/component|render|button|modal|page|screen|css/.test(hay)) facts.push("supports UI behavior");
  if (/build|deploy|release|bundle/.test(hay)) facts.push("supports build or release workflow");
  if (facts.length) return `${name} ${facts.join("; ")}.`;
  return `${name} is defined in ${p}.`;
}

function indexText(g, p, text) {
  const fid = fileId(p);
  const headings = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const md = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    const html = /<h([1-6])[^>]*>(.*?)<\/h\1>/i.exec(line);
    const title = md ? md[2] : html ? html[2].replace(/<[^>]+>/g, "").trim() : "";
    if (!title) return;
    const id = sectionId(p, i + 1, title);
    addNode(g, { id, kind: "section", label: title.slice(0, 160), path: p, line: i + 1, summary: `Section in ${p}: ${title}`, tokens: tokenize(title), semanticTags: matchedTopics(title).map(t => t.label) });
    addEdge(g, fid, id, "CONTAINS", { evidence: "EXTRACTED" });
    headings.push(id);
  });
  for (let i = 1; i < headings.length; i++) addEdge(g, headings[i - 1], headings[i], "NEXT_SECTION", { evidence: "EXTRACTED" });

  const symbols = [];
  const patterns = [/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|new\s+)/g, /\bclass\s+([A-Za-z_$][\w$]*)\b/g];
  for (const rx of patterns) { let m; while ((m = rx.exec(text))) symbols.push({ name: m[1], index: m.index, line: lineAt(text, m.index) }); }
  symbols.sort((a, b) => a.index - b.index);
  const unique = symbols.filter((s, i) => symbols.findIndex(x => x.name === s.name && x.line === s.line) === i);
  for (let i = 0; i < unique.length; i++) {
    const s = unique[i];
    const body = text.slice(s.index, unique[i + 1]?.index ?? Math.min(text.length, s.index + 10000));
    const id = symbolId(p, s.name);
    const summary = summarizeSymbol(s.name, body, p);
    addNode(g, { id, kind: /^[A-Z]/.test(s.name) ? "component" : "symbol", label: s.name, path: p, line: s.line, summary, semanticTags: matchedTopics(`${s.name} ${body}`).map(t => t.label), tokens: tokenize(`${words(s.name)} ${summary}`) });
    addEdge(g, fid, id, "DEFINES", { evidence: "EXTRACTED" });
  }
  const names = [...new Set(unique.map(s => s.name))].filter(n => n.length >= 4).slice(0, 1500);
  for (let i = 0; i < unique.length; i++) {
    const body = text.slice(unique[i].index, unique[i + 1]?.index ?? Math.min(text.length, unique[i].index + 10000));
    let refs = 0;
    for (const n of names) if (n !== unique[i].name && new RegExp(`\\b${escapeRx(n)}\\b`).test(body)) {
      addEdge(g, symbolId(p, unique[i].name), symbolId(p, n), "REFERENCES", { evidence: "EXTRACTED" });
      if (++refs >= 25) break;
    }
  }
}

function build() {
  ensureDir(OUT_DIR); ensureDir(CACHE_DIR);
  const g = { schemaVersion: 1, generatedAt: new Date().toISOString(), root: ROOT, includeGenerated: INCLUDE_GENERATED, nodes: [], edges: [], stats: {}, _nodes: new Set(), _edges: new Set() };
  for (const t of SEMANTIC_TOPICS) addNode(g, { id: t.id, kind: "topic", label: t.label, aliases: t.aliases, summary: `Semantic topic for ${t.label}.`, tokens: tokenize(`${t.label} ${t.aliases.join(" ")}`) });
  for (const abs of walk(ROOT)) {
    const p = rel(abs); const ext = path.extname(abs).toLowerCase(); const bytes = fs.readFileSync(abs); const hash = sha(bytes); const kind = kindFor(ext);
    const text = TEXT_EXTS.has(ext) ? fs.readFileSync(abs, "utf8") : "";
    const summary = summarizeFile(p, kind, ext);
    const node = { id: fileId(p), kind, label: path.basename(p), path: p, ext: ext || "none", bytes: bytes.length, sha256: hash, summary, semanticTags: matchedTopics(`${p} ${summary} ${text.slice(0, 8000)}`).map(t => t.label), tokens: tokenize(`${p} ${summary} ${text.slice(0, 4000)}`) };
    if ([...IMAGE_EXTS, ...PDF_EXTS, ...VIDEO_EXTS].includes(ext)) node.caption = summary;
    addNode(g, node);
    fs.writeFileSync(path.join(CACHE_DIR, `${hash}.json`), JSON.stringify({ path: p, sha256: hash, bytes: bytes.length, tokens: node.tokens.slice(0, 40) }, null, 2));
    if (text) indexText(g, p, text);
    for (const topic of matchedTopics(`${p} ${summary} ${text.slice(0, 10000)}`)) addEdge(g, fileId(p), topic.id, "SEMANTICALLY_RELATED", { evidence: "INFERRED", confidence: 0.65, why: `Matched aliases for ${topic.label}.` });
    if (ARCHIVE_EXTS.has(ext)) for (const tag of path.basename(p, ext).split(/[-_\s]+/).filter(x => x.length > 2)) {
      const id = `concept:${tag.toLowerCase()}`; addNode(g, { id, kind: "concept", label: tag, tokens: tokenize(tag) }); addEdge(g, fileId(p), id, "TAGGED", { evidence: "EXTRACTED" });
    }
  }
  delete g._nodes; delete g._edges;
  g.stats = { nodes: g.nodes.length, edges: g.edges.length, files: g.nodes.filter(n => n.id.startsWith("file:")).length, topics: g.nodes.filter(n => n.kind === "topic").length, symbols: g.nodes.filter(n => n.kind === "symbol").length, components: g.nodes.filter(n => n.kind === "component").length, inferredEdges: g.edges.filter(e => e.evidence === "INFERRED").length };
  fs.writeFileSync(GRAPH_PATH, JSON.stringify(g, null, 2));
  console.log(`Built ${path.relative(ROOT, GRAPH_PATH)}: ${g.stats.nodes} nodes, ${g.stats.edges} edges.`);
}
function load() { if (!fs.existsSync(GRAPH_PATH)) throw new Error("Graph not found. Run build first."); return JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8")); }
function adj(g) { const nodes = new Map(g.nodes.map(n => [n.id, n])); const a = new Map(); for (const e of g.edges) { const f = nodes.get(e.from), t = nodes.get(e.to); if (!f || !t) continue; if (!a.has(e.from)) a.set(e.from, []); if (!a.has(e.to)) a.set(e.to, []); a.get(e.from).push({ dir: "out", type: e.type, node: t }); a.get(e.to).push({ dir: "in", type: e.type, node: f }); } return a; }
function parseQueryArgs(args) {
  const opts = { intent: "auto", limit: 12 };
  const rest = [];
  for (const arg of args) {
    if (arg.startsWith("--intent=")) opts.intent = arg.slice("--intent=".length).toLowerCase();
    else if (arg === "--code") opts.intent = "code";
    else if (arg === "--docs") opts.intent = "docs";
    else if (arg === "--media") opts.intent = "media";
    else if (arg.startsWith("--limit=")) opts.limit = Math.max(1, Math.min(30, Number(arg.slice("--limit=".length)) || 12));
    else rest.push(arg);
  }
  opts.q = rest.join(" ").trim();
  return opts;
}
function detectIntent(q, requested) {
  if (requested && requested !== "auto") return requested;
  const low = String(q).toLowerCase();
  if (/\b(doc|docs|release|architecture|handbook|story|about|help|landing|readme|changelog)\b/.test(low)) return "docs";
  if (/\b(image|png|jpg|svg|pdf|video|screenshot|media|asset)\b/.test(low)) return "media";
  if (/[A-Z][A-Za-z0-9_]{2,}|[_:]/.test(q) || /\b(function|component|symbol|route|state|helper)\b/.test(low)) return "code";
  return "all";
}
function queryTerms(q) {
  const raw = String(q).split(/\s+/).map(s => s.trim()).filter(Boolean);
  return {
    raw,
    terms: [...new Set(tokenize(q).concat(raw.map(s => s.toLowerCase())))],
    identifiers: raw.filter(s => /[A-Z_:.]|^[a-zA-Z][a-zA-Z0-9_]{3,}$/.test(s)).map(s => s.replace(/^["'`]+|["'`]+$/g, "")),
    phrase: String(q).toLowerCase().trim(),
  };
}
function intentKindBoost(kind, intent) {
  if (intent === "code") return { component:55, symbol:50, code_file:22, section:6, doc_file:-18, topic:-24 }[kind] || 0;
  if (intent === "docs") return { doc_file:45, section:40, topic:14, code_file:-8, symbol:-12, component:-10 }[kind] || 0;
  if (intent === "media") return { image_file:55, pdf_file:50, video_file:50, archive_file:30, doc_file:8, code_file:-18, symbol:-18 }[kind] || 0;
  return { component:12, symbol:10, code_file:8, doc_file:8, section:7, topic:2 }[kind] || 0;
}
function isGenericSymbol(label) {
  return ["node", "nodes", "item", "items", "next", "start", "step", "grid", "pick", "check", "correct", "update", "flash", "map", "data"].includes(String(label || "").toLowerCase());
}
function scoreNode(n, info, a, intent) {
  const hay = [n.id, n.kind, n.label, n.path, n.summary, n.caption, ...(n.tokens || []), ...(n.semanticTags || []), ...(n.aliases || [])].join(" ").toLowerCase();
  const label = String(n.label || "").toLowerCase();
  const id = String(n.id || "").toLowerCase();
  const p = String(n.path || "").toLowerCase();
  let score = 0, matched = false;
  if (info.phrase && (label === info.phrase || p === info.phrase || id.endsWith(`:${info.phrase}`))) { score += 180; matched = true; }
  for (const t of info.terms) {
    if (hay.includes(t)) { score += 8; matched = true; }
    if (label === t) { score += 80; matched = true; }
    if (id.endsWith(`:${t}`) || id.includes(`:${t}:`)) { score += 60; matched = true; }
    if (p.includes(t)) { score += 10; matched = true; }
  }
  for (const ident of info.identifiers) {
    const low = ident.toLowerCase();
    if (label === low) { score += 220; matched = true; }
    else if (label.includes(low)) { score += 90; matched = true; }
    if (id.endsWith(`:${low}`) || id.includes(`:${low}:`)) { score += 120; matched = true; }
    if (p.endsWith(low) || p.includes(`/${low}`)) { score += 45; matched = true; }
  }
  if (isGenericSymbol(n.label) && !info.identifiers.some(i => i.toLowerCase() === label)) score -= 90;
  if (n.kind === "concept" && intent === "docs") score -= 280;
  if (n.kind === "topic" && intent === "docs") score -= 90;
  if (n.kind === "topic" && intent === "code") score -= 40;
  for (const nb of (a.get(n.id) || []).slice(0, 80)) {
    const low = `${nb.type} ${nb.node.label || ""} ${nb.node.path || ""}`.toLowerCase();
    for (const t of info.terms) if (low.includes(t)) { score += 2; matched = true; }
  }
  return matched ? score + intentKindBoost(n.kind, intent) : 0;
}
function lineRange(line, radius = 80) {
  const start = Math.max(1, Number(line || 1) - radius);
  const end = Number(line || 1) + radius;
  return `${start}-${end}`;
}
function printNextReads(n, a) {
  const reads = [];
  if (n.path && n.line) reads.push(`${n.path}:${lineRange(n.line)}`);
  const neighbors = (a.get(n.id) || [])
    .filter(x => x.node.path && x.node.line && ["REFERENCES", "DEFINES", "CONTAINS"].includes(x.type))
    .sort((x, y) => (x.node.path === n.path ? 0 : 1) - (y.node.path === n.path ? 0 : 1) || (x.node.line || 0) - (y.node.line || 0));
  for (const nb of neighbors) {
    reads.push(`${nb.node.path}:${lineRange(nb.node.line, 45)} (${nb.node.kind}:${nb.node.label})`);
    if (reads.length >= 4) break;
  }
  if (reads.length) { console.log("  Next reads:"); for (const r of reads) console.log(`    - ${r}`); }
}
function query(args) {
  const opts = Array.isArray(args) ? parseQueryArgs(args) : { q: String(args || ""), intent: "auto", limit: 12 };
  if (!opts.q) usage();
  const g = load();
  const a = adj(g);
  const intent = detectIntent(opts.q, opts.intent);
  const info = queryTerms(opts.q);
  const hits = g.nodes
    .map(n => ({ n, score: scoreNode(n, info, a, intent) }))
    .filter(x => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, opts.limit);
  console.log(`Intent: ${intent}`);
  for (const { n, score } of hits) {
    console.log(`\n[${score}] ${n.kind}: ${n.label}`);
    if (n.path) console.log(`  ${n.path}${n.line ? `:${n.line}` : ""}`);
    if (n.summary) console.log(`  ${n.summary}`);
    if (n.semanticTags?.length) console.log(`  Topics: ${n.semanticTags.join(", ")}`);
    for (const nb of (a.get(n.id) || []).slice(0, 8)) console.log(`  ${nb.dir === "out" ? "->" : "<-"} ${nb.type} ${nb.node.kind}:${nb.node.label}${nb.node.path ? ` (${nb.node.path}${nb.node.line ? `:${nb.node.line}` : ""})` : ""}`);
    printNextReads(n, a);
  }
}
function findNode(g, needle) {
  const q = String(needle || "").toLowerCase();
  const priority = { component:0, symbol:1, code_file:2, doc_file:3, section:4, topic:5, concept:6 };
  const exact = g.nodes.filter(n => n.id.toLowerCase() === q || n.label?.toLowerCase() === q).sort((a, b) => (priority[a.kind] ?? 9) - (priority[b.kind] ?? 9));
  return exact[0] || g.nodes.find(n => n.id.toLowerCase().includes(q) || n.label?.toLowerCase().includes(q) || n.path?.toLowerCase().includes(q));
}
function impact(needle) {
  const g = load(); const n = findNode(g, needle); if (!n) throw new Error(`Could not resolve node: ${needle}`);
  const a = adj(g); const neighbors = a.get(n.id) || [];
  console.log(`Impact target: ${n.kind}:${n.label}${n.path ? ` (${n.path}${n.line ? `:${n.line}` : ""})` : ""}`);
  if (n.path && n.line) console.log(`Primary read: ${n.path}:${lineRange(n.line)}`);
  console.log("\nLikely code touchpoints:");
  for (const x of neighbors.filter(x => ["component", "symbol", "code_file"].includes(x.node.kind) && x.node.path).slice(0, 12)) console.log(`  - ${x.node.kind}:${x.node.label} ${x.node.path}${x.node.line ? `:${x.node.line}` : ""} via ${x.type}`);
  console.log("\nLikely docs / narrative touchpoints:");
  const docs = neighbors.filter(x => ["doc_file", "section"].includes(x.node.kind) || /release|architecture|handbook|state|readme/i.test(x.node.path || "")).slice(0, 10);
  if (!docs.length) console.log("  - README.md / release notes if behavior changes");
  for (const x of docs) console.log(`  - ${x.node.kind}:${x.node.label} ${x.node.path || ""}${x.node.line ? `:${x.node.line}` : ""} via ${x.type}`);
  console.log("\nSuggested validation:\n  - build/test command for this project\n  - graph rebuild\n  - graph query for changed symbol");
}
function drift() {
  const surfaces = ["README.md", "ARCHITECTURE.md", "docs/handbook_content.js", "RELEASE_NOTES.md", "CHANGELOG.md"].filter(p => fs.existsSync(path.join(ROOT, p)));
  const markers = [
    { label:"Graph-It", terms:["Graph-It", "semantic knowledge graph"] },
    { label:"local-first", terms:["local-first", "local first"] },
    { label:"query", terms:["kg:query", "query"] },
    { label:"baseline", terms:["baseline"] },
  ];
  console.log("Docs drift scan:");
  let missingCount = 0;
  for (const surface of surfaces) {
    const text = fs.readFileSync(path.join(ROOT, surface), "utf8").toLowerCase();
    const missing = markers.filter(m => !m.terms.some(t => text.includes(t.toLowerCase())));
    console.log(`\n${surface}`);
    if (!missing.length) console.log("  OK");
    else for (const m of missing) { missingCount++; console.log(`  missing: ${m.label}`); }
  }
  console.log(`\nDrift result: ${missingCount ? `${missingCount} missing surface markers` : "no marker drift found"}`);
}
function pathBetween(aName, bName) {
  const g = load(); const start = findNode(g, aName); const end = findNode(g, bName);
  if (!start || !end) throw new Error(`Could not resolve nodes: ${!start ? aName : ""} ${!end ? bName : ""}`.trim());
  const graphAdj = adj(g); const q = [start.id]; const prev = new Map([[start.id, null]]);
  while (q.length) { const cur = q.shift(); if (cur === end.id) break; for (const nb of graphAdj.get(cur) || []) { if (prev.has(nb.node.id)) continue; prev.set(nb.node.id, { from: cur, via: nb.type }); q.push(nb.node.id); } }
  if (!prev.has(end.id)) { console.log(`No path between ${start.label} and ${end.label}.`); return; }
  const nodes = new Map(g.nodes.map(n => [n.id, n])); const steps = []; let cur = end.id;
  while (cur) { const p = prev.get(cur); steps.push({ id: cur, via: p?.via }); cur = p?.from; }
  steps.reverse().forEach((s, i) => { const n = nodes.get(s.id); console.log(`${i ? ` --${s.via}-- ` : ""}${n.kind}:${n.label}${n.path ? ` (${n.path}${n.line ? `:${n.line}` : ""})` : ""}`); });
}
function stats() { const g = load(); console.log(JSON.stringify(g.stats, null, 2)); }
function baseline(args) { const qs = args.length ? args : ["architecture", "build deploy", "auth state", "ui component"]; const results = qs.map(q => { const start = Date.now(); let out = ""; const old = console.log; console.log = (...x) => { out += x.join(" ") + "\n"; }; query([q]); console.log = old; return { query: q, ms: Date.now() - start, outputKB: Math.round(Buffer.byteLength(out) / 102.4) / 10 }; }); fs.writeFileSync(path.join(OUT_DIR, "baseline.json"), JSON.stringify({ generatedAt: new Date().toISOString(), tests: results }, null, 2)); console.table(results); }

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || cmd === "help" || cmd === "--help") usage();
else if (cmd === "build") build();
else if (cmd === "stats") stats();
else if (cmd === "query") query(args);
else if (cmd === "impact") impact(args.join(" "));
else if (cmd === "drift") drift();
else if (cmd === "path") pathBetween(args[0] || "", args[1] || "");
else if (cmd === "baseline") baseline(args);
else { console.error(`Unknown command: ${cmd}`); usage(); process.exit(1); }
