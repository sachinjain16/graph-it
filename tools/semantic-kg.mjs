#!/usr/bin/env node
// Portable local semantic knowledge graph template.
// Copy into a project as tools/semantic-kg.mjs and customize SEMANTIC_TOPICS.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".semantic-kg");
const GRAPH_PATH = path.join(OUT_DIR, "graph.json");
const PREVIOUS_GRAPH_PATH = path.join(OUT_DIR, "previous-graph.json");
const DELTA_REPORT_JSON = path.join(OUT_DIR, "delta-report.json");
const DELTA_REPORT_MD = path.join(OUT_DIR, "delta-report.md");
const QUALITY_JSON = path.join(OUT_DIR, "quality.json");
const QUALITY_MD = path.join(OUT_DIR, "quality.md");
const CACHE_DIR = path.join(OUT_DIR, "cache");
const WIKI_DIR = path.join(OUT_DIR, "wiki");
const VIEWER_PATH = path.join(OUT_DIR, "graph.html");
const POST_COMMIT_HOOK = path.join(ROOT, ".git", "hooks", "post-commit");
const TOOL_PATH = path.join(ROOT, "tools", "semantic-kg.mjs");
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
  node tools/semantic-kg.mjs delta
  node tools/semantic-kg.mjs wiki
  node tools/semantic-kg.mjs viewer
  node tools/semantic-kg.mjs quality
  node tools/semantic-kg.mjs obsidian
  node tools/semantic-kg.mjs ingest <file-or-folder> [...]
  node tools/semantic-kg.mjs enrich [--provider local]
  node tools/semantic-kg.mjs watch
  node tools/semantic-kg.mjs hook install
  node tools/semantic-kg.mjs mcp
  node tools/semantic-kg.mjs mcp-config [--client=all|generic|claude-desktop|clawpilot] [--smoke-test]
  node tools/semantic-kg.mjs path "A" "B"
  node tools/semantic-kg.mjs baseline "query one" "query two"`);
}
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function posix(p) { return p.split(path.sep).join("/"); }
function rel(abs) { return posix(path.relative(ROOT, abs)); }
function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function tokenize(text) { return [...new Set(String(text).toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) || [])].filter(t => !STOP.has(t)).slice(0, 120); }
function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function slug(s) { return String(s || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "untitled"; }
function md(s) { return String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim(); }
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
  const extractsHtmlHeadings = [".html", ".htm"].includes(path.extname(p).toLowerCase());
  text.split(/\r?\n/).forEach((line, i) => {
    const md = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    const html = extractsHtmlHeadings ? /<h([1-6])[^>]*>(.*?)<\/h\1>/i.exec(line) : null;
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
  if (fs.existsSync(GRAPH_PATH)) fs.copyFileSync(GRAPH_PATH, PREVIOUS_GRAPH_PATH);
  fs.writeFileSync(GRAPH_PATH, JSON.stringify(g, null, 2));
  console.log(`Built ${path.relative(ROOT, GRAPH_PATH)}: ${g.stats.nodes} nodes, ${g.stats.edges} edges.`);
}
function refreshGeneratedArtifacts({ wikiOutput = true, viewerOutput = true } = {}) {
  build();
  if (wikiOutput) wiki();
  if (viewerOutput) viewer();
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
    const identifierBoost = intent === "docs" && ["symbol", "component"].includes(n.kind) ? 0.25 : 1;
    if (label === low) { score += 220 * identifierBoost; matched = true; }
    else if (label.includes(low)) { score += 90 * identifierBoost; matched = true; }
    if (id.endsWith(`:${low}`) || id.includes(`:${low}:`)) { score += 120 * identifierBoost; matched = true; }
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
  const reads = nextReadsFor(n, a);
  if (reads.length) { console.log("  Next reads:"); for (const r of reads) console.log(`    - ${r}`); }
}
function nodeLocation(n) {
  return n?.path ? `${n.path}${n.line ? `:${n.line}` : ""}` : "";
}
function nextReadsFor(n, a) {
  const reads = [];
  if (n.path && n.line) reads.push(`${n.path}:${lineRange(n.line)}`);
  const neighbors = (a.get(n.id) || [])
    .filter(x => x.node.path && x.node.line && ["REFERENCES", "DEFINES", "CONTAINS"].includes(x.type))
    .sort((x, y) => (x.node.path === n.path ? 0 : 1) - (y.node.path === n.path ? 0 : 1) || (x.node.line || 0) - (y.node.line || 0));
  for (const nb of neighbors) {
    reads.push(`${nb.node.path}:${lineRange(nb.node.line, 45)} (${nb.node.kind}:${nb.node.label})`);
    if (reads.length >= 4) break;
  }
  return reads;
}
function compactNode(n) {
  if (!n) return null;
  const out = { id: n.id, kind: n.kind, label: n.label };
  if (n.path) out.path = n.path;
  if (n.line) out.line = n.line;
  if (n.summary) out.summary = n.summary;
  if (n.semanticTags?.length) out.semanticTags = n.semanticTags;
  return out;
}
function compactNeighbor(nb) {
  return { direction: nb.dir, type: nb.type, node: compactNode(nb.node) };
}
function queryResult(args) {
  const opts = Array.isArray(args) ? parseQueryArgs(args) : { q: String(args?.q || args?.query || ""), intent: args?.intent || "auto", limit: args?.limit || 12 };
  if (!opts.q) throw new Error("Query is required.");
  const g = load();
  const a = adj(g);
  const intent = detectIntent(opts.q, opts.intent);
  const info = queryTerms(opts.q);
  const hits = g.nodes
    .map(n => ({ n, score: scoreNode(n, info, a, intent) }))
    .filter(x => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, opts.limit)
    .map(({ n, score }) => ({
      score,
      node: compactNode(n),
      neighbors: (a.get(n.id) || []).slice(0, 8).map(compactNeighbor),
      nextReads: nextReadsFor(n, a),
    }));
  return { query: opts.q, intent, limit: opts.limit, hits };
}
function query(args) {
  const result = queryResult(args);
  console.log(`Intent: ${result.intent}`);
  for (const hit of result.hits) {
    const n = hit.node;
    console.log(`\n[${hit.score}] ${n.kind}: ${n.label}`);
    if (n.path) console.log(`  ${nodeLocation(n)}`);
    if (n.summary) console.log(`  ${n.summary}`);
    if (n.semanticTags?.length) console.log(`  Topics: ${n.semanticTags.join(", ")}`);
    for (const nb of hit.neighbors) console.log(`  ${nb.direction === "out" ? "->" : "<-"} ${nb.type} ${nb.node.kind}:${nb.node.label}${nb.node.path ? ` (${nodeLocation(nb.node)})` : ""}`);
    if (hit.nextReads.length) { console.log("  Next reads:"); for (const r of hit.nextReads) console.log(`    - ${r}`); }
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
  ensureDir(OUT_DIR);
  const surfaces = ["README.md", "ARCHITECTURE.md", "docs/handbook_content.js", "RELEASE_NOTES.md", "CHANGELOG.md"].filter(p => fs.existsSync(path.join(ROOT, p)));
  const markers = [
    { label:"Graph-It", terms:["Graph-It", "semantic knowledge graph"] },
    { label:"local-first", terms:["local-first", "local first"] },
    { label:"query", terms:["kg:query", "query"] },
    { label:"baseline", terms:["baseline"] },
  ];
  console.log("Docs drift scan:");
  let missingCount = 0;
  const rows = [];
  for (const surface of surfaces) {
    const text = fs.readFileSync(path.join(ROOT, surface), "utf8").toLowerCase();
    const missing = markers.filter(m => !m.terms.some(t => text.includes(t.toLowerCase())));
    rows.push({ surface, exists: true, missing: missing.map(m => m.label) });
    console.log(`\n${surface}`);
    if (!missing.length) console.log("  OK");
    else for (const m of missing) { missingCount++; console.log(`  missing: ${m.label}`); }
  }
  const result = missingCount ? `${missingCount} missing surface markers` : "no marker drift found";
  const report = { generatedAt: new Date().toISOString(), result, missingCount, rows };
  fs.writeFileSync(path.join(OUT_DIR, "drift-report.json"), JSON.stringify(report, null, 2));
  const md = [
    "# Graph-It drift report",
    "",
    `Generated: ${report.generatedAt}`,
    `Result: ${result}`,
    "",
    "| Surface | Status | Missing markers |",
    "|---|---|---|",
    ...rows.map(r => `| ${r.surface} | ${r.missing.length ? "Drift" : "OK"} | ${r.missing.join(", ") || "—"} |`),
    ""
  ].join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "drift-report.md"), md);
  console.log(`\nDrift result: ${result}`);
  console.log(`Wrote ${path.relative(ROOT, path.join(OUT_DIR, "drift-report.json"))}`);
  console.log(`Wrote ${path.relative(ROOT, path.join(OUT_DIR, "drift-report.md"))}`);
}
function pathBetween(aName, bName) {
  const result = pathResult(aName, bName);
  if (!result.found) { console.log(result.message); return; }
  result.steps.forEach((s, i) => console.log(`${i ? ` --${s.via}-- ` : ""}${s.node.kind}:${s.node.label}${s.node.path ? ` (${nodeLocation(s.node)})` : ""}`));
}
function pathResult(aName, bName) {
  const g = load(); const start = findNode(g, aName); const end = findNode(g, bName);
  if (!start || !end) throw new Error(`Could not resolve nodes: ${!start ? aName : ""} ${!end ? bName : ""}`.trim());
  const graphAdj = adj(g); const q = [start.id]; const prev = new Map([[start.id, null]]);
  while (q.length) { const cur = q.shift(); if (cur === end.id) break; for (const nb of graphAdj.get(cur) || []) { if (prev.has(nb.node.id)) continue; prev.set(nb.node.id, { from: cur, via: nb.type }); q.push(nb.node.id); } }
  if (!prev.has(end.id)) return { found: false, from: compactNode(start), to: compactNode(end), message: `No path between ${start.label} and ${end.label}.` };
  const nodes = new Map(g.nodes.map(n => [n.id, n])); const steps = []; let cur = end.id;
  while (cur) { const p = prev.get(cur); steps.push({ id: cur, via: p?.via }); cur = p?.from; }
  return { found: true, from: compactNode(start), to: compactNode(end), steps: steps.reverse().map(s => ({ via: s.via || null, node: compactNode(nodes.get(s.id)) })) };
}
function statsResult() { const g = load(); return { ...g.stats, generatedAt: g.generatedAt, root: g.root, graphPath: path.relative(ROOT, GRAPH_PATH) }; }
function stats() { console.log(JSON.stringify(statsResult(), null, 2)); }
function nodeResult(needle) {
  const g = load();
  const n = findNode(g, needle);
  if (!n) throw new Error(`Could not resolve node: ${needle}`);
  const graphAdj = adj(g);
  return { node: compactNode(n), degree: graphAdj.get(n.id)?.length || 0, neighbors: (graphAdj.get(n.id) || []).slice(0, 20).map(compactNeighbor), nextReads: nextReadsFor(n, graphAdj) };
}
function neighborhoodResult(needle, depth = 1, limit = 40) {
  const g = load();
  const start = findNode(g, needle);
  if (!start) throw new Error(`Could not resolve node: ${needle}`);
  const graphAdj = adj(g);
  const maxDepth = Math.max(0, Math.min(3, Number(depth) || 1));
  const maxNodes = Math.max(1, Math.min(120, Number(limit) || 40));
  const seen = new Map([[start.id, 0]]);
  const queue = [start.id];
  while (queue.length && seen.size < maxNodes) {
    const cur = queue.shift();
    const curDepth = seen.get(cur);
    if (curDepth >= maxDepth) continue;
    for (const nb of graphAdj.get(cur) || []) {
      if (seen.has(nb.node.id)) continue;
      seen.set(nb.node.id, curDepth + 1);
      queue.push(nb.node.id);
      if (seen.size >= maxNodes) break;
    }
  }
  const nodes = new Map(g.nodes.map(n => [n.id, n]));
  const ids = new Set(seen.keys());
  return {
    center: compactNode(start),
    depth: maxDepth,
    nodes: [...seen.entries()].map(([id, nodeDepth]) => ({ depth: nodeDepth, ...compactNode(nodes.get(id)) })),
    edges: g.edges.filter(e => ids.has(e.from) && ids.has(e.to)).map(e => ({ from: e.from, to: e.to, type: e.type, evidence: e.evidence, confidence: e.confidence, why: e.why })),
  };
}
function baseline(args) { const qs = args.length ? args : ["architecture", "build deploy", "auth state", "ui component"]; const results = qs.map(q => { const start = Date.now(); let out = ""; const old = console.log; console.log = (...x) => { out += x.join(" ") + "\n"; }; query([q]); console.log = old; return { query: q, ms: Date.now() - start, outputKB: Math.round(Buffer.byteLength(out) / 102.4) / 10 }; }); fs.writeFileSync(path.join(OUT_DIR, "baseline.json"), JSON.stringify({ generatedAt: new Date().toISOString(), tests: results }, null, 2)); console.table(results); }

function computeQuality(g) {
  const graphAdj = adj(g);
  const degrees = degreeMap(g);
  const nonTopicNodes = g.nodes.filter(n => n.kind !== "topic");
  const orphanNodes = nonTopicNodes.filter(n => (degrees.get(n.id) || 0) === 0);
  const weakEdges = g.edges.filter(e => e.evidence === "INFERRED" && Number(e.confidence || 0) < 0.7);
  const duplicateLabels = [...new Map(
    [...new Map(g.nodes.map(n => [String(n.label || n.id).toLowerCase(), []])).keys()]
      .map(label => [label, g.nodes.filter(n => String(n.label || n.id).toLowerCase() === label)])
      .filter(([, nodes]) => nodes.length > 1)
  ).entries()].map(([label, nodes]) => ({ label, count: nodes.length, nodes: nodes.slice(0, 10).map(n => n.id) }));
  const maxDegree = Math.max(1, ...[...degrees.values()]);
  const godNodeThreshold = Math.max(12, Math.ceil(g.nodes.length * 0.18));
  const godNodes = g.nodes
    .map(n => ({ id: n.id, label: n.label, kind: n.kind, degree: degrees.get(n.id) || 0 }))
    .filter(n => n.degree >= godNodeThreshold)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 20);
  const sourceCoverage = nonTopicNodes.filter(n => n.path || n.file || n.summary).length / Math.max(1, nonTopicNodes.length);
  const connectivity = 1 - orphanNodes.length / Math.max(1, nonTopicNodes.length);
  const weakPenalty = Math.min(25, weakEdges.length / Math.max(1, g.edges.length) * 100);
  const duplicatePenalty = Math.min(15, duplicateLabels.length * 2);
  const godPenalty = Math.min(15, godNodes.length * 3);
  const score = Math.max(0, Math.round((connectivity * 55) + (sourceCoverage * 25) + 20 - weakPenalty - duplicatePenalty - godPenalty));
  const recommendations = [];
  if (orphanNodes.length) recommendations.push(`Connect or prune ${orphanNodes.length} orphan node(s).`);
  if (godNodes.length) recommendations.push(`Split or better type ${godNodes.length} god-node candidate(s).`);
  if (weakEdges.length) recommendations.push(`Review ${weakEdges.length} low-confidence inferred edge(s).`);
  if (duplicateLabels.length) recommendations.push(`Disambiguate ${duplicateLabels.length} duplicate label group(s).`);
  if (!recommendations.length) recommendations.push("Graph structure looks healthy. Keep indexing after meaningful changes.");
  return {
    generatedAt: new Date().toISOString(),
    score,
    grade: score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 60 ? "needs-attention" : "weak",
    stats: g.stats || { nodes: g.nodes.length, edges: g.edges.length },
    metrics: {
      connectivity: Number(connectivity.toFixed(3)),
      sourceCoverage: Number(sourceCoverage.toFixed(3)),
      maxDegree,
      orphanCount: orphanNodes.length,
      weakEdgeCount: weakEdges.length,
      duplicateLabelGroups: duplicateLabels.length,
      godNodeCount: godNodes.length,
    },
    orphanNodes: orphanNodes.slice(0, 50).map(n => compactNode(n)),
    godNodes,
    weakEdges: weakEdges.slice(0, 50).map(e => edgeSummary(e, new Map(g.nodes.map(n => [n.id, n])))),
    duplicateLabels: duplicateLabels.slice(0, 50),
    recommendations,
    nextIndexingActions: [
      "Run `node tools/semantic-kg.mjs obsidian` for durable vault-style notes.",
      "Run `node tools/semantic-kg.mjs viewer` after quality changes.",
      "Stage non-code docs with `node tools/semantic-kg.mjs ingest <path>` before extracting text.",
    ],
  };
}
function renderQualityMarkdown(q) {
  return `# Graph-It Quality\n\nGenerated: ${q.generatedAt}\n\nScore: **${q.score}/100** (${q.grade})\n\n## Metrics\n\n| Metric | Value |\n|---|---:|\n| Connectivity | ${q.metrics.connectivity} |\n| Source coverage | ${q.metrics.sourceCoverage} |\n| Orphan nodes | ${q.metrics.orphanCount} |\n| Weak inferred edges | ${q.metrics.weakEdgeCount} |\n| Duplicate label groups | ${q.metrics.duplicateLabelGroups} |\n| God-node candidates | ${q.metrics.godNodeCount} |\n| Max degree | ${q.metrics.maxDegree} |\n\n## Recommendations\n\n${q.recommendations.map(x => `- ${md(x)}`).join("\n")}\n\n## God-node candidates\n\n${q.godNodes.length ? q.godNodes.map(n => `- ${md(n.label || n.id)} (${n.kind}, degree ${n.degree})`).join("\n") : "- None"}\n\n## Orphan nodes\n\n${q.orphanNodes.length ? q.orphanNodes.slice(0, 25).map(n => `- ${md(n.label || n.id)} (${n.kind})`).join("\n") : "- None"}\n`;
}
function quality() {
  const q = computeQuality(load());
  ensureDir(OUT_DIR);
  fs.writeFileSync(QUALITY_JSON, JSON.stringify(q, null, 2));
  fs.writeFileSync(QUALITY_MD, renderQualityMarkdown(q));
  const summaryPath = path.join(OUT_DIR, "quality-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({ score: q.score, grade: q.grade, metrics: q.metrics, recommendations: q.recommendations }, null, 2));
  console.log(`Graph-It quality: ${q.score}/100 (${q.grade})`);
  console.log(`Wrote ${path.relative(ROOT, QUALITY_MD)}`);
}

function yamlValue(v) { return String(v ?? "").replace(/"/g, '\\"'); }
function obsidianFolder(n) {
  if (n.kind === "topic") return "concepts";
  if (n.kind === "doc" || DOC_EXTS.has(n.ext)) return "docs";
  if (n.kind === "image" || n.kind === "pdf" || n.kind === "video" || n.kind === "archive") return "artifacts";
  if (n.kind === "symbol" || n.kind === "component") return "symbols";
  return "files";
}
function obsidianFileName(n) { return `${slug(n.label || n.id)}.md`; }
function obsidianLink(n) { return `[[${obsidianFileName(n).replace(/\.md$/, "")}|${n.label || n.id}]]`; }
function obsidianNodeMarkdown(n, related) {
  const tags = [...new Set([n.kind, ...(n.semanticTags || []).map(slug)].filter(Boolean))];
  return `---\nid: "${yamlValue(n.id)}"\ntype: "${yamlValue(n.kind)}"\nsource: "${yamlValue(n.path || "")}"\ntags: [${tags.map(t => `"${yamlValue(t)}"`).join(", ")}]\n---\n\n# ${n.label || n.id}\n\n${n.summary || "No summary available."}\n\n${n.path ? `Source: \`${n.path}\`\n\n` : ""}## Related\n\n${related.length ? related.slice(0, 30).map(({ edge, node }) => `- ${obsidianLink(node)} — ${edge.type}${edge.why ? ` (${md(edge.why)})` : ""}`).join("\n") : "- None"}\n`;
}
function obsidian() {
  const g = load();
  const graphAdj = adj(g);
  const nodes = new Map(g.nodes.map(n => [n.id, n]));
  const vault = path.join(WIKI_DIR, "obsidian");
  fs.rmSync(vault, { recursive: true, force: true });
  ensureDir(vault);
  for (const n of g.nodes) {
    const folder = path.join(vault, obsidianFolder(n));
    ensureDir(folder);
    const related = (graphAdj.get(n.id) || []).map(nb => ({
      edge: g.edges.find(e => (e.from === n.id && e.to === nb.node.id) || (e.to === n.id && e.from === nb.node.id)) || { type: nb.type },
      node: nodes.get(nb.node.id),
    })).filter(x => x.node);
    fs.writeFileSync(path.join(folder, obsidianFileName(n)), obsidianNodeMarkdown(n, related));
  }
  const q = computeQuality(g);
  fs.writeFileSync(path.join(vault, "Graph-It Index.md"), `# Graph-It Index\n\nScore: **${q.score}/100** (${q.grade})\n\n## Folders\n\n- [[concepts]]\n- [[docs]]\n- [[files]]\n- [[symbols]]\n- [[artifacts]]\n\n## Top nodes\n\n${[...degreeMap(g).entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([id,d]) => `- ${obsidianLink(nodes.get(id) || { id, label: id })} — degree ${d}`).join("\n")}\n`);
  fs.writeFileSync(path.join(vault, "Graph Quality.md"), renderQualityMarkdown(q));
  console.log(`Obsidian vault exported to ${path.relative(ROOT, vault)}`);
}

function isIngestible(abs) {
  return new Set([".md", ".txt", ".rst", ".html", ".csv", ".json", ".docx", ".pptx", ".xlsx", ".pdf"]).has(path.extname(abs).toLowerCase());
}
function ingest(args) {
  if (!args.length) { console.log("Usage: node tools/semantic-kg.mjs ingest <file-or-folder> [...]"); return; }
  const ingestDir = path.join(OUT_DIR, "ingest");
  ensureDir(ingestDir);
  const items = [];
  for (const input of args) {
    const abs = path.resolve(input);
    if (!fs.existsSync(abs)) { items.push({ source: input, status: "missing" }); continue; }
    const files = fs.statSync(abs).isDirectory() ? walk(abs).filter(isIngestible) : [abs].filter(isIngestible);
    for (const file of files) {
      const staged = path.join(ingestDir, `${slug(rel(file))}${path.extname(file)}`);
      fs.copyFileSync(file, staged);
      items.push({ source: rel(file), staged: rel(staged), status: "staged" });
    }
  }
  fs.writeFileSync(path.join(ingestDir, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), items, note: "Local staging only. Extract binary docs to markdown before rich indexing." }, null, 2));
  console.log(`Staged ${items.filter(i => i.status === "staged").length} file(s) in ${path.relative(ROOT, ingestDir)}`);
}

function enrich(args) {
  const g = load();
  const providerIdx = args.indexOf("--provider");
  const provider = providerIdx >= 0 ? args[providerIdx + 1] : "local";
  const plan = {
    generatedAt: new Date().toISOString(),
    provider,
    status: "plan-only",
    privacy: "No content was sent to any model by this command.",
    candidateNodes: g.nodes.filter(n => n.kind !== "topic").slice(0, 50).map(n => compactNode(n)),
    nextSteps: [
      "Choose an approved local/provider path.",
      "Generate proposed summaries and relationships into enrichment.proposed.json.",
      "Review before merging into graph.json.",
    ],
  };
  fs.writeFileSync(path.join(OUT_DIR, "enrichment-plan.json"), JSON.stringify(plan, null, 2));
  console.log("Wrote .semantic-kg/enrichment-plan.json");
}
function edgeKey(e) {
  return `${e.from}\0${e.type}\0${e.to}`;
}
function edgeSummary(e, nodes) {
  const from = nodes.get(e.from);
  const to = nodes.get(e.to);
  return {
    from: compactNode(from) || { id: e.from },
    to: compactNode(to) || { id: e.to },
    type: e.type,
    evidence: e.evidence || "UNSPECIFIED",
    confidence: e.confidence,
    why: e.why,
  };
}
function degreeMap(g) {
  const degrees = new Map(g.nodes.map(n => [n.id, 0]));
  for (const e of g.edges) {
    degrees.set(e.from, (degrees.get(e.from) || 0) + 1);
    degrees.set(e.to, (degrees.get(e.to) || 0) + 1);
  }
  return degrees;
}
function tagCounts(g) {
  const counts = new Map();
  for (const n of g.nodes) {
    for (const tag of n.semanticTags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    if (n.kind === "topic") counts.set(n.label, counts.get(n.label) || 0);
  }
  return counts;
}
function fileMap(g) {
  return new Map(g.nodes.filter(n => n.id.startsWith("file:") && n.path).map(n => [n.path, n]));
}
function readGraphAt(graphPath, label) {
  if (!fs.existsSync(graphPath)) throw new Error(`${label} graph not found at ${path.relative(ROOT, graphPath)}. Run build first.`);
  return JSON.parse(fs.readFileSync(graphPath, "utf8"));
}
function deltaResult() {
  const current = readGraphAt(GRAPH_PATH, "Current");
  const generatedAt = new Date().toISOString();
  const currentNodes = new Map(current.nodes.map(n => [n.id, n]));
  if (!fs.existsSync(PREVIOUS_GRAPH_PATH)) {
    return {
      generatedAt,
      status: "no_previous_snapshot",
      message: "No previous graph snapshot found. Run build once after changes; Graph-It preserves the prior graph before writing the new one.",
      paths: { current: path.relative(ROOT, GRAPH_PATH), previous: path.relative(ROOT, PREVIOUS_GRAPH_PATH) },
      current: { generatedAt: current.generatedAt, stats: current.stats },
      counts: { addedFiles: 0, removedFiles: 0, changedFiles: 0, addedNodes: 0, removedNodes: 0, addedEdges: 0, removedEdges: 0, newInferredEdges: 0, newlyIsolatedNodes: 0 },
      files: { added: [], removed: [], changed: [] },
      changedSemanticNeighborhoods: [],
      newInferredEdges: [],
      newlyIsolatedNodes: [],
      topicChanges: [],
      recommendedRereads: [],
    };
  }

  const previous = readGraphAt(PREVIOUS_GRAPH_PATH, "Previous");
  const previousNodes = new Map(previous.nodes.map(n => [n.id, n]));
  const currentEdges = new Map(current.edges.map(e => [edgeKey(e), e]));
  const previousEdges = new Map(previous.edges.map(e => [edgeKey(e), e]));
  const currentFiles = fileMap(current);
  const previousFiles = fileMap(previous);
  const currentDegree = degreeMap(current);
  const previousDegree = degreeMap(previous);

  const addedNodes = current.nodes.filter(n => !previousNodes.has(n.id));
  const removedNodes = previous.nodes.filter(n => !currentNodes.has(n.id));
  const addedEdges = current.edges.filter(e => !previousEdges.has(edgeKey(e)));
  const removedEdges = previous.edges.filter(e => !currentEdges.has(edgeKey(e)));
  const addedFiles = [...currentFiles.entries()].filter(([p]) => !previousFiles.has(p)).map(([, n]) => compactNode(n));
  const removedFiles = [...previousFiles.entries()].filter(([p]) => !currentFiles.has(p)).map(([, n]) => compactNode(n));
  const changedFiles = [...currentFiles.entries()]
    .filter(([p, n]) => previousFiles.has(p) && previousFiles.get(p).sha256 !== n.sha256)
    .map(([p, n]) => ({ path: p, beforeSha256: previousFiles.get(p).sha256, afterSha256: n.sha256, node: compactNode(n) }));

  const changedIds = new Set([
    ...addedEdges.flatMap(e => [e.from, e.to]),
    ...removedEdges.flatMap(e => [e.from, e.to]),
    ...changedFiles.map(f => f.node.id),
  ]);
  const changedSemanticNeighborhoods = [...changedIds]
    .map(id => {
      const node = currentNodes.get(id) || previousNodes.get(id);
      if (!node || node.kind === "topic") return null;
      const edgeAdded = addedEdges.filter(e => e.from === id || e.to === id).length;
      const edgeRemoved = removedEdges.filter(e => e.from === id || e.to === id).length;
      return {
        node: compactNode(node),
        degreeBefore: previousDegree.get(id) || 0,
        degreeAfter: currentDegree.get(id) || 0,
        addedEdges: edgeAdded,
        removedEdges: edgeRemoved,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.addedEdges + b.removedEdges) - (a.addedEdges + a.removedEdges) || (b.degreeAfter - a.degreeAfter))
    .slice(0, 25);

  const newlyIsolatedNodes = current.nodes
    .filter(n => n.kind !== "topic" && (currentDegree.get(n.id) || 0) === 0 && (!previousNodes.has(n.id) || (previousDegree.get(n.id) || 0) > 0))
    .slice(0, 25)
    .map(compactNode);

  const previousTags = tagCounts(previous);
  const currentTags = tagCounts(current);
  const topicChanges = [...new Set([...previousTags.keys(), ...currentTags.keys()])]
    .map(topic => ({ topic, before: previousTags.get(topic) || 0, after: currentTags.get(topic) || 0, delta: (currentTags.get(topic) || 0) - (previousTags.get(topic) || 0) }))
    .filter(x => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.topic.localeCompare(b.topic))
    .slice(0, 20);

  const rereadRows = [];
  const addReread = (reason, node) => {
    if (!node?.path) return;
    rereadRows.push({ reason, target: node.line ? `${node.path}:${lineRange(node.line, 45)}` : node.path, node: compactNode(node) });
  };
  for (const f of addedFiles) addReread("new file", currentNodes.get(f.id));
  for (const f of changedFiles) addReread("changed file", currentNodes.get(f.node.id));
  for (const row of changedSemanticNeighborhoods) addReread("changed neighborhood", currentNodes.get(row.node.id));
  const seenReads = new Set();
  const recommendedRereads = rereadRows
    .filter(r => {
      const key = `${r.reason}\0${r.target}`;
      if (seenReads.has(key)) return false;
      seenReads.add(key);
      return true;
    })
    .slice(0, 25);

  return {
    generatedAt,
    status: "ok",
    paths: { current: path.relative(ROOT, GRAPH_PATH), previous: path.relative(ROOT, PREVIOUS_GRAPH_PATH) },
    previous: { generatedAt: previous.generatedAt, stats: previous.stats },
    current: { generatedAt: current.generatedAt, stats: current.stats },
    counts: {
      addedFiles: addedFiles.length,
      removedFiles: removedFiles.length,
      changedFiles: changedFiles.length,
      addedNodes: addedNodes.length,
      removedNodes: removedNodes.length,
      addedEdges: addedEdges.length,
      removedEdges: removedEdges.length,
      newInferredEdges: addedEdges.filter(e => e.evidence === "INFERRED").length,
      newlyIsolatedNodes: newlyIsolatedNodes.length,
    },
    files: { added: addedFiles.slice(0, 50), removed: removedFiles.slice(0, 50), changed: changedFiles.slice(0, 50) },
    changedSemanticNeighborhoods,
    newInferredEdges: addedEdges.filter(e => e.evidence === "INFERRED").slice(0, 25).map(e => edgeSummary(e, currentNodes)),
    newlyIsolatedNodes,
    topicChanges,
    recommendedRereads,
  };
}
function deltaMarkdown(report) {
  const statusLine = report.status === "ok" ? "Compared current graph to the previous graph snapshot." : report.message;
  return [
    "# Graph-It delta report",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    statusLine,
    "",
    "## Summary",
    "",
    table(["Metric", "Value"], Object.entries(report.counts || {}).map(([k, v]) => [k, String(v)])),
    "",
    "## Changed files",
    "",
    table(["Change", "File"], [
      ...(report.files?.added || []).map(n => ["Added", n.path || n.label]),
      ...(report.files?.removed || []).map(n => ["Removed", n.path || n.label]),
      ...(report.files?.changed || []).map(f => ["Changed", f.path]),
    ]),
    "",
    "## Changed semantic neighborhoods",
    "",
    table(["Node", "Location", "Degree before", "Degree after", "Added edges", "Removed edges"], (report.changedSemanticNeighborhoods || []).map(r => [wikiNodeLabel(r.node), wikiNodeRef(r.node), String(r.degreeBefore), String(r.degreeAfter), String(r.addedEdges), String(r.removedEdges)])),
    "",
    "## New inferred edges",
    "",
    table(["From", "Edge", "To", "Why"], (report.newInferredEdges || []).map(e => [wikiNodeLabel(e.from), e.type, wikiNodeLabel(e.to), e.why || e.evidence || ""])),
    "",
    "## Topic movement",
    "",
    table(["Topic", "Before", "After", "Delta"], (report.topicChanges || []).map(t => [t.topic, String(t.before), String(t.after), String(t.delta)])),
    "",
    "## Newly isolated nodes",
    "",
    table(["Node", "Location", "Summary"], (report.newlyIsolatedNodes || []).map(n => [wikiNodeLabel(n), wikiNodeRef(n), n.summary || ""])),
    "",
    "## Recommended rereads",
    "",
    table(["Reason", "Target"], (report.recommendedRereads || []).map(r => [r.reason, r.target])),
    "",
  ].join("\n");
}
function delta() {
  ensureDir(OUT_DIR);
  const report = deltaResult();
  fs.writeFileSync(DELTA_REPORT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(DELTA_REPORT_MD, deltaMarkdown(report));
  if (report.status === "ok") {
    console.log(`Delta: ${report.counts.changedFiles} changed files, ${report.counts.addedNodes} added nodes, ${report.counts.addedEdges} added edges.`);
  } else {
    console.log(report.message);
  }
  console.log(`Wrote ${path.relative(ROOT, DELTA_REPORT_JSON)}`);
  console.log(`Wrote ${path.relative(ROOT, DELTA_REPORT_MD)}`);
}
function table(headers, rows) {
  if (!rows.length) return "_None found._";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${row.map(md).join(" | ")} |`),
  ].join("\n");
}
function wikiNodeRef(n) {
  const location = n.path ? `${n.path}${n.line ? `:${n.line}` : ""}` : "";
  return location || n.id;
}
function wikiNodeLabel(n) {
  return `${n.kind}:${n.label || n.id}`;
}
function topicMembership(g) {
  const topics = new Map(g.nodes.filter(n => n.kind === "topic").map(n => [n.id, n]));
  const membership = new Map();
  const byTopic = new Map([...topics.keys()].map(id => [id, new Set()]));
  for (const e of g.edges) {
    const fromTopic = topics.has(e.from);
    const toTopic = topics.has(e.to);
    if (!fromTopic && !toTopic) continue;
    const topicId = fromTopic ? e.from : e.to;
    const nodeId = fromTopic ? e.to : e.from;
    if (!membership.has(nodeId)) membership.set(nodeId, new Set());
    membership.get(nodeId).add(topicId);
    byTopic.get(topicId)?.add(nodeId);
  }
  for (const n of g.nodes) {
    if (topics.has(n.id)) continue;
    for (const topic of topics.values()) {
      if (!(n.semanticTags || []).includes(topic.label)) continue;
      if (!membership.has(n.id)) membership.set(n.id, new Set());
      membership.get(n.id).add(topic.id);
      byTopic.get(topic.id)?.add(n.id);
    }
  }
  return { topics, membership, byTopic };
}
function wikiInsights(g, graphAdj, membership) {
  const nodes = new Map(g.nodes.map(n => [n.id, n]));
  const degreeRows = g.nodes
    .filter(n => n.kind !== "topic")
    .map(n => ({ n, degree: graphAdj.get(n.id)?.length || 0 }))
    .filter(x => x.degree > 0)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 12)
    .map(({ n, degree }) => [wikiNodeLabel(n), wikiNodeRef(n), String(degree), (n.semanticTags || []).join(", ")]);
  const bridgeRows = g.nodes
    .filter(n => membership.get(n.id)?.size > 1)
    .map(n => ({ n, topicCount: membership.get(n.id).size, degree: graphAdj.get(n.id)?.length || 0 }))
    .sort((a, b) => b.topicCount - a.topicCount || b.degree - a.degree)
    .slice(0, 12)
    .map(({ n, topicCount, degree }) => [wikiNodeLabel(n), wikiNodeRef(n), String(topicCount), String(degree), (n.semanticTags || []).join(", ")]);
  const crossTopicRows = [];
  for (const e of g.edges) {
    if (e.type === "SEMANTICALLY_RELATED" || e.type === "TAGGED") continue;
    const fromTopics = membership.get(e.from);
    const toTopics = membership.get(e.to);
    if (!fromTopics?.size || !toTopics?.size) continue;
    const overlap = [...fromTopics].some(t => toTopics.has(t));
    if (overlap) continue;
    const from = nodes.get(e.from), to = nodes.get(e.to);
    if (!from || !to || from.kind === "topic" || to.kind === "topic") continue;
    crossTopicRows.push([wikiNodeLabel(from), e.type, wikiNodeLabel(to), e.evidence || "", wikiNodeRef(from), wikiNodeRef(to)]);
    if (crossTopicRows.length >= 12) break;
  }
  const orphanRows = g.nodes
    .filter(n => n.id.startsWith("file:") && (graphAdj.get(n.id)?.length || 0) <= 1)
    .sort((a, b) => String(a.path || "").localeCompare(String(b.path || "")))
    .slice(0, 12)
    .map(n => [n.label, wikiNodeRef(n), String(graphAdj.get(n.id)?.length || 0), n.summary || ""]);
  const topicLabels = [...new Set(g.nodes.flatMap(n => n.semanticTags || []))].slice(0, 8);
  const suggestedQuestions = [
    "Which files should an agent read first for the main architecture?",
    "What code and docs are likely impacted by a change to the highest-degree node?",
    "Which bridge nodes connect multiple project areas?",
    ...topicLabels.slice(0, 4).map(t => `What are the key files and symbols for ${t}?`),
  ];
  return { degreeRows, bridgeRows, crossTopicRows, orphanRows, suggestedQuestions };
}
function writeTopicPage(topic, members, nodes, graphAdj) {
  const page = path.join(WIKI_DIR, "topics", `${slug(topic.label)}.md`);
  const ranked = [...members]
    .map(id => nodes.get(id))
    .filter(Boolean)
    .sort((a, b) => (graphAdj.get(b.id)?.length || 0) - (graphAdj.get(a.id)?.length || 0) || wikiNodeRef(a).localeCompare(wikiNodeRef(b)));
  const files = ranked.filter(n => n.id.startsWith("file:")).slice(0, 15);
  const symbols = ranked.filter(n => ["component", "symbol"].includes(n.kind)).slice(0, 15);
  const sections = ranked.filter(n => n.kind === "section").slice(0, 15);
  const content = [
    `# ${topic.label}`,
    "",
    topic.summary || "",
    "",
    "## Key files",
    "",
    table(["Node", "Location", "Summary"], files.map(n => [wikiNodeLabel(n), wikiNodeRef(n), n.summary || ""])),
    "",
    "## Key symbols and components",
    "",
    table(["Node", "Location", "Summary"], symbols.map(n => [wikiNodeLabel(n), wikiNodeRef(n), n.summary || ""])),
    "",
    "## Key sections",
    "",
    table(["Node", "Location", "Summary"], sections.map(n => [wikiNodeLabel(n), wikiNodeRef(n), n.summary || ""])),
    "",
  ].join("\n");
  fs.writeFileSync(page, content);
  return { label: topic.label, path: posix(path.relative(WIKI_DIR, page)), members: members.size, files: files.length, symbols: symbols.length, sections: sections.length };
}
function wiki() {
  const g = load();
  ensureDir(WIKI_DIR);
  ensureDir(path.join(WIKI_DIR, "topics"));
  const graphAdj = adj(g);
  const nodes = new Map(g.nodes.map(n => [n.id, n]));
  const { topics, membership, byTopic } = topicMembership(g);
  const topicPages = [...topics.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(topic => writeTopicPage(topic, byTopic.get(topic.id) || new Set(), nodes, graphAdj));
  const insights = wikiInsights(g, graphAdj, membership);
  const report = [
    "# Graph-It community report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Highest-degree nodes",
    "",
    table(["Node", "Location", "Degree", "Topics"], insights.degreeRows),
    "",
    "## Bridge nodes",
    "",
    table(["Node", "Location", "Topic count", "Degree", "Topics"], insights.bridgeRows),
    "",
    "## Surprising cross-topic links",
    "",
    table(["From", "Edge", "To", "Evidence", "From location", "To location"], insights.crossTopicRows),
    "",
    "## Stale or orphaned files",
    "",
    table(["File", "Location", "Degree", "Summary"], insights.orphanRows),
    "",
    "## Suggested questions",
    "",
    ...insights.suggestedQuestions.map(q => `- ${q}`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(WIKI_DIR, "community-report.md"), report);
  const index = [
    "# Graph-It agent wiki",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Graph root: ${g.root}`,
    "",
    "## Graph stats",
    "",
    table(["Metric", "Value"], Object.entries(g.stats || {}).map(([k, v]) => [k, String(v)])),
    "",
    "## Topic pages",
    "",
    table(["Topic", "Page", "Members", "Files", "Symbols", "Sections"], topicPages.map(p => [p.label, p.path, String(p.members), String(p.files), String(p.symbols), String(p.sections)])),
    "",
    "## Project intelligence",
    "",
    "- [Community report](community-report.md)",
    "- Review bridge nodes before large refactors.",
    "- Start with topic pages when an agent needs compact context before opening raw files.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(WIKI_DIR, "index.md"), index);
  console.log(`Wrote ${path.relative(ROOT, path.join(WIKI_DIR, "index.md"))}`);
  console.log(`Wrote ${path.relative(ROOT, path.join(WIKI_DIR, "community-report.md"))}`);
  console.log(`Wrote ${topicPages.length} topic pages under ${path.relative(ROOT, path.join(WIKI_DIR, "topics"))}`);
}
function safeScriptJson(value) {
  return JSON.stringify(value).replace(/[<>&]/g, c => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" }[c]));
}
function viewerHtml(g) {
  const data = safeScriptJson(g);
  const qualityData = safeScriptJson(computeQuality(g));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Graph-It Viewer</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0f172a;
      --panel: #111827;
      --muted: #94a3b8;
      --text: #e5e7eb;
      --line: #334155;
      --accent: #38bdf8;
      --accent-2: #a78bfa;
      --chip: #1e293b;
      --danger: #fb7185;
      --ok: #34d399;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { padding: 18px 22px; border-bottom: 1px solid var(--line); background: linear-gradient(90deg, rgba(56,189,248,.14), rgba(167,139,250,.12)); }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .sub { color: var(--muted); font-size: 13px; }
    main { display: grid; grid-template-columns: 310px minmax(0, 1fr) 340px; gap: 0; height: calc(100vh - 76px); }
    aside, section.details { overflow: auto; padding: 16px; background: var(--panel); border-right: 1px solid var(--line); }
    section.details { border-right: 0; border-left: 1px solid var(--line); }
    .canvas-wrap { position: relative; overflow: hidden; }
    #graph { width: 100%; height: 100%; display: block; background: radial-gradient(circle at top left, rgba(56,189,248,.10), transparent 36%), #020617; }
    label { display: block; color: var(--muted); font-size: 12px; font-weight: 650; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .05em; }
    input[type="search"] { width: 100%; padding: 10px 11px; border-radius: 10px; border: 1px solid var(--line); background: #020617; color: var(--text); }
    .checks { display: flex; flex-direction: column; gap: 7px; max-height: 190px; overflow: auto; padding-right: 3px; }
    .check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #cbd5e1; }
    .check input { accent-color: var(--accent); }
     .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
     .stat { padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: #020617; }
     .stat strong { display: block; font-size: 20px; }
     .stat span { color: var(--muted); font-size: 12px; }
     .quality { margin-top: 14px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: #020617; }
     .quality-score { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
     .quality-score strong { color: var(--ok); font-size: 26px; }
     .quality ul { margin: 10px 0 0; padding-left: 18px; color: #cbd5e1; font-size: 12px; line-height: 1.45; }
     .toolbar { position: absolute; left: 14px; top: 14px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 999px; background: rgba(2,6,23,.86); color: var(--muted); font-size: 12px; backdrop-filter: blur(10px); }
     .limit-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; margin-top: 12px; }
     select { padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: #020617; color: var(--text); }
    .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 999px; background: var(--chip); color: #cbd5e1; font-size: 12px; }
    .dot { width: 9px; height: 9px; border-radius: 999px; background: var(--accent); }
    .details h2 { margin: 0 0 8px; font-size: 18px; }
    .details .kind { color: var(--accent); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
    .details p { color: #cbd5e1; line-height: 1.45; }
    .kv { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 6px 10px; margin: 12px 0; font-size: 13px; }
    .kv b { color: var(--muted); }
    .kv span { overflow-wrap: anywhere; }
    .edge-list { display: flex; flex-direction: column; gap: 7px; margin-top: 10px; }
    .edge-card { padding: 9px; border: 1px solid var(--line); border-radius: 10px; background: #020617; font-size: 12px; color: #cbd5e1; }
    .edge-card b { color: var(--accent-2); }
    .node { cursor: pointer; }
    .node text { pointer-events: none; font-size: 10px; fill: #e5e7eb; paint-order: stroke; stroke: #020617; stroke-width: 3px; stroke-linejoin: round; }
    .node circle { stroke: #e2e8f0; stroke-width: 1.3; }
    .edge { stroke: #64748b; stroke-opacity: .42; }
    .edge.inferred { stroke: var(--accent-2); stroke-dasharray: 4 4; }
    .edge.ambiguous { stroke: var(--danger); stroke-dasharray: 2 5; }
    .empty { color: var(--muted); font-style: italic; }
  </style>
</head>
<body>
  <header>
    <h1>Graph-It Viewer</h1>
    <div class="sub" id="meta"></div>
  </header>
  <main>
    <aside>
       <label for="search">Search nodes</label>
       <input id="search" type="search" placeholder="symbol, file, topic, summary">
       <div class="limit-row">
         <label for="renderLimit" style="margin:0">Render limit</label>
         <select id="renderLimit">
           <option value="250">Top 250</option>
           <option value="500" selected>Top 500</option>
           <option value="1000">Top 1000</option>
           <option value="2000">Top 2000</option>
           <option value="0">All nodes</option>
         </select>
       </div>
      <label>Node kinds</label>
      <div class="checks" id="kindFilters"></div>
      <label>Topics</label>
      <div class="checks" id="topicFilters"></div>
      <label>Evidence</label>
      <div class="checks" id="evidenceFilters"></div>
       <div class="summary">
         <div class="stat"><strong id="nodeCount">0</strong><span>visible nodes</span></div>
         <div class="stat"><strong id="edgeCount">0</strong><span>visible edges</span></div>
       </div>
       <div class="quality" id="qualityPanel"></div>
       <div class="legend" id="legend"></div>
    </aside>
    <div class="canvas-wrap">
      <div class="toolbar">Drag-free local SVG. Filter to simplify dense graphs.</div>
      <svg id="graph" role="img" aria-label="Interactive Graph-It graph viewer"></svg>
    </div>
    <section class="details" id="details">
      <h2>Select a node</h2>
      <p class="empty">Click a circle to inspect its file path, summary, semantic tags, and nearby relationships.</p>
    </section>
  </main>
   <script id="graph-data" type="application/json">${data}</script>
   <script id="quality-data" type="application/json">${qualityData}</script>
   <script>
     const graph = JSON.parse(document.getElementById("graph-data").textContent);
     const quality = JSON.parse(document.getElementById("quality-data").textContent);
    const nodesById = new Map(graph.nodes.map(n => [n.id, n]));
    const degrees = new Map(graph.nodes.map(n => [n.id, 0]));
    for (const edge of graph.edges) {
      degrees.set(edge.from, (degrees.get(edge.from) || 0) + 1);
      degrees.set(edge.to, (degrees.get(edge.to) || 0) + 1);
    }
    const colors = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#60a5fa", "#f472b6", "#2dd4bf", "#c084fc", "#f97316"];
    const svg = document.getElementById("graph");
     const search = document.getElementById("search");
     const renderLimit = document.getElementById("renderLimit");
    const kindFilters = document.getElementById("kindFilters");
    const topicFilters = document.getElementById("topicFilters");
    const evidenceFilters = document.getElementById("evidenceFilters");
     const details = document.getElementById("details");
     const meta = document.getElementById("meta");
     meta.textContent = "Root: " + graph.root + " · generated " + graph.generatedAt + " · " + graph.nodes.length + " nodes / " + graph.edges.length + " edges";
     document.getElementById("qualityPanel").innerHTML =
       '<div class="quality-score"><span class="muted">Quality</span><strong>' + esc(quality.score) + '/100</strong></div>' +
       '<div class="sub">' + esc(quality.grade) + ' · ' + esc(quality.metrics.orphanCount) + ' orphans · ' + esc(quality.metrics.weakEdgeCount) + ' weak edges</div>' +
       '<ul>' + quality.recommendations.slice(0, 3).map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>';

    function esc(text) {
      return String(text == null ? "" : text).replace(/[&<>"']/g, c => {
        if (c === "&") return "&amp;";
        if (c === "<") return "&lt;";
        if (c === ">") return "&gt;";
        if (c === '"') return "&quot;";
        return "&#39;";
      });
    }
    function hash(text) {
      let h = 2166136261;
      for (let i = 0; i < String(text).length; i++) h = Math.imul(h ^ String(text).charCodeAt(i), 16777619);
      return h >>> 0;
    }
    function nodeTopic(n) {
      if (n.kind === "topic") return n.label || n.id;
      return (n.semanticTags && n.semanticTags[0]) || "Uncategorized";
    }
    function nodeTopics(n) {
      if (n.kind === "topic") return [n.label || n.id];
      return n.semanticTags && n.semanticTags.length ? n.semanticTags : ["Uncategorized"];
    }
    function nodeLocation(n) {
      return n.path ? n.path + (n.line ? ":" + n.line : "") : "";
    }
    function haystack(n) {
      return [n.id, n.kind, n.label, n.path, n.summary, (n.semanticTags || []).join(" "), (n.tokens || []).join(" ")].join(" ").toLowerCase();
    }
    function unique(values) {
      return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    }
    const kinds = unique(graph.nodes.map(n => n.kind));
    const topics = unique(graph.nodes.flatMap(n => n.kind === "topic" ? [n.label] : (n.semanticTags || []))).concat(["Uncategorized"]).filter((v, i, a) => a.indexOf(v) === i);
    const evidences = unique(graph.edges.map(e => e.evidence || "UNSPECIFIED"));
    const colorByTopic = new Map(topics.map((t, i) => [t, colors[i % colors.length]]));

    function checkbox(container, group, value) {
      const row = document.createElement("label");
      row.className = "check";
      row.innerHTML = '<input type="checkbox" data-group="' + group + '" value="' + esc(value) + '" checked> <span>' + esc(value) + '</span>';
      container.appendChild(row);
    }
    kinds.forEach(v => checkbox(kindFilters, "kind", v));
    topics.forEach(v => checkbox(topicFilters, "topic", v));
    evidences.forEach(v => checkbox(evidenceFilters, "evidence", v));
    document.getElementById("legend").innerHTML = topics.slice(0, 10).map(t => '<span class="pill"><span class="dot" style="background:' + colorByTopic.get(t) + '"></span>' + esc(t) + '</span>').join("");

    function selected(group) {
      return new Set([...document.querySelectorAll('input[data-group="' + group + '"]:checked')].map(x => x.value));
    }
    function addSvg(tag, attrs, parent = svg) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
      parent.appendChild(el);
      return el;
    }
    function layout(nodes, edges, width, height) {
      const topicAngles = new Map(topics.map((t, i) => [t, (Math.PI * 2 * i) / Math.max(1, topics.length)]));
      const state = new Map(nodes.map(n => {
        const topic = nodeTopic(n);
        const angle = topicAngles.get(topic) ?? ((hash(n.id) / 4294967295) * Math.PI * 2);
        const jitter = ((hash(n.id + ":j") % 100) / 100 - .5) * 110;
        const r = n.kind === "topic" ? Math.min(width, height) * .32 : Math.min(width, height) * (.15 + ((hash(n.id) % 100) / 500));
        return [n.id, { x: width / 2 + Math.cos(angle) * r + jitter, y: height / 2 + Math.sin(angle) * r + jitter, vx: 0, vy: 0 }];
      }));
      const visibleIds = new Set(nodes.map(n => n.id));
      const visibleEdges = edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));
      const steps = nodes.length > 1200 ? 18 : nodes.length > 700 ? 28 : nodes.length > 350 ? 45 : 90;
      const repulsionWindow = nodes.length > 900 ? 180 : nodes.length > 500 ? 260 : nodes.length;
      for (let step = 0; step < steps; step++) {
        for (let i = 0; i < nodes.length; i++) {
          const a = state.get(nodes[i].id);
          const maxJ = Math.min(nodes.length, i + repulsionWindow);
          for (let j = i + 1; j < maxJ; j++) {
            const b = state.get(nodes[j].id);
            const dx = a.x - b.x || .01, dy = a.y - b.y || .01;
            const d2 = Math.max(80, dx * dx + dy * dy);
            const f = 220 / d2;
            a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
          }
        }
        for (const e of visibleEdges) {
          const a = state.get(e.from), b = state.get(e.to);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const target = e.evidence === "EXTRACTED" ? 105 : 140;
          const f = (d - target) * .002;
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
        for (const n of nodes) {
          const p = state.get(n.id);
          p.vx += (width / 2 - p.x) * .0008;
          p.vy += (height / 2 - p.y) * .0008;
          p.x = Math.max(32, Math.min(width - 32, p.x + p.vx));
          p.y = Math.max(32, Math.min(height - 32, p.y + p.vy));
          p.vx *= .72; p.vy *= .72;
        }
      }
      return state;
    }
    function showNode(n) {
      const related = graph.edges.filter(e => e.from === n.id || e.to === n.id).slice(0, 20);
      details.innerHTML = '<div class="kind">' + esc(n.kind) + '</div><h2>' + esc(n.label || n.id) + '</h2>' +
        '<p>' + esc(n.summary || "No summary.") + '</p>' +
        '<div class="kv"><b>ID</b><span>' + esc(n.id) + '</span><b>Location</b><span>' + esc(nodeLocation(n) || "n/a") + '</span><b>Topics</b><span>' + esc((n.semanticTags || []).join(", ") || "n/a") + '</span><b>Degree</b><span>' + esc(degrees.get(n.id) || 0) + '</span></div>' +
        '<label>Nearby relationships</label><div class="edge-list">' + (related.length ? related.map(e => {
          const other = nodesById.get(e.from === n.id ? e.to : e.from);
          return '<div class="edge-card"><b>' + esc(e.type) + '</b> · ' + esc(e.evidence || "") + '<br>' + esc(other ? (other.kind + ":" + (other.label || other.id)) : "Missing node") + (e.why ? '<br><span>' + esc(e.why) + '</span>' : '') + '</div>';
        }).join("") : '<p class="empty">No relationships found.</p>') + '</div>';
    }
     function rankedNodes(nodes) {
       return nodes.slice().sort((a, b) => {
         const da = degrees.get(a.id) || 0;
         const db = degrees.get(b.id) || 0;
         if (db !== da) return db - da;
         if (a.kind === "topic" && b.kind !== "topic") return -1;
         if (b.kind === "topic" && a.kind !== "topic") return 1;
         return String(a.label || a.id).localeCompare(String(b.label || b.id));
       });
     }
     function render() {
       const q = search.value.trim().toLowerCase();
       const kindSet = selected("kind"), topicSet = selected("topic"), evidenceSet = selected("evidence");
       const matchedNodes = graph.nodes.filter(n => kindSet.has(n.kind) && nodeTopics(n).some(t => topicSet.has(t)) && (!q || haystack(n).includes(q)));
       const limit = Number(renderLimit.value || 500);
       const visibleNodes = limit > 0 ? rankedNodes(matchedNodes).slice(0, limit) : matchedNodes;
       const visibleIds = new Set(visibleNodes.map(n => n.id));
       const visibleEdges = graph.edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to) && evidenceSet.has(e.evidence || "UNSPECIFIED"));
       document.getElementById("nodeCount").textContent = visibleNodes.length + (visibleNodes.length < matchedNodes.length ? " / " + matchedNodes.length : "");
       document.getElementById("edgeCount").textContent = visibleEdges.length;
      svg.replaceChildren();
      const box = svg.getBoundingClientRect();
      const width = Math.max(700, box.width || 1000), height = Math.max(500, box.height || 700);
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
       const positions = layout(visibleNodes, visibleEdges, width, height);
      const edgeGroup = addSvg("g", {});
      const nodeGroup = addSvg("g", {});
      for (const e of visibleEdges) {
        const a = positions.get(e.from), b = positions.get(e.to);
        if (!a || !b) continue;
        addSvg("line", { class: "edge " + String(e.evidence || "").toLowerCase(), x1: a.x, y1: a.y, x2: b.x, y2: b.y, "stroke-width": e.evidence === "EXTRACTED" ? 1.4 : 1 }, edgeGroup);
      }
      for (const n of visibleNodes) {
        const p = positions.get(n.id);
        const group = addSvg("g", { class: "node", tabindex: "0" }, nodeGroup);
        const r = Math.min(18, 6 + Math.sqrt(degrees.get(n.id) || 0) * 2.1 + (n.kind === "topic" ? 4 : 0));
        addSvg("circle", { cx: p.x, cy: p.y, r, fill: colorByTopic.get(nodeTopic(n)) || "#38bdf8" }, group);
        if (r >= 10 || n.kind === "topic") addSvg("text", { x: p.x + r + 4, y: p.y + 3 }, group).textContent = n.label || n.id;
        group.addEventListener("click", () => showNode(n));
        group.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") showNode(n); });
        group.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "title")).textContent = n.kind + ":" + (n.label || n.id);
      }
    }
     document.querySelectorAll("input, select").forEach(input => input.addEventListener("input", render));
     document.querySelectorAll("select").forEach(input => input.addEventListener("change", render));
    window.addEventListener("resize", render);
    render();
  </script>
</body>
</html>`;
}
function viewer() {
  const g = load();
  ensureDir(OUT_DIR);
  fs.writeFileSync(VIEWER_PATH, viewerHtml(g));
  console.log(`Wrote ${path.relative(ROOT, VIEWER_PATH)}`);
  console.log("Open it in a browser to search, filter by kind/topic/evidence, and inspect graph neighborhoods.");
}
function parseWatchArgs(args) {
  const opts = { intervalMs: 1500, wikiOutput: true, viewerOutput: true };
  for (const arg of args) {
    if (arg.startsWith("--interval=")) opts.intervalMs = Math.max(250, Number(arg.slice("--interval=".length)) || opts.intervalMs);
    else if (arg === "--no-wiki") opts.wikiOutput = false;
    else if (arg === "--no-viewer") opts.viewerOutput = false;
  }
  return opts;
}
function trackedFilesSnapshot() {
  const files = walk(ROOT)
    .filter(abs => {
      const ext = path.extname(abs).toLowerCase();
      return TEXT_EXTS.has(ext) || IMAGE_EXTS.has(ext) || PDF_EXTS.has(ext) || VIDEO_EXTS.has(ext) || ARCHIVE_EXTS.has(ext);
    })
    .sort((a, b) => a.localeCompare(b));
  return files.map(abs => {
    const st = fs.statSync(abs);
    return `${rel(abs)}:${st.size}:${Math.trunc(st.mtimeMs)}`;
  }).join("\n");
}
function watch(args) {
  const opts = parseWatchArgs(args);
  let lastSnapshot = trackedFilesSnapshot();
  let running = false;
  let pending = false;
  let timer = null;
  const runRefresh = () => {
    if (running) { pending = true; return; }
    running = true;
    try {
      console.log(`\nChange detected. Refreshing Graph-It artifacts...`);
      refreshGeneratedArtifacts({ wikiOutput: opts.wikiOutput, viewerOutput: opts.viewerOutput });
      console.log(`Watching for changes every ${opts.intervalMs}ms. Press Ctrl+C to stop.`);
    } catch (err) {
      console.error(`Graph-It refresh failed: ${err.message}`);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        clearTimeout(timer);
        timer = setTimeout(runRefresh, 250);
      }
    }
  };
  const check = () => {
    let nextSnapshot;
    try {
      nextSnapshot = trackedFilesSnapshot();
    } catch (err) {
      console.error(`Watch scan failed: ${err.message}`);
      return;
    }
    if (nextSnapshot === lastSnapshot) return;
    lastSnapshot = nextSnapshot;
    clearTimeout(timer);
    timer = setTimeout(runRefresh, 300);
  };
  refreshGeneratedArtifacts({ wikiOutput: opts.wikiOutput, viewerOutput: opts.viewerOutput });
  console.log(`Watching for changes every ${opts.intervalMs}ms. Press Ctrl+C to stop.`);
  setInterval(check, opts.intervalMs);
}
function installPostCommitHook() {
  const gitDir = path.join(ROOT, ".git");
  if (!fs.existsSync(gitDir)) throw new Error("Cannot install hook because .git was not found in this project root.");
  ensureDir(path.dirname(POST_COMMIT_HOOK));
  const start = "# graph-it managed block: start";
  const end = "# graph-it managed block: end";
  const block = [
    start,
    "if command -v node >/dev/null 2>&1 && [ -f \"tools/semantic-kg.mjs\" ]; then",
    "  node tools/semantic-kg.mjs build >/dev/null 2>&1 || echo \"Graph-It build failed; run npm run kg:build\"",
    "  node tools/semantic-kg.mjs wiki >/dev/null 2>&1 || true",
    "  node tools/semantic-kg.mjs viewer >/dev/null 2>&1 || true",
    "fi",
    end,
  ].join("\n");
  const existing = fs.existsSync(POST_COMMIT_HOOK) ? fs.readFileSync(POST_COMMIT_HOOK, "utf8").replace(/\r\n/g, "\n") : "";
  const managedBlockRx = new RegExp(`${escapeRx(start)}[\\s\\S]*?${escapeRx(end)}`);
  let unmanaged = existing.replace(managedBlockRx, "").trimEnd();
  if (!unmanaged) unmanaged = "#!/bin/sh";
  else if (!unmanaged.startsWith("#!")) unmanaged = `#!/bin/sh\n\n${unmanaged}`;
  const next = `${unmanaged}\n\n${block}\n`;
  fs.writeFileSync(POST_COMMIT_HOOK, next.replace(/\n/g, "\n"));
  try {
    fs.chmodSync(POST_COMMIT_HOOK, 0o755);
  } catch (err) {
    console.warn(`Could not mark hook executable: ${err.message}`);
  }
  console.log(`Installed Graph-It managed post-commit hook at ${path.relative(ROOT, POST_COMMIT_HOOK)}.`);
  console.log("The hook refreshes build, wiki, and viewer artifacts after each commit.");
}
function hook(args) {
  const subcommand = args[0] || "";
  if (subcommand === "install") installPostCommitHook();
  else { console.error("Usage: node tools/semantic-kg.mjs hook install"); process.exit(1); }
}
function parseMcpConfigArgs(args) {
  const opts = { client: "all", smokeTest: false };
  for (const arg of args) {
    if (arg === "--smoke-test") opts.smokeTest = true;
    else if (arg.startsWith("--client=")) opts.client = arg.slice("--client=".length).toLowerCase();
    else if (arg === "--generic") opts.client = "generic";
    else if (arg === "--claude-desktop") opts.client = "claude-desktop";
    else if (arg === "--clawpilot") opts.client = "clawpilot";
    else if (arg) throw new Error(`Unknown mcp-config option: ${arg}`);
  }
  if (!["all", "generic", "claude-desktop", "clawpilot"].includes(opts.client)) {
    throw new Error(`Unsupported MCP config client: ${opts.client}`);
  }
  return opts;
}
function mcpServerDefinition() {
  return {
    command: "node",
    args: [TOOL_PATH, "mcp"],
    cwd: ROOT,
  };
}
function mcpConfigSmokeTest() {
  const checks = [];
  try {
    const statsPayload = callMcpTool("graph.stats", {});
    checks.push({ name: "graph.stats", ok: true, resultBytes: Buffer.byteLength(JSON.stringify(statsPayload), "utf8") });
  } catch (err) {
    checks.push({ name: "graph.stats", ok: false, error: err.message });
  }
  try {
    const deltaPayload = callMcpTool("graph.delta", {});
    checks.push({ name: "graph.delta", ok: true, resultBytes: Buffer.byteLength(JSON.stringify(deltaPayload), "utf8") });
  } catch (err) {
    checks.push({ name: "graph.delta", ok: false, error: err.message });
  }
  return { ok: checks.every(c => c.ok), checks };
}
function mcpConfigResult(args = []) {
  const opts = parseMcpConfigArgs(args);
  const server = mcpServerDefinition();
  const checks = [
    { name: "Graph-It tool exists", ok: fs.existsSync(TOOL_PATH), path: path.relative(ROOT, TOOL_PATH) },
    { name: "Graph artifact exists", ok: fs.existsSync(GRAPH_PATH), path: path.relative(ROOT, GRAPH_PATH), fix: "Run npm run kg:build or node tools/semantic-kg.mjs build." },
    { name: "Node command", ok: true, command: server.command },
  ];
  const generic = { "graph-it": server };
  const clientSnippets = {};
  if (opts.client === "all" || opts.client === "generic") {
    clientSnippets.generic = {
      description: "Use this shape for MCP clients that accept a server map.",
      config: generic,
    };
  }
  if (opts.client === "all" || opts.client === "claude-desktop") {
    clientSnippets.claudeDesktop = {
      description: "Merge this into the top-level Claude Desktop config JSON.",
      config: { mcpServers: generic },
    };
  }
  if (opts.client === "all" || opts.client === "clawpilot") {
    clientSnippets.clawpilot = {
      description: "Use the same MCP server definition in Clawpilot or Copilot-compatible MCP settings.",
      config: { mcpServers: generic },
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    projectRoot: ROOT,
    serverName: "graph-it",
    server,
    checks,
    smokeTest: opts.smokeTest ? mcpConfigSmokeTest() : { skipped: true, runWith: "node tools/semantic-kg.mjs mcp-config --smoke-test" },
    clientSnippets,
    nextSteps: [
      "Build or refresh the graph with npm run kg:build.",
      "Copy the matching client snippet into your MCP client settings.",
      "Restart the MCP client, then call graph.stats to verify the server.",
      "Use graph.query before opening raw source files, and graph.delta after rebuilds to see what changed.",
    ],
  };
}
function mcpConfig(args) {
  console.log(JSON.stringify(mcpConfigResult(args), null, 2));
}
function captureConsole(fn) {
  const oldLog = console.log;
  const oldTable = console.table;
  let out = "";
  console.log = (...x) => { out += x.join(" ") + "\n"; };
  console.table = (...x) => { out += JSON.stringify(x[0], null, 2) + "\n"; };
  try {
    const value = fn();
    return { value, output: out.trim() };
  } finally {
    console.log = oldLog;
    console.table = oldTable;
  }
}
const MCP_TOOLS = [
  {
    name: "graph.stats",
    description: "Return current Graph-It graph statistics and graph artifact metadata.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "graph.query",
    description: "Search the semantic graph before reading raw files. Returns ranked nodes, neighbors, and suggested next-read ranges.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms, symbol name, file path fragment, or documentation phrase." },
        intent: { type: "string", enum: ["auto", "code", "docs", "media", "all"], description: "Optional ranking intent." },
        limit: { type: "number", minimum: 1, maximum: 30, description: "Maximum ranked hits to return." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "graph.path",
    description: "Find a shortest relationship path between two graph nodes resolved by id, label, symbol, or path fragment.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start node id, label, symbol, or path fragment." },
        to: { type: "string", description: "End node id, label, symbol, or path fragment." },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "graph.node",
    description: "Resolve and inspect one graph node by id, label, symbol, or path fragment.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Node id, label, symbol, or path fragment." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "graph.neighborhood",
    description: "Return the local semantic neighborhood around a node for compact agent context.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Center node id, label, symbol, or path fragment." },
        depth: { type: "number", minimum: 0, maximum: 3, description: "Relationship depth to traverse. Defaults to 1." },
        limit: { type: "number", minimum: 1, maximum: 120, description: "Maximum nodes to return. Defaults to 40." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "graph.build",
    description: "Rebuild the local Graph-It graph artifact for the current project root.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "graph.delta",
    description: "Compare the current graph to the previous graph snapshot and return changed files, semantic neighborhood movement, and recommended rereads.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "graph.mcp_config",
    description: "Return copy-ready local MCP client configuration for this Graph-It project.",
    inputSchema: {
      type: "object",
      properties: {
        client: { type: "string", enum: ["all", "generic", "claude-desktop", "clawpilot"], description: "Client snippet to return. Defaults to all." },
        smokeTest: { type: "boolean", description: "When true, runs local graph.stats and graph.delta smoke checks." },
      },
      additionalProperties: false,
    },
  },
];
function mcpContent(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}
function callMcpTool(name, args = {}) {
  if (name === "graph.stats") return mcpContent(statsResult());
  if (name === "graph.query") return mcpContent(queryResult({ query: args.query, intent: args.intent || "auto", limit: args.limit || 12 }));
  if (name === "graph.path") return mcpContent(pathResult(args.from, args.to));
  if (name === "graph.node") return mcpContent(nodeResult(args.query));
  if (name === "graph.neighborhood") return mcpContent(neighborhoodResult(args.query, args.depth || 1, args.limit || 40));
  if (name === "graph.build") {
    const built = captureConsole(() => build());
    return mcpContent({ message: built.output, stats: statsResult() });
  }
  if (name === "graph.delta") return mcpContent(deltaResult());
  if (name === "graph.mcp_config") return mcpContent(mcpConfigResult([`--client=${args.client || "all"}`, ...(args.smokeTest ? ["--smoke-test"] : [])]));
  throw new Error(`Unknown MCP tool: ${name}`);
}
function sendMcpMessage(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}
function sendMcpResponse(id, result) {
  if (id !== undefined && id !== null) sendMcpMessage({ jsonrpc: "2.0", id, result });
}
function sendMcpError(id, code, message, data) {
  if (id !== undefined && id !== null) sendMcpMessage({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
}
async function handleMcpMessage(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  if (message.id === undefined || message.id === null) return;
  try {
    if (message.method === "initialize") {
      sendMcpResponse(message.id, {
        protocolVersion: message.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "graph-it", version: "0.1.0" },
      });
    } else if (message.method === "ping") {
      sendMcpResponse(message.id, {});
    } else if (message.method === "tools/list") {
      sendMcpResponse(message.id, { tools: MCP_TOOLS });
    } else if (message.method === "tools/call") {
      const { name, arguments: toolArgs = {} } = message.params || {};
      sendMcpResponse(message.id, callMcpTool(name, toolArgs));
    } else {
      sendMcpError(message.id, -32601, `Method not found: ${message.method}`);
    }
  } catch (err) {
    sendMcpError(message.id, -32000, err.message, err.stack);
  }
}
function mcp() {
  let buffer = Buffer.alloc(0);
  const parseBuffered = () => {
    while (buffer.length) {
      let sep = buffer.indexOf("\r\n\r\n");
      let sepLen = 4;
      if (sep < 0) {
        sep = buffer.indexOf("\n\n");
        sepLen = 2;
      }
      if (sep < 0) return;
      const header = buffer.subarray(0, sep).toString("utf8");
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) {
        buffer = buffer.subarray(sep + sepLen);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = sep + sepLen;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) return;
      const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.subarray(bodyEnd);
      try {
        handleMcpMessage(JSON.parse(body));
      } catch (err) {
        sendMcpError(null, -32700, `Parse error: ${err.message}`);
      }
    }
  };
  process.stdin.on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    parseBuffered();
  });
  process.stdin.on("error", err => {
    console.error(`MCP stdin error: ${err.message}`);
  });
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || cmd === "help" || cmd === "--help") usage();
else if (cmd === "build") build();
else if (cmd === "stats") stats();
else if (cmd === "query") query(args);
else if (cmd === "impact") impact(args.join(" "));
else if (cmd === "drift") drift();
else if (cmd === "delta") delta();
else if (cmd === "wiki") wiki();
else if (cmd === "viewer") viewer();
else if (cmd === "quality") quality();
else if (cmd === "obsidian") obsidian();
else if (cmd === "ingest") ingest(args);
else if (cmd === "enrich") enrich(args);
else if (cmd === "watch") watch(args);
else if (cmd === "hook") hook(args);
else if (cmd === "mcp") mcp();
else if (cmd === "mcp-config") mcpConfig(args);
else if (cmd === "path") pathBetween(args[0] || "", args[1] || "");
else if (cmd === "baseline") baseline(args);
else { console.error(`Unknown command: ${cmd}`); usage(); process.exit(1); }
