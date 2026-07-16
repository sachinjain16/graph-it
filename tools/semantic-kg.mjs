#!/usr/bin/env node
// Portable local semantic knowledge graph template.
// Copy into a project as tools/semantic-kg.mjs and customize SEMANTIC_TOPICS.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import zlib from "node:zlib";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".semantic-kg");
const GRAPH_PATH = path.join(OUT_DIR, "graph.json");
const PREVIOUS_GRAPH_PATH = path.join(OUT_DIR, "previous-graph.json");
const DELTA_REPORT_JSON = path.join(OUT_DIR, "delta-report.json");
const DELTA_REPORT_MD = path.join(OUT_DIR, "delta-report.md");
const QUALITY_JSON = path.join(OUT_DIR, "quality.json");
const QUALITY_MD = path.join(OUT_DIR, "quality.md");
const EVAL_REPORT_JSON = path.join(OUT_DIR, "eval-report.json");
const EVAL_REPORT_MD = path.join(OUT_DIR, "eval-report.md");
const FRESHNESS_JSON = path.join(OUT_DIR, "freshness.json");
const SESSION_PROMPT_MD = path.join(OUT_DIR, "session-start.md");
const CACHE_DIR = path.join(OUT_DIR, "cache");
const WIKI_DIR = path.join(OUT_DIR, "wiki");
const EXPORT_DIR = path.join(OUT_DIR, "exports");
const PROOF_DIR = path.join(OUT_DIR, "proof");
const ENRICH_DIR = path.join(OUT_DIR, "enrichment");
const EXAMPLES_DIR = path.join(ROOT, "worked");
const AGENT_RULES_DIR = path.join(ROOT, ".graph-it", "agent-rules");
const VIEWER_PATH = path.join(OUT_DIR, "graph.html");
const POST_COMMIT_HOOK = path.join(ROOT, ".git", "hooks", "post-commit");
const TOOL_PATH = path.join(ROOT, "tools", "semantic-kg.mjs");
const TOOL_SOURCE_PATH = path.resolve(process.argv[1] || TOOL_PATH);
const INCLUDE_GENERATED = process.argv.includes("--include-generated");

const EXCLUDED_DIRS = new Set([".git", ".semantic-kg", ".graph-it", "node_modules", ".next", "dist", "coverage", ".cache", ".turbo"]);
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
const PACKAGE_SCRIPTS = {
  "kg:build": "node tools/semantic-kg.mjs build",
  "kg:stats": "node tools/semantic-kg.mjs stats",
    "kg:query": "node tools/semantic-kg.mjs query",
    "kg:pack": "node tools/semantic-kg.mjs pack",
    "kg:impact": "node tools/semantic-kg.mjs impact",
  "kg:drift": "node tools/semantic-kg.mjs drift",
  "kg:drift:report": "node tools/semantic-kg.mjs drift",
  "kg:delta": "node tools/semantic-kg.mjs delta",
  "kg:wiki": "node tools/semantic-kg.mjs wiki",
  "kg:viewer": "node tools/semantic-kg.mjs viewer",
  "kg:quality": "node tools/semantic-kg.mjs quality",
  "kg:export": "node tools/semantic-kg.mjs export",
  "kg:proof": "node tools/semantic-kg.mjs proof",
  "kg:examples": "node tools/semantic-kg.mjs examples",
  "kg:agent-rules": "node tools/semantic-kg.mjs agent-rules",
  "kg:obsidian": "node tools/semantic-kg.mjs obsidian",
  "kg:ingest": "node tools/semantic-kg.mjs ingest",
    "kg:enrich": "node tools/semantic-kg.mjs enrich",
    "kg:auto": "node tools/semantic-kg.mjs auto",
    "kg:freshness": "node tools/semantic-kg.mjs freshness",
    "kg:session-prompt": "node tools/semantic-kg.mjs session-prompt",
  "kg:watch": "node tools/semantic-kg.mjs watch",
  "kg:hook:install": "node tools/semantic-kg.mjs hook install",
  "kg:bootstrap": "node tools/semantic-kg.mjs bootstrap",
  "kg:install": "node tools/semantic-kg.mjs install",
  "kg:mcp": "node tools/semantic-kg.mjs mcp",
  "kg:mcp:config": "node tools/semantic-kg.mjs mcp-config",
  "kg:path": "node tools/semantic-kg.mjs path",
  "kg:baseline": "node tools/semantic-kg.mjs baseline",
  "kg:eval": "node tools/semantic-kg.mjs eval",
};

function usage() {
  console.log(`Semantic KG

Usage:
  node tools/semantic-kg.mjs build [--include-generated]
  node tools/semantic-kg.mjs stats
  node tools/semantic-kg.mjs query [--intent=code|docs|media|all] "terms"
  node tools/semantic-kg.mjs pack [--intent=code|docs|media|all] [--budget=1600] "terms"
  node tools/semantic-kg.mjs impact "SymbolOrFile"
  node tools/semantic-kg.mjs drift
  node tools/semantic-kg.mjs delta
  node tools/semantic-kg.mjs wiki
  node tools/semantic-kg.mjs viewer
  node tools/semantic-kg.mjs quality
  node tools/semantic-kg.mjs export [all|graphml|cypher|svg]
  node tools/semantic-kg.mjs proof ["query one" "query two"]
  node tools/semantic-kg.mjs examples [--name slug] [--public]
  node tools/semantic-kg.mjs agent-rules [all|generic|copilot|claude|cursor|codex]
  node tools/semantic-kg.mjs obsidian
  node tools/semantic-kg.mjs ingest <file-or-folder> [...]
  node tools/semantic-kg.mjs enrich [--provider local] [--extract-text] [--limit=50]
  node tools/semantic-kg.mjs auto [--once] [--interval=1500] [--debounce=500] [--no-quality] [--no-wiki] [--no-viewer] [--no-obsidian]
  node tools/semantic-kg.mjs freshness
  node tools/semantic-kg.mjs session-prompt [--print]
  node tools/semantic-kg.mjs watch
  node tools/semantic-kg.mjs hook install
  node tools/semantic-kg.mjs bootstrap [target-dir] [--with-hook] [--build] [--force]
  node tools/semantic-kg.mjs install [--project target-dir] [--with-hook] [--build] [--force]
  node tools/semantic-kg.mjs mcp
  node tools/semantic-kg.mjs mcp-config [--client=all|generic|claude-desktop|clawpilot] [--smoke-test]
  node tools/semantic-kg.mjs path "A" "B"
  node tools/semantic-kg.mjs baseline "query one" "query two"
  node tools/semantic-kg.mjs eval [--k=5] [--limit=20] [--auto=30] [--cases=path] [--min-hit-rate=0.8] [--strict]`);
}
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function posix(p) { return p.split(path.sep).join("/"); }
function rel(abs) { return posix(path.relative(ROOT, abs)); }
function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function tokenize(text) { return [...new Set(String(text).toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) || [])].filter(t => !STOP.has(t)).slice(0, 120); }
function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function slug(s) { return String(s || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "untitled"; }
function md(s) { return String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim(); }
function xml(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function cypherString(s) { return JSON.stringify(String(s ?? "")); }
function safeCypherId(id) { return `n${sha(Buffer.from(String(id))).slice(0, 12)}`; }
function groupBy(items, keyFn) { const map = new Map(); for (const item of items) { const key = keyFn(item); if (!map.has(key)) map.set(key, []); map.get(key).push(item); } return map; }
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
  const ext = path.extname(p).toLowerCase();
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
    const depSeen = new Set();
    const addDependency = (spec, index, edgeType = "IMPORTS") => {
      const clean = String(spec || "").trim();
      if (!clean || depSeen.has(`${edgeType}:${clean}`)) return;
      depSeen.add(`${edgeType}:${clean}`);
      const id = `${fid}#dep:${slug(`${edgeType}-${clean}`)}`;
      addNode(g, { id, kind: "dependency", label: clean, path: p, line: lineAt(text, index), summary: `${edgeType === "REQUIRES" ? "Requires" : "Imports"} ${clean}.`, semanticTags: ["dependency"], tokens: tokenize(clean) });
      addEdge(g, fid, id, edgeType, { evidence: "EXTRACTED" });
    };
    for (const m of text.matchAll(/import\s+(?:type\s+)?(?:(?:[\w*{}\s,$]+)\s+from\s+)?["']([^"']+)["']/g)) addDependency(m[1], m.index, "IMPORTS");
    for (const m of text.matchAll(/export\s+[^;\n]*\s+from\s+["']([^"']+)["']/g)) addDependency(m[1], m.index, "EXPORTS_FROM");
    for (const m of text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) addDependency(m[1], m.index, "REQUIRES");
    for (const m of text.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z_$][\w$]*)/g)) {
      const id = `${fid}#export:${m[1]}`;
      addNode(g, { id, kind: "export", label: m[1], path: p, line: lineAt(text, m.index), summary: `Exports ${m[1]}.`, semanticTags: ["export"], tokens: tokenize(m[1]) });
      addEdge(g, fid, id, "EXPORTS", { evidence: "EXTRACTED" });
      addEdge(g, id, symbolId(p, m[1]), "REFERENCES", { evidence: "EXTRACTED" });
    }
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
  g._approxTokens = estimateTokens(JSON.stringify(g, null, 2));
  g._warning = `Do not load this file whole into an LLM (~${g._approxTokens} tokens). Query it via graph.query / graph.pack / graph.node instead.`;
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
  const opts = { intent: "auto", limit: 12, budget: 1600 };
  const rest = [];
  for (const arg of args) {
    if (arg.startsWith("--intent=")) opts.intent = arg.slice("--intent=".length).toLowerCase();
    else if (arg === "--code") opts.intent = "code";
    else if (arg === "--docs") opts.intent = "docs";
    else if (arg === "--media") opts.intent = "media";
    else if (arg.startsWith("--limit=")) opts.limit = Math.max(1, Math.min(30, Number(arg.slice("--limit=".length)) || 12));
    else if (arg.startsWith("--budget=")) opts.budget = Math.max(200, Math.min(20000, Number(arg.slice("--budget=".length)) || 1600));
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
const CENTRALITY_WEIGHT = 35;
function pageRank(g, personalization = null, { damping = 0.85, iterations = 40 } = {}) {
  const ids = g.nodes.map(n => n.id);
  const N = ids.length;
  const result = new Map();
  if (!N) return result;
  const index = new Map(ids.map((id, i) => [id, i]));
  const out = new Map();
  const outDeg = new Array(N).fill(0);
  for (const e of g.edges) {
    const f = index.get(e.from), t = index.get(e.to);
    if (f === undefined || t === undefined) continue;
    if (!out.has(f)) out.set(f, []);
    out.get(f).push(t);
    outDeg[f]++;
  }
  let p = new Array(N).fill(1 / N);
  if (personalization && personalization.size) {
    let sum = 0; const raw = new Array(N).fill(0);
    for (const [id, w] of personalization) { const i = index.get(id); if (i !== undefined) { const v = Math.max(0, w); raw[i] += v; sum += v; } }
    if (sum > 0) p = raw.map(v => v / sum);
  }
  let rank = new Array(N).fill(1 / N);
  for (let it = 0; it < iterations; it++) {
    const next = new Array(N).fill(0);
    let dangling = 0;
    for (let i = 0; i < N; i++) if (outDeg[i] === 0) dangling += rank[i];
    for (let i = 0; i < N; i++) next[i] = (1 - damping) * p[i] + damping * dangling * p[i];
    for (let i = 0; i < N; i++) {
      if (outDeg[i] === 0) continue;
      const share = damping * rank[i] / outDeg[i];
      for (const t of out.get(i)) next[t] += share;
    }
    rank = next;
  }
  let max = 0; for (let i = 0; i < N; i++) if (rank[i] > max) max = rank[i];
  for (let i = 0; i < N; i++) result.set(ids[i], max > 0 ? rank[i] / max : 0);
  return result;
}
function dedupeNextReads(hits) {
  const seen = new Map();
  for (const hit of hits) {
    if (!hit.nextReads?.length) continue;
    const kept = [];
    for (const r of hit.nextReads) {
      const m = /^(.+?):(\d+)-(\d+)(.*)$/.exec(r);
      if (!m) { kept.push(r); continue; }
      const p = m[1], s = Number(m[2]), e = Number(m[3]);
      const ranges = seen.get(p) || [];
      if (ranges.some(([S, E]) => s <= E && e >= S)) continue;
      ranges.push([s, e]); seen.set(p, ranges); kept.push(r);
    }
    hit.nextReads = kept;
  }
  return hits;
}
function queryResult(args) {
  const opts = Array.isArray(args) ? parseQueryArgs(args) : { q: String(args?.q || args?.query || ""), intent: args?.intent || "auto", limit: args?.limit || 12 };
  if (!opts.q) throw new Error("Query is required.");
  const g = load();
  const a = adj(g);
  const intent = detectIntent(opts.q, opts.intent);
  const info = queryTerms(opts.q);
  const scored = g.nodes
    .map(n => ({ n, base: scoreNode(n, info, a, intent) }))
    .filter(x => x.base > 0);
  const personalization = new Map(scored.map(x => [x.n.id, x.base]));
  const pr = pageRank(g, personalization);
  const hits = scored
    .map(x => ({ n: x.n, score: x.base + (pr.get(x.n.id) || 0) * CENTRALITY_WEIGHT }))
    .sort((x, y) => y.score - x.score)
    .slice(0, opts.limit)
    .map(({ n, score }) => ({
      score: Math.round(score),
      node: compactNode(n),
      neighbors: (a.get(n.id) || []).slice(0, 8).map(compactNeighbor),
      nextReads: nextReadsFor(n, a),
    }));
  dedupeNextReads(hits);
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
function estimateTokens(text) {
  // Conservative, dependency-free BPE approximation. Plain bytes/4 undercounts code:
  // identifiers, numbers, and (especially) punctuation tokenize far denser than 4
  // bytes/token. We weight each class separately and round up so estimates never come
  // in below reality in the flattering direction. Prefer honesty over a smaller number.
  const s = String(text || "");
  if (!s) return 0;
  const pieces = s.match(/[A-Za-z]+|[0-9]+|\s+|[^A-Za-z0-9\s]/g) || [];
  let tokens = 0;
  for (const piece of pieces) {
    if (/^\s+$/.test(piece)) { tokens += Math.floor(piece.length / 12); continue; } // whitespace rarely its own token
    if (piece.length === 1 && /[^A-Za-z0-9]/.test(piece)) { tokens += 1; continue; } // punctuation ~1 token each
    tokens += Math.max(1, Math.ceil(piece.length / 4)); // word/number ~ subword pieces
  }
  return Math.max(1, tokens, Math.ceil(s.length / 4));
}
function packAnchors(text) {
  const anchors = new Set();
  const source = String(text || "");
  for (const rx of [
    /\b[A-Z][A-Za-z0-9]+(?:Service|Client|Provider|Router|Controller|Store|Agent|Skill|Graph|Pack)\b/g,
    /\b(?:TODO|FIXME|ERROR|WARN|FAILED|Exception|Traceback|Security|Auth|Token|Secret)\b/g,
    /(?:src|docs|skills|tests|scripts|tools|crates)\/[A-Za-z0-9_.\/-]+/g,
  ]) for (const m of source.matchAll(rx)) anchors.add(m[0]);
  return [...anchors].slice(0, 8);
}
function packRisks(text, kind) {
  const risks = [];
  if (/secret|token|password|api[_-]?key/i.test(text)) risks.push("possible-secret");
  if (/error|failed|exception|traceback/i.test(text)) risks.push("error-signal");
  if (kind === "code_file" || kind === "symbol" || kind === "component") risks.push("code-context");
  return risks;
}
function hitRaw(hit) {
  const n = hit.node || {};
  return [
    `${n.kind || "node"}: ${n.label || n.id}`,
    n.path ? `location: ${nodeLocation(n)}` : "",
    n.summary || "",
    hit.nextReads?.length ? `next reads: ${hit.nextReads.join("; ")}` : "",
    hit.neighbors?.length ? `neighbors: ${hit.neighbors.slice(0, 5).map(nb => `${nb.type} ${nb.node?.kind}:${nb.node?.label}`).join("; ")}` : "",
  ].filter(Boolean).join("\n");
}
function firstSentence(text, max = 140) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const dot = s.indexOf(". ");
  const cut = dot > 0 ? dot + 1 : s.length;
  return s.slice(0, Math.min(cut, max)).trim();
}
function renderCompressed(hit, anchors) {
  const n = hit.node || {};
  return [
    `${n.kind || "node"}: ${n.label || n.id}${n.path ? ` @ ${nodeLocation(n)}` : ""}`,
    firstSentence(n.summary),
    hit.nextReads?.length ? `read: ${hit.nextReads[0]}` : "",
    anchors.length ? `anchors: ${anchors.slice(0, 4).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}
function packHit(hit, index, bucket) {
  const n = hit.node || {};
  const raw = hitRaw(hit);
  const anchors = packAnchors(raw);
  const id = n.id || `hit-${index}`;
  let packedContent;
  if (bucket === "offloaded") packedContent = `Offloaded graph hit: ${n.label || n.id}. Reload with graph.node "${id}".`;
  else if (bucket === "compressed") packedContent = renderCompressed(hit, anchors);
  else packedContent = [anchors.length ? `Anchors: ${anchors.join(", ")}` : "", raw].filter(Boolean).join("\n");
  return {
    id,
    title: n.label || n.id || `hit-${index}`,
    bucket,
    kind: n.kind || "graph",
    originalTokens: estimateTokens(raw),
    packedTokens: estimateTokens(packedContent),
    packedContent,
    retainedAnchors: anchors,
    riskFlags: packRisks(raw, n.kind),
    nextReads: hit.nextReads || [],
    reloadWith: id,
  };
}
function packResult(args) {
  const opts = Array.isArray(args) ? parseQueryArgs(args) : { q: String(args?.q || args?.query || ""), intent: args?.intent || "auto", limit: args?.limit || 12, budget: args?.budget || 1600 };
  const budget = opts.budget || 1600;
  const queryPack = queryResult({ query: opts.q, intent: opts.intent || "auto", limit: opts.limit || 12 });
  const live = {
    id: "live:intent",
    title: "Live intent",
    bucket: "live",
    kind: "intent",
    originalTokens: estimateTokens(opts.q),
    packedTokens: estimateTokens(opts.q),
    packedContent: opts.q,
    retainedAnchors: packAnchors(opts.q),
    riskFlags: [],
    nextReads: [],
    reloadWith: null,
  };
  // Budget-fit by graceful degradation: keep the highest-ranked hits at full detail
  // while they fit, drop the next band to extractive "compressed" form, and collapse the
  // remainder into a single reversible offload pointer. Everything stays reloadable via graph.node.
  let used = live.packedTokens;
  const items = [live];
  const offloaded = [];
  let stopped = false;
  for (let i = 0; i < queryPack.hits.length; i++) {
    const hit = queryPack.hits[i];
    if (!stopped) {
      const full = packHit(hit, i, "graph");
      if (used + full.packedTokens <= budget) { items.push(full); used += full.packedTokens; continue; }
      const compressed = packHit(hit, i, "compressed");
      if (used + compressed.packedTokens <= budget) { items.push(compressed); used += compressed.packedTokens; continue; }
      stopped = true;
    }
    offloaded.push({ id: hit.node?.id, label: hit.node?.label, originalTokens: estimateTokens(hitRaw(hit)) });
  }
  if (offloaded.length) {
    const allIds = offloaded.map(o => o.id);
    const summaryText = (show, hidden) => `Offloaded ${offloaded.length} lower-ranked hit(s) to stay within budget. Reload with graph.node by id: ${show.join(", ")}${hidden ? ` (+${hidden} more)` : ""}.`;
    const remaining = Math.max(0, budget - used);
    let show = allIds.slice();
    let content = summaryText(show, 0);
    while (show.length && estimateTokens(content) > remaining) {
      show = show.slice(0, -1);
      content = show.length ? summaryText(show, allIds.length - show.length) : `Offloaded ${offloaded.length} lower-ranked hit(s); reload with graph.node (ids via graph.query).`;
    }
    items.push({
      id: "offloaded:summary",
      title: `${offloaded.length} offloaded hits`,
      bucket: "offloaded",
      kind: "summary",
      originalTokens: offloaded.reduce((s, o) => s + o.originalTokens, 0),
      packedTokens: estimateTokens(content),
      packedContent: content,
      retainedAnchors: [],
      riskFlags: [],
      nextReads: [],
      reloadWith: allIds,
    });
  }
  const buckets = { live: [], pinned: [], graph: [], compressed: [], offloaded: [] };
  for (const item of items) buckets[item.bucket].push(item);
  const originalTokens = items.reduce((sum, item) => sum + item.originalTokens, 0);
  const packedTokens = items.reduce((sum, item) => sum + item.packedTokens, 0);
  const result = {
    generatedAt: new Date().toISOString(),
    query: opts.q,
    intent: queryPack.intent,
    budgetTokens: budget,
    originalTokens,
    packedTokens,
    withinBudget: packedTokens <= budget,
    compressionRatio: originalTokens ? Math.round((packedTokens / originalTokens) * 100) / 100 : 1,
    tokenDelta: Math.max(0, originalTokens - packedTokens),
    buckets,
    recommendations: [
      "Keep live intent uncompressed.",
      "Use graph bucket hits before opening raw files.",
      "Compressed hits carry signature + first read; reload full detail with graph.node when needed.",
      "Offloaded hits are reversible pointers — reload with graph.node by id.",
      "Treat risk flags as prompts to inspect raw source before acting.",
    ],
  };
  ensureDir(OUT_DIR);
  fs.writeFileSync(path.join(OUT_DIR, "context-pack.json"), JSON.stringify(result, null, 2));
  return result;
}
function pack(args) {
  const result = packResult(args);
  console.log(JSON.stringify(result, null, 2));
  console.log(`Wrote ${path.relative(ROOT, path.join(OUT_DIR, "context-pack.json"))}`);
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
function statsResult() { const g = load(); return { ...g.stats, generatedAt: g.generatedAt, root: g.root, graphPath: path.relative(ROOT, GRAPH_PATH), graphApproxTokens: g._approxTokens ?? estimateTokens(JSON.stringify(g)), graphReadHint: "Do not read graph.json raw. Use graph.query / graph.pack / graph.node." }; }
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
function parseEvalArgs(args) {
  const opts = { k: 5, limit: 20, auto: 30, cases: null, minHitRate: 0.8, strict: false };
  for (const arg of args) {
    if (arg.startsWith("--k=")) opts.k = Math.max(1, Number(arg.slice(4)) || 5);
    else if (arg.startsWith("--limit=")) opts.limit = Math.max(1, Math.min(30, Number(arg.slice(8)) || 20));
    else if (arg.startsWith("--auto=")) opts.auto = Math.max(1, Math.min(200, Number(arg.slice(7)) || 30));
    else if (arg.startsWith("--cases=")) opts.cases = arg.slice(8);
    else if (arg.startsWith("--min-hit-rate=")) opts.minHitRate = Math.max(0, Math.min(1, Number(arg.slice(15)) || 0.8));
    else if (arg === "--strict") opts.strict = true;
  }
  return opts;
}
function round2(x) { return Math.round(x * 100) / 100; }
function median(nums) {
  const a = nums.filter(n => typeof n === "number").sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}
function autoEvalCases(g, max) {
  const labelCounts = new Map();
  for (const n of g.nodes) { const l = String(n.label || "").toLowerCase(); labelCounts.set(l, (labelCounts.get(l) || 0) + 1); }
  const uniqueLabel = n => labelCounts.get(String(n.label || "").toLowerCase()) === 1;
  const codeNodes = g.nodes
    .filter(n => ["symbol", "component"].includes(n.kind) && n.path && n.line && String(n.label || "").length >= 4 && !isGenericSymbol(n.label) && uniqueLabel(n))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const docNodes = g.nodes
    .filter(n => n.kind === "section" && n.path && String(n.label || "").length >= 5 && uniqueLabel(n))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cases = [];
  const codeTarget = Math.ceil(max * 0.75);
  const codeStride = Math.max(1, Math.floor(codeNodes.length / Math.max(1, codeTarget)));
  for (let i = 0; i < codeNodes.length && cases.length < codeTarget; i += codeStride) cases.push({ query: codeNodes[i].label, intent: "code", expect: { id: codeNodes[i].id }, source: "auto-code" });
  const docStride = Math.max(1, Math.floor(docNodes.length / Math.max(1, max - cases.length)));
  for (let i = 0; i < docNodes.length && cases.length < max; i += docStride) cases.push({ query: docNodes[i].label, intent: "docs", expect: { id: docNodes[i].id }, source: "auto-docs" });
  return cases;
}
function matchExpect(hit, expect = {}) {
  const n = hit.node || {};
  if (expect.id && n.id === expect.id) return true;
  if (expect.label && String(n.label || "").toLowerCase() === String(expect.label).toLowerCase()) return true;
  if (expect.path && n.path) { const ep = String(expect.path).toLowerCase(), np = String(n.path).toLowerCase(); if (np === ep || np.endsWith(ep)) return true; }
  return false;
}
function evalResult(args = []) {
  const opts = Array.isArray(args) ? parseEvalArgs(args) : { k: args?.k || 5, limit: args?.limit || 20, auto: args?.auto || 30, cases: args?.cases || null, minHitRate: args?.minHitRate ?? 0.8, strict: false };
  const g = load();
  let cases;
  let casesSource;
  if (opts.cases && fs.existsSync(opts.cases)) { cases = JSON.parse(fs.readFileSync(opts.cases, "utf8")); casesSource = opts.cases; }
  else { cases = autoEvalCases(g, opts.auto); casesSource = "auto-generated"; }
  if (!Array.isArray(cases) || !cases.length) throw new Error("No evaluation cases available. Provide --cases=<file> or build a richer graph.");
  const rows = [];
  for (const c of cases) {
    const res = queryResult({ query: c.query, intent: c.intent || "auto", limit: opts.limit });
    let rank = null;
    for (let i = 0; i < res.hits.length; i++) { if (matchExpect(res.hits[i], c.expect || {})) { rank = i + 1; break; } }
    let tokensToAnswer = null;
    if (rank) { let t = estimateTokens(c.query); for (let i = 0; i < rank; i++) t += estimateTokens(hitRaw(res.hits[i])); tokensToAnswer = t; }
    rows.push({ query: c.query, intent: res.intent, expect: c.expect || {}, rank, hitAt1: rank === 1, hitAtK: rank !== null && rank <= opts.k, tokensToAnswer, hitCount: res.hits.length, source: c.source || "file" });
  }
  const n = rows.length;
  const found = rows.filter(r => r.rank !== null);
  const hitK = rows.filter(r => r.hitAtK).length;
  const summary = {
    generatedAt: new Date().toISOString(),
    casesSource,
    cases: n,
    k: opts.k,
    hitRateAtK: round2(hitK / n),
    hitRateAt1: round2(rows.filter(r => r.hitAt1).length / n),
    mrr: round2(rows.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / n),
    misses: rows.filter(r => r.rank === null).length,
    medianTokensToAnswer: median(found.map(r => r.tokensToAnswer)),
    minHitRate: opts.minHitRate,
    pass: hitK / n >= opts.minHitRate,
  };
  ensureDir(OUT_DIR);
  fs.writeFileSync(EVAL_REPORT_JSON, JSON.stringify({ summary, rows }, null, 2));
  const worst = rows.filter(r => r.rank === null || r.rank > opts.k).slice(0, 15);
  const mdLines = [
    "# Graph-It evaluation report",
    "",
    `Generated: ${summary.generatedAt}`,
    `Cases: ${summary.cases} (${summary.casesSource})`,
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| hit@1 | ${summary.hitRateAt1} |`,
    `| hit@${summary.k} | ${summary.hitRateAtK} |`,
    `| MRR | ${summary.mrr} |`,
    `| Misses | ${summary.misses} |`,
    `| Median tokens-to-answer | ${summary.medianTokensToAnswer ?? "n/a"} |`,
    `| Pass (hit@${summary.k} >= ${summary.minHitRate}) | ${summary.pass ? "yes" : "no"} |`,
    "",
    "## Cases not answered within k",
    "",
    worst.length ? "| Query | Intent | Rank | Expected |\n|---|---|---:|---|" : "All cases answered within k.",
    ...worst.map(r => `| ${md(r.query)} | ${r.intent} | ${r.rank ?? "miss"} | ${md(r.expect.id || r.expect.label || r.expect.path || "")} |`),
    "",
  ];
  fs.writeFileSync(EVAL_REPORT_MD, mdLines.join("\n"));
  return { summary, rows };
}
function evaluate(args = []) {
  const opts = parseEvalArgs(args);
  const { summary } = evalResult(args);
  console.log(`Cases: ${summary.cases} (${summary.casesSource})`);
  console.log(`hit@1: ${summary.hitRateAt1}  hit@${summary.k}: ${summary.hitRateAtK}  MRR: ${summary.mrr}  misses: ${summary.misses}`);
  console.log(`Median tokens-to-answer: ${summary.medianTokensToAnswer ?? "n/a"}`);
  console.log(`Result: ${summary.pass ? "PASS" : "FAIL"} (threshold hit@${summary.k} >= ${summary.minHitRate})`);
  console.log(`Wrote ${path.relative(ROOT, EVAL_REPORT_JSON)} and ${path.relative(ROOT, EVAL_REPORT_MD)}`);
  if (opts.strict && !summary.pass) process.exitCode = 1;
}

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
  const repairPlan = buildRepairPlan({ orphanNodes, godNodes, weakEdges, duplicateLabels, g });
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
    repairPlan,
    nextIndexingActions: [
      "Run `node tools/semantic-kg.mjs obsidian` for durable vault-style notes.",
      "Run `node tools/semantic-kg.mjs viewer` after quality changes.",
      "Stage non-code docs with `node tools/semantic-kg.mjs ingest <path>` before extracting text.",
    ],
  };
}
function buildRepairPlan({ orphanNodes, godNodes, weakEdges, duplicateLabels, g }) {
  const weakByType = [...weakEdges.reduce((map, edge) => map.set(edge.type, (map.get(edge.type) || 0) + 1), new Map()).entries()]
    .sort((a, b) => b[1] - a[1]);
  const plan = [];
  if (weakEdges.length) {
    plan.push({
      priority: "P0",
      area: "weak-inferred-edges",
      issue: `${weakEdges.length} low-confidence inferred relationship(s) are reducing score.`,
      action: weakByType.length
        ? `Tighten or reclassify the top weak edge types: ${weakByType.slice(0, 5).map(([type, count]) => `${type} (${count})`).join(", ")}.`
        : "Review weak inferred relationships and either raise confidence with better evidence or demote noisy edges.",
      command: "node tools/semantic-kg.mjs quality",
    });
  }
  if (orphanNodes.length) {
    plan.push({
      priority: "P1",
      area: "orphan-nodes",
      issue: `${orphanNodes.length} node(s) have no relationships.`,
      action: "Add stronger section/file/topic extraction or exclude low-value generated/source artifacts that should not become nodes.",
      command: "node tools/semantic-kg.mjs query --intent=all \"orphan\"",
    });
  }
  if (godNodes.length) {
    plan.push({
      priority: "P1",
      area: "god-nodes",
      issue: `${godNodes.length} over-connected node(s) may dominate the graph.`,
      action: "Split broad topics, cap noisy semantic links, or add relationship-type filters for high-degree nodes.",
      command: "node tools/semantic-kg.mjs viewer",
    });
  }
  if (duplicateLabels.length) {
    plan.push({
      priority: "P2",
      area: "duplicate-labels",
      issue: `${duplicateLabels.length} duplicate label group(s) can make search/detail panels ambiguous.`,
      action: "Use path-aware labels for symbols/sections with repeated names.",
      command: "node tools/semantic-kg.mjs obsidian",
    });
  }
  if (!plan.length) {
    plan.push({
      priority: "P0",
      area: "healthy",
      issue: "No structural blocker found.",
      action: "Keep Graph-It fresh with watch or hook mode after meaningful changes.",
      command: "node tools/semantic-kg.mjs hook install",
    });
  }
  return plan;
}
function renderQualityMarkdown(q) {
  return `# Graph-It Quality\n\nGenerated: ${q.generatedAt}\n\nScore: **${q.score}/100** (${q.grade})\n\n## Metrics\n\n| Metric | Value |\n|---|---:|\n| Connectivity | ${q.metrics.connectivity} |\n| Source coverage | ${q.metrics.sourceCoverage} |\n| Orphan nodes | ${q.metrics.orphanCount} |\n| Weak inferred edges | ${q.metrics.weakEdgeCount} |\n| Duplicate label groups | ${q.metrics.duplicateLabelGroups} |\n| God-node candidates | ${q.metrics.godNodeCount} |\n| Max degree | ${q.metrics.maxDegree} |\n\n## Recommendations\n\n${q.recommendations.map(x => `- ${md(x)}`).join("\n")}\n\n## Repair plan\n\n${q.repairPlan.map(item => `- **${item.priority} ${item.area}**: ${md(item.issue)} ${md(item.action)} Command: \`${item.command}\``).join("\n")}\n\n## God-node candidates\n\n${q.godNodes.length ? q.godNodes.map(n => `- ${md(n.label || n.id)} (${n.kind}, degree ${n.degree})`).join("\n") : "- None"}\n\n## Orphan nodes\n\n${q.orphanNodes.length ? q.orphanNodes.slice(0, 25).map(n => `- ${md(n.label || n.id)} (${n.kind})`).join("\n") : "- None"}\n`;
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

function graphml(g) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
    '  <key id="kind" for="node" attr.name="kind" attr.type="string"/>',
    '  <key id="path" for="node" attr.name="path" attr.type="string"/>',
    '  <key id="type" for="edge" attr.name="type" attr.type="string"/>',
    '  <key id="evidence" for="edge" attr.name="evidence" attr.type="string"/>',
    '  <key id="confidence" for="edge" attr.name="confidence" attr.type="double"/>',
    '  <graph id="GraphIt" edgedefault="directed">',
  ];
  for (const n of g.nodes) {
    lines.push(`    <node id="${xml(n.id)}">`);
    lines.push(`      <data key="label">${xml(n.label || n.id)}</data>`);
    lines.push(`      <data key="kind">${xml(n.kind || "")}</data>`);
    if (n.path) lines.push(`      <data key="path">${xml(n.path)}</data>`);
    lines.push("    </node>");
  }
  g.edges.forEach((e, i) => {
    lines.push(`    <edge id="e${i}" source="${xml(e.from)}" target="${xml(e.to)}">`);
    lines.push(`      <data key="type">${xml(e.type || "")}</data>`);
    lines.push(`      <data key="evidence">${xml(e.evidence || "")}</data>`);
    if (e.confidence !== undefined) lines.push(`      <data key="confidence">${Number(e.confidence) || 0}</data>`);
    lines.push("    </edge>");
  });
  lines.push("  </graph>", "</graphml>");
  return lines.join("\n");
}
function cypher(g) {
  const nodeIds = new Map(g.nodes.map(n => [n.id, safeCypherId(n.id)]));
  const lines = [
    "// Graph-It local export. Review before importing into shared graph databases.",
    "CREATE CONSTRAINT graph_it_node_id IF NOT EXISTS FOR (n:GraphItNode) REQUIRE n.id IS UNIQUE;",
  ];
  for (const n of g.nodes) {
    lines.push(`MERGE (${nodeIds.get(n.id)}:GraphItNode {id: ${cypherString(n.id)}}) SET ${nodeIds.get(n.id)} += {label: ${cypherString(n.label || n.id)}, kind: ${cypherString(n.kind || "")}, path: ${cypherString(n.path || "")}};`);
  }
  for (const e of g.edges) {
    const from = nodeIds.get(e.from);
    const to = nodeIds.get(e.to);
    if (!from || !to) continue;
    let rel = String(e.type || "RELATED").replace(/[^A-Z0-9_]/gi, "_").toUpperCase() || "RELATED";
    if (!/^[A-Z_]/.test(rel)) rel = `REL_${rel}`;
    lines.push(`MATCH (a:GraphItNode {id: ${cypherString(e.from)}}), (b:GraphItNode {id: ${cypherString(e.to)}}) MERGE (a)-[:${rel} {evidence: ${cypherString(e.evidence || "")}, confidence: ${Number(e.confidence || 0)}}]->(b);`);
  }
  return lines.join("\n");
}
function svg(g) {
  const degrees = degreeMap(g);
  const top = g.nodes
    .map(n => ({ ...n, degree: degrees.get(n.id) || 0 }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 80);
  const ids = new Set(top.map(n => n.id));
  const width = 1400, height = 900, cx = width / 2, cy = height / 2;
  const radius = Math.min(width, height) * 0.38;
  const pos = new Map();
  top.forEach((n, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(1, top.length);
    const r = n.kind === "topic" ? radius * 0.55 : radius;
    pos.set(n.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  });
  const color = n => n.kind === "topic" ? "#fbbf24" : n.kind === "component" ? "#60a5fa" : n.kind === "symbol" ? "#34d399" : n.kind?.includes("doc") ? "#c084fc" : "#94a3b8";
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#020617"/>',
    '<style>text{font-family:Segoe UI,Arial,sans-serif;font-size:11px;fill:#e2e8f0}.muted{fill:#94a3b8}</style>',
    '<text x="32" y="36" style="font-size:22px;font-weight:700">Graph-It Export</text>',
    `<text x="32" y="58" class="muted">${xml(g.stats?.nodes || g.nodes.length)} nodes · ${xml(g.stats?.edges || g.edges.length)} edges · top ${top.length} by degree</text>`,
  ];
  for (const e of g.edges.filter(e => ids.has(e.from) && ids.has(e.to)).slice(0, 350)) {
    const a = pos.get(e.from), b = pos.get(e.to);
    lines.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${e.evidence === "INFERRED" ? "#475569" : "#64748b"}" stroke-width="${e.evidence === "INFERRED" ? "0.8" : "1.2"}" opacity="0.55"/>`);
  }
  for (const n of top) {
    const p = pos.get(n.id);
    const r = Math.max(5, Math.min(18, 5 + Math.sqrt(n.degree)));
    lines.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color(n)}" opacity="0.92"><title>${xml(n.label || n.id)} (${xml(n.kind)}) degree ${n.degree}</title></circle>`);
    if (n.degree >= 4 || n.kind === "topic") lines.push(`<text x="${(p.x + r + 4).toFixed(1)}" y="${(p.y + 4).toFixed(1)}">${xml(String(n.label || n.id).slice(0, 34))}</text>`);
  }
  lines.push("</svg>");
  return lines.join("\n");
}
function exportGraph(args = []) {
  const format = (args[0] || "all").toLowerCase();
  if (!["all", "graphml", "cypher", "svg"].includes(format)) throw new Error("Usage: node tools/semantic-kg.mjs export [all|graphml|cypher|svg]");
  const g = load();
  ensureDir(EXPORT_DIR);
  const written = [];
  const write = (name, body) => {
    const out = path.join(EXPORT_DIR, name);
    fs.writeFileSync(out, body);
    written.push(path.relative(ROOT, out));
  };
  if (format === "all" || format === "graphml") write("graph.graphml", graphml(g));
  if (format === "all" || format === "cypher") write("graph.cypher", cypher(g));
  if (format === "all" || format === "svg") write("graph.svg", svg(g));
  const manifest = {
    generatedAt: new Date().toISOString(),
    format,
    files: written,
    privacy: "Local export only. Review before sharing because graph artifacts can reveal project structure and symbol names.",
  };
  fs.writeFileSync(path.join(EXPORT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Graph-It exports written: ${written.join(", ")}`);
}

function rawKbForQueryResult(result, g) {
  const paths = new Set();
  for (const hit of result.hits) {
    if (hit.node.path) paths.add(hit.node.path);
    for (const read of hit.nextReads || []) paths.add(read.split(":")[0]);
  }
  let bytes = 0;
  for (const p of paths) {
    const abs = path.join(ROOT, p);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) bytes += fs.statSync(abs).size;
  }
  return Math.round(bytes / 102.4) / 10;
}
function proof(args = []) {
  const queries = args.length ? args : ["architecture", "security privacy", "MCP config", "bootstrap", "quality"];
  const g = load();
  const q = computeQuality(g);
  const queryProof = queries.map(queryText => {
    const started = Date.now();
    const result = queryResult({ query: queryText, intent: "auto", limit: 8 });
    const resultKB = Math.round(Buffer.byteLength(JSON.stringify(result), "utf8") / 102.4) / 10;
    const rawKB = rawKbForQueryResult(result, g);
    return {
      query: queryText,
      intent: result.intent,
      ms: Date.now() - started,
      hits: result.hits.length,
      resultKB,
      rawKB,
      sizeRatio: rawKB > 0 ? Number((rawKB / Math.max(0.1, resultKB)).toFixed(1)) : null,
      topHits: result.hits.slice(0, 5).map(h => ({ score: h.score, node: h.node, nextReads: h.nextReads })),
    };
  });
  const proofPack = {
    generatedAt: new Date().toISOString(),
    privacy: "Local proof artifact only. It summarizes graph quality and a local query context-size comparison without calling external services.",
    stats: g.stats,
    quality: { score: q.score, grade: q.grade, metrics: q.metrics, recommendations: q.recommendations },
    queries: queryProof,
    nextSteps: [
      "Use this proof pack to decide whether agents can rely on the graph before raw file reads.",
      "Publish only sanitized examples; proof artifacts can reveal local file paths and symbols.",
      "Run export all when graph visualization or Neo4j/GraphML import is needed.",
    ],
  };
  ensureDir(PROOF_DIR);
  fs.writeFileSync(path.join(PROOF_DIR, "proof.json"), JSON.stringify(proofPack, null, 2));
  fs.writeFileSync(path.join(PROOF_DIR, "proof.md"), renderProofMarkdown(proofPack));
  console.log(`Wrote ${path.relative(ROOT, path.join(PROOF_DIR, "proof.md"))}`);
}
function parseExamplesArgs(args) {
  const opts = { name: slug(path.basename(ROOT)) || "project", public: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--name") opts.name = slug(args[++i] || opts.name);
    else if (arg.startsWith("--name=")) opts.name = slug(arg.slice("--name=".length));
    else if (arg === "--public") opts.public = true;
    else throw new Error(`Unknown examples option: ${arg}`);
  }
  return opts;
}
function redactPathForExample(p, opts) {
  if (!opts.public) return p;
  return String(p || "").split(/[\\/]/).map((part, i, arr) => i === arr.length - 1 ? part : `dir${i + 1}`).join("/");
}
function examples(args = []) {
  const opts = parseExamplesArgs(args);
  const g = load();
  const q = computeQuality(g);
  const outDir = path.join(EXAMPLES_DIR, opts.name);
  ensureDir(outDir);
  const sampleNodes = g.nodes
    .filter(n => ["topic", "component", "symbol", "doc_file", "code_file"].includes(n.kind))
    .slice(0, 40)
    .map(n => ({ kind: n.kind, label: n.label, path: redactPathForExample(n.path, opts), summary: opts.public ? String(n.summary || "").replace(/[A-Z]:\\[^ ]+/g, "[local-path]") : n.summary }));
  const sampleEdges = g.edges.slice(0, 80).map(e => ({ type: e.type, evidence: e.evidence, confidence: e.confidence }));
  const example = {
    generatedAt: new Date().toISOString(),
    mode: opts.public ? "public-sanitized" : "local",
    stats: g.stats,
    quality: { score: q.score, grade: q.grade },
    sampleNodes,
    sampleEdges,
    artifacts: {
      graph: "graph-sample.json",
      report: "review.md",
    },
  };
  fs.writeFileSync(path.join(outDir, "graph-sample.json"), JSON.stringify(example, null, 2));
  fs.writeFileSync(path.join(outDir, "review.md"), `# Graph-It Worked Example: ${opts.name}\n\nMode: ${example.mode}\n\n## Summary\n\n| Metric | Value |\n|---|---:|\n| Nodes | ${g.stats.nodes} |\n| Edges | ${g.stats.edges} |\n| Files | ${g.stats.files} |\n| Quality | ${q.score}/100 (${q.grade}) |\n\n## What to inspect\n\n- Run \`node tools/semantic-kg.mjs proof \"architecture\" \"security privacy\"\` for query evidence.\n- Open \`.semantic-kg/graph.html\` locally for navigation.\n- Review \`.semantic-kg/quality.md\` before relying on inferred links.\n\n## Caveat\n\n${opts.public ? "This example is sanitized for public sharing and intentionally omits raw graph details that may expose private project structure." : "This local example may include project structure and should be reviewed before sharing."}\n`);
  console.log(`Wrote worked example to ${path.relative(ROOT, outDir)}`);
}
function agentRuleText(platform) {
  const base = `# Graph-It Agent Rules\n\nUse Graph-It before broad raw-file reads. Prefer scoped graph queries for architecture, ownership, impact, and code-navigation questions.\n\nCommands:\n- Build: \`node tools/semantic-kg.mjs build\`\n- Query: \`node tools/semantic-kg.mjs query --intent=code \"SymbolName\"\`\n- Docs query: \`node tools/semantic-kg.mjs query --intent=docs \"release architecture\"\`\n- Delta: \`node tools/semantic-kg.mjs delta\`\n- Quality: \`node tools/semantic-kg.mjs quality\`\n- Proof: \`node tools/semantic-kg.mjs proof \"architecture\" \"security privacy\"\`\n\nToken discipline:\n- Never read \`.semantic-kg/graph.json\` whole. It is large (see its \`_approxTokens\` field / \`graph.stats.graphApproxTokens\`) and reading it raw amplifies token cost.\n- Reach the graph only through \`query\`, \`pack\`, \`node\`, \`neighborhood\`, or \`path\`, then open just the suggested next-read line ranges.\n\nOutput discipline:\n- Do not restate unchanged code or file contents back to the user; reference path and line range instead.\n- Skip filler and preamble; reserve extended reasoning for genuinely hard steps. Output tokens are the more expensive side of most model bills.\n\nPrivacy:\n- Treat \`.semantic-kg/\` as local operational data.\n- Do not share graph artifacts externally without review.\n- Prefer EXTRACTED edges; treat INFERRED and AMBIGUOUS edges as guidance.\n`;
  if (platform === "cursor") return `---\nalwaysApply: true\n---\n\n${base}`;
  if (platform === "claude") return `${base}\nWhen the user asks about this repo, query Graph-It first unless the graph is missing or stale.\n`;
  if (platform === "codex") return `${base}\nFor coding tasks, start with Graph-It query/quality/delta before large recursive searches.\n`;
  if (platform === "copilot") return `${base}\nFor GitHub Copilot CLI sessions, use Graph-It as the first local context source before opening many files.\n`;
  return base;
}
function agentRules(args = []) {
  const target = (args[0] || "all").toLowerCase();
  const platforms = target === "all" ? ["generic", "copilot", "claude", "cursor", "codex"] : [target];
  const valid = new Set(["generic", "copilot", "claude", "cursor", "codex"]);
  for (const p of platforms) if (!valid.has(p)) throw new Error("Usage: node tools/semantic-kg.mjs agent-rules [all|generic|copilot|claude|cursor|codex]");
  ensureDir(AGENT_RULES_DIR);
  const files = [];
  for (const p of platforms) {
    const name = p === "cursor" ? "cursor-graph-it.mdc" : `${p}-graph-it.md`;
    const out = path.join(AGENT_RULES_DIR, name);
    fs.writeFileSync(out, agentRuleText(p));
    files.push(path.relative(ROOT, out));
  }
  const manifest = { generatedAt: new Date().toISOString(), files, nextSteps: ["Copy or symlink the relevant rule into your agent's supported instruction location.", "Keep generated rule files local unless your team approves committing agent instructions."] };
  fs.writeFileSync(path.join(AGENT_RULES_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Wrote agent rule pack: ${files.join(", ")}`);
}
function renderProofMarkdown(p) {
  return `# Graph-It Proof Pack\n\nGenerated: ${p.generatedAt}\n\nPrivacy: ${p.privacy}\n\n## Graph Health\n\n| Metric | Value |\n|---|---:|\n| Nodes | ${p.stats.nodes} |\n| Edges | ${p.stats.edges} |\n| Files | ${p.stats.files} |\n| Inferred edges | ${p.stats.inferredEdges} |\n| Quality score | ${p.quality.score}/100 (${p.quality.grade}) |\n\n## Query context size\n\n| Query | Intent | Hits | Graph KB | Raw KB | Raw/Graph |\n|---|---|---:|---:|---:|---:|\n${p.queries.map(q => `| ${md(q.query)} | ${q.intent} | ${q.hits} | ${q.resultKB} | ${q.rawKB} | ${q.sizeRatio ?? "n/a"} |`).join("\n")}\n\n## Top Hits\n\n${p.queries.map(q => `### ${md(q.query)}\n\n${q.topHits.length ? q.topHits.map(h => `- **${md(h.node.label || h.node.id)}** (${h.node.kind}${h.node.path ? `, \`${h.node.path}\`` : ""}) score ${h.score}`).join("\n") : "- No hits"}`).join("\n\n")}\n\n## Recommendations\n\n${p.quality.recommendations.map(r => `- ${md(r)}`).join("\n")}\n`;
}

function yamlValue(v) { return String(v ?? "").replace(/"/g, '\\"'); }
function sourceExcerpt(n, maxChars = 1800) {
  if (!n.path) return "";
  const abs = path.join(ROOT, n.path);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return "";
  const ext = path.extname(abs).toLowerCase();
  if (!TEXT_EXTS.has(ext) && ![".yaml", ".yml", ".csv"].includes(ext)) return "";
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const start = Math.max(1, Number(n.line || 1) - 4);
  const end = Math.min(lines.length, start + 22);
  const excerpt = lines.slice(start - 1, end).map((line, i) => `${start + i}: ${line}`).join("\n");
  return excerpt.length > maxChars ? `${excerpt.slice(0, maxChars)}\n...` : excerpt;
}
function nodeRole(n) {
  const label = n.label || n.id;
  if (n.kind === "topic") return `This is a semantic topic that groups related files, sections, symbols, and concepts around **${label}**.`;
  if (n.kind === "component") return `This looks like a component or high-level code construct. Use it as an anchor for UI, workflow, or orchestration exploration.`;
  if (n.kind === "symbol") return `This is a code symbol extracted from source. Use it to jump from graph-level context into implementation detail.`;
  if (n.kind === "export") return `This export note captures a public surface from a module. It is useful for understanding API boundaries and reuse.`;
  if (n.kind === "dependency") return `This dependency note captures an import/require relationship. It helps explain coupling and external module boundaries.`;
  if (String(n.kind || "").includes("doc") || DOC_EXTS.has(n.ext)) return `This is a documentation node. Use it to understand intent, architecture, and narrative context.`;
  if (String(n.kind || "").includes("file")) return `This file note is a source-level anchor in the repo graph. Use relationships and excerpts to decide whether to open the raw file.`;
  return `This note represents a graph node extracted from the project.`;
}
function evidenceRollup(items) {
  const counts = {};
  for (const item of items) {
    const evidence = item.edge?.evidence || "UNSPECIFIED";
    counts[evidence] = (counts[evidence] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(", ") || "No relationships";
}
function relationshipNarrative(outbound, inbound) {
  const total = outbound.length + inbound.length;
  if (!total) return "This node is currently isolated in the graph. Treat it as a candidate for more extraction or better topic mapping.";
  const extracted = [...outbound, ...inbound].filter(x => x.edge?.evidence === "EXTRACTED").length;
  const inferred = [...outbound, ...inbound].filter(x => x.edge?.evidence === "INFERRED").length;
  const dominant = outbound.length >= inbound.length ? "outbound" : "inbound";
  return `This node has **${total}** known relationship(s): **${outbound.length} outbound** and **${inbound.length} inbound**. Evidence mix: **${extracted} extracted**, **${inferred} inferred**. The ${dominant} side is stronger, so start there when navigating.`;
}
function suggestedQuestions(n, outbound, inbound) {
  const label = n.label || n.id;
  const qs = [
    `Where is ${label} defined and what reads or references it?`,
    `Which nearby nodes have EXTRACTED relationships to ${label}?`,
    `What would change if ${label} moved or was renamed?`,
  ];
  if (outbound.some(x => x.edge?.type?.includes("IMPORT"))) qs.push(`Which dependencies shape ${label}?`);
  if (inbound.length) qs.push(`Which files or symbols depend on ${label}?`);
  if (n.semanticTags?.length) qs.push(`How does ${label} relate to ${n.semanticTags.slice(0, 3).join(", ")}?`);
  return qs.slice(0, 5);
}
function mermaidNeighborhood(n, outbound, inbound) {
  const edges = [...outbound.slice(0, 6).map(x => [n, x.node, x.edge]), ...inbound.slice(0, 6).map(x => [x.node, n, x.edge])];
  if (!edges.length) return "";
  const ids = new Map();
  const nodeId = node => {
    if (!ids.has(node.id)) ids.set(node.id, `N${ids.size + 1}`);
    return ids.get(node.id);
  };
  const lines = ["```mermaid", "flowchart LR"];
  for (const [from, to, edge] of edges) {
    lines.push(`  ${nodeId(from)}["${String(from.label || from.id).replace(/"/g, "'").slice(0, 40)}"] -->|${String(edge.type || "RELATED").replace(/"/g, "'").slice(0, 24)}| ${nodeId(to)}["${String(to.label || to.id).replace(/"/g, "'").slice(0, 40)}"]`);
  }
  lines.push("```");
  return lines.join("\n");
}
function obsidianFolder(n) {
  if (n.kind === "topic") return "concepts";
  if (n.kind === "doc" || DOC_EXTS.has(n.ext)) return "docs";
  if (n.kind === "image" || n.kind === "pdf" || n.kind === "video" || n.kind === "archive") return "artifacts";
  if (n.kind === "symbol" || n.kind === "component" || n.kind === "export" || n.kind === "dependency") return "symbols";
  return "files";
}
function obsidianNoteBase(n) { return `${slug(`${n.kind}-${n.label || n.id}`)}-${sha(Buffer.from(String(n.id))).slice(0, 8)}`; }
function obsidianFileName(n) { return `${obsidianNoteBase(n)}.md`; }
function obsidianWikiPath(n) { return `${obsidianFolder(n)}/${obsidianNoteBase(n)}`; }
function obsidianLink(n) { return `[[${obsidianWikiPath(n)}|${n.label || n.id}]]`; }
function obsidianTag(t) { return `graph-it/${slug(t)}`; }
function obsidianNodeMarkdown(n, related, backlinks) {
  const tags = [...new Set([n.kind, ...(n.semanticTags || []).map(slug)].filter(Boolean))];
  const outbound = related.filter(x => x.node);
  const inbound = backlinks.filter(x => x.node);
  const excerpt = sourceExcerpt(n);
  const diagram = mermaidNeighborhood(n, outbound, inbound);
  const questions = suggestedQuestions(n, outbound, inbound);
  return `---\ngraph_it_id: "${yamlValue(n.id)}"\ntype: "${yamlValue(n.kind)}"\nsource: "${yamlValue(n.path || "")}"\nline: ${Number(n.line || 0)}\ntags: [${tags.map(t => `"${yamlValue(obsidianTag(t))}"`).join(", ")}]\nevidence: "EXTRACTED"\nrelationship_count: ${outbound.length + inbound.length}\n---\n\n# ${n.label || n.id}\n\n> [!summary] Why this note exists\n> ${nodeRole(n)}\n\n## Intelligence summary\n\n${n.summary || "No summary available."}\n\n${n.path ? `**Source:** \`${n.path}${n.line ? `:${n.line}` : ""}\`\n\n` : ""}**Relationship confidence:** ${relationshipNarrative(outbound, inbound)}\n\n**Evidence rollup:** ${evidenceRollup([...outbound, ...inbound])}\n\n${n.semanticTags?.length ? `**Semantic tags:** ${n.semanticTags.map(t => `#${obsidianTag(t)}`).join(" ")}\n\n` : ""}## Source excerpt\n\n${excerpt ? `\`\`\`text\n${excerpt}\n\`\`\`` : "_No local text excerpt available for this node._"}\n\n## Neighborhood map\n\n${diagram || "_No neighborhood diagram available._"}\n\n## Outbound links\n\n${outbound.length ? outbound.slice(0, 30).map(({ edge, node }) => `- ${obsidianLink(node)} — **${edge.type}** (${edge.evidence || "UNSPECIFIED"}${edge.confidence ? `, ${edge.confidence}` : ""})${edge.why ? ` — ${md(edge.why)}` : ""}`).join("\n") : "- None"}\n\n## Backlinks\n\n${inbound.length ? inbound.slice(0, 30).map(({ edge, node }) => `- ${obsidianLink(node)} — **${edge.type}** (${edge.evidence || "UNSPECIFIED"})`).join("\n") : "- None"}\n\n## Agent prompts\n\n${questions.map(q => `- ${q}`).join("\n")}\n\n## Graph-It commands\n\n- \`node tools/semantic-kg.mjs query "${String(n.label || n.id).replace(/"/g, '\\"')}"\`\n- \`node tools/semantic-kg.mjs impact "${String(n.label || n.id).replace(/"/g, '\\"')}"\`\n`;
}
function obsidianMocMarkdown(title, nodes, intro = "") {
  const byKind = [...groupBy(nodes, n => n.kind).entries()].sort((a, b) => b[1].length - a[1].length);
  const top = nodes.slice(0, 12);
  return `---\ntype: "moc"\ntags: ["graph-it/moc"]\nnode_count: ${nodes.length}\n---\n\n# ${title}\n\n${intro ? `${intro}\n\n` : ""}## Orientation\n\nThis MOC groups **${nodes.length}** Graph-It note(s). Use it as a curated doorway into this slice of the repo graph before opening raw files.\n\n${byKind.length ? `**Kind mix:** ${byKind.map(([kind, items]) => `${kind}: ${items.length}`).join(", ")}\n\n` : ""}## Best starting points\n\n${top.length ? top.map(n => `- ${obsidianLink(n)}${n.summary ? ` — ${md(n.summary).slice(0, 140)}` : ""}`).join("\n") : "- No notes in this section."}\n\n## All notes\n\n${nodes.length ? nodes.map(n => `- ${obsidianLink(n)}${n.path ? ` — \`${n.path}${n.line ? `:${n.line}` : ""}\`` : ""}`).join("\n") : "- No notes in this section."}\n\n## Suggested exploration\n\n- Start with the highest-level docs/components above.\n- Follow EXTRACTED backlinks before inferred topic links.\n- Use \`node tools/semantic-kg.mjs query --intent=docs "<topic>"\` when this MOC is too broad.\n`;
}
function obsidianStarterConfig(vault) {
  const obsidianDir = path.join(vault, ".obsidian");
  ensureDir(obsidianDir);
  fs.writeFileSync(path.join(obsidianDir, "app.json"), JSON.stringify({ alwaysUpdateLinks: true, newFileLocation: "folder", newFileFolderPath: "inbox", readableLineLength: true }, null, 2));
  fs.writeFileSync(path.join(obsidianDir, "graph.json"), JSON.stringify({ search: "tag:#graph-it", showTags: true, showAttachments: false, hideUnresolved: false }, null, 2));
}
function obsidian() {
  const g = load();
  const graphAdj = adj(g);
  const nodes = new Map(g.nodes.map(n => [n.id, n]));
  const vault = path.join(WIKI_DIR, "obsidian");
  fs.rmSync(vault, { recursive: true, force: true });
  ensureDir(vault);
  ensureDir(path.join(vault, "MOCs"));
  obsidianStarterConfig(vault);
  const incoming = new Map(g.nodes.map(n => [n.id, []]));
  for (const e of g.edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (from && to) incoming.get(e.to)?.push({ edge: e, node: from });
  }
  for (const n of g.nodes) {
    const folder = path.join(vault, obsidianFolder(n));
    ensureDir(folder);
    const related = (graphAdj.get(n.id) || []).map(nb => ({
      edge: g.edges.find(e => (e.from === n.id && e.to === nb.node.id) || (e.to === n.id && e.from === nb.node.id)) || { type: nb.type },
      node: nodes.get(nb.node.id),
    })).filter(x => x.node);
    fs.writeFileSync(path.join(folder, obsidianFileName(n)), obsidianNodeMarkdown(n, related, incoming.get(n.id) || []));
  }
  const q = computeQuality(g);
  const degrees = degreeMap(g);
  const topNodes = [...degrees.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([id]) => nodes.get(id)).filter(Boolean);
  const byFolder = groupBy(g.nodes, n => obsidianFolder(n));
  for (const [folder, members] of byFolder.entries()) {
    fs.writeFileSync(path.join(vault, "MOCs", `${slug(folder)}.md`), obsidianMocMarkdown(`${folder} MOC`, members.slice(0, 200), `Map of Content for Graph-It ${folder} notes.`));
  }
  for (const topic of g.nodes.filter(n => n.kind === "topic")) {
    const members = g.edges.filter(e => e.to === topic.id || e.from === topic.id).map(e => nodes.get(e.from === topic.id ? e.to : e.from)).filter(Boolean);
    fs.writeFileSync(path.join(vault, "MOCs", `${slug(topic.label)}.md`), obsidianMocMarkdown(`${topic.label} MOC`, [...new Set(members)].slice(0, 120), `Topic-centered view from Graph-It.`));
  }
  fs.writeFileSync(path.join(vault, "Backlinks Index.md"), `---\ntype: "index"\ntags: ["graph-it/index", "graph-it/backlinks"]\n---\n\n# Backlinks Index\n\nUse this page to find what depends on what. Prefer EXTRACTED backlinks for implementation work; treat INFERRED links as discovery hints.\n\n${g.nodes.map(n => `## ${obsidianLink(n)}\n\n${(incoming.get(n.id) || []).length ? (incoming.get(n.id) || []).slice(0, 20).map(({ edge, node }) => `- ${obsidianLink(node)} — **${edge.type}** (${edge.evidence || "UNSPECIFIED"})`).join("\n") : "- No backlinks"}\n`).join("\n")}`);
  fs.writeFileSync(path.join(vault, "Agent Start Here.md"), `---\ntype: "agent-entry"\ntags: ["graph-it/agent", "graph-it/start"]\n---\n\n# Agent Start Here\n\n> [!important] Use this vault as compact repo memory before opening raw files.\n\n## Navigation contract\n\n1. Read [[Graph-It Index]] for graph health and top connected notes.\n2. Check [[Graph Quality]] before trusting inferred relationships.\n3. Use [[MOCs/index|MOCs]] to choose the right slice of the repo.\n4. Follow EXTRACTED backlinks first.\n5. Open raw source only after the graph identifies likely files or symbols.\n\n## Fast paths\n\n| Task | Start here |\n|---|---|\n| Understand architecture | [[MOCs/architecture|Architecture MOC]] then docs/components notes |\n| Find code surface | [[MOCs/symbols|Symbols MOC]] and query with \`--intent=code\` |\n| Audit docs alignment | [[Graph Quality]] and drift reports |\n| Explore dependencies | [[Backlinks Index]] and dependency notes |\n\n## Useful local commands\n\n- \`node tools/semantic-kg.mjs query --intent=code "SymbolName"\`\n- \`node tools/semantic-kg.mjs query --intent=docs "architecture"\`\n- \`node tools/semantic-kg.mjs delta\`\n- \`node tools/semantic-kg.mjs quality\`\n- \`node tools/semantic-kg.mjs proof "architecture" "security privacy"\`\n`);
  fs.writeFileSync(path.join(vault, "MOCs", "index.md"), `---\ntype: "moc-index"\ntags: ["graph-it/moc", "graph-it/index"]\n---\n\n# MOCs\n\n${fs.readdirSync(path.join(vault, "MOCs")).filter(f => f.endsWith(".md") && f !== "index.md").sort().map(f => `- [[MOCs/${f.replace(/\.md$/, "")}|${f.replace(/\.md$/, "")}]]`).join("\n")}\n`);
  fs.writeFileSync(path.join(vault, "Graph-It Index.md"), `---\ntype: "index"\ntags: ["graph-it/index"]\nquality_score: ${q.score}\nquality_grade: "${q.grade}"\n---\n\n# Graph-It Index\n\n> [!summary] Vault health\n> Quality score: **${q.score}/100** (${q.grade}). This vault has **${g.stats.nodes} nodes**, **${g.stats.edges} edges**, and **${g.stats.files} indexed files**.\n\n## Start\n\n- [[Agent Start Here]] — recommended first note for agents and humans.\n- [[Graph Quality]] — trust, coverage, noise, and repair actions.\n- [[Backlinks Index]] — dependency and relationship navigation.\n- [[MOCs/index|MOCs]] — maps of content by type and topic.\n\n## Note folders\n\n- [[MOCs/concepts|Concepts]]\n- [[MOCs/docs|Docs]]\n- [[MOCs/files|Files]]\n- [[MOCs/symbols|Symbols]]\n- [[MOCs/artifacts|Artifacts]]\n\n## Top connected notes\n\n${topNodes.map(n => `- ${obsidianLink(n)} — degree ${degrees.get(n.id) || 0}${n.summary ? ` — ${md(n.summary).slice(0, 120)}` : ""}`).join("\n")}\n\n## Suggested graph questions\n\n- What are the highest-confidence architecture entry points?\n- Which docs or symbols are isolated and need better linking?\n- Which nodes changed most since the previous build?\n- Which code symbols have the strongest relationship neighborhoods?\n`);
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

function parseEnrichArgs(args) {
  const opts = { provider: "local", extractText: false, limit: 50 };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--provider") opts.provider = args[++i] || "local";
    else if (arg.startsWith("--provider=")) opts.provider = arg.slice("--provider=".length);
    else if (arg === "--extract-text") opts.extractText = true;
    else if (arg.startsWith("--limit=")) opts.limit = Math.max(1, Math.min(500, Number(arg.slice("--limit=".length)) || 50));
    else if (arg) throw new Error(`Unknown enrich option: ${arg}`);
  }
  return opts;
}
function unzipTextEntries(buf, entryFilter) {
  const out = [];
  let offset = 0;
  while (offset + 30 < buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const fileNameLength = buf.readUInt16LE(offset + 26);
    const extraLength = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = buf.slice(nameStart, nameStart + fileNameLength).toString("utf8");
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buf.length) break;
    if (entryFilter(name)) {
      const data = buf.slice(dataStart, dataEnd);
      try {
        const text = method === 0 ? data.toString("utf8") : method === 8 ? zlib.inflateRawSync(data).toString("utf8") : "";
        if (text) out.push({ name, text });
      } catch {
        out.push({ name, text: "" });
      }
    }
    offset = dataEnd;
  }
  return out;
}
function xmlText(xmlContent) {
  return String(xmlContent || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function officeText(buf, ext) {
  const entries = unzipTextEntries(buf, name => {
    if (ext === ".docx") return /^word\/document\.xml$|^word\/footnotes\.xml$|^word\/endnotes\.xml$/.test(name);
    if (ext === ".pptx") return /^ppt\/slides\/slide\d+\.xml$|^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name);
    if (ext === ".xlsx") return /^xl\/sharedStrings\.xml$|^xl\/worksheets\/sheet\d+\.xml$/.test(name);
    return false;
  });
  return entries.map(e => xmlText(e.text)).filter(Boolean).join("\n\n").slice(0, 20000);
}
function printablePdfText(buf) {
  const raw = buf.toString("latin1");
  const chunks = [];
  for (const match of raw.matchAll(/\(([^()\r\n]{4,200})\)\s*T[jJ]/g)) {
    chunks.push(match[1].replace(/\\([()\\])/g, "$1"));
    if (chunks.join(" ").length > 8000) break;
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}
function localExtractForNode(n) {
  if (!n.path) return { status: "skipped", reason: "node has no path" };
  const abs = path.join(ROOT, n.path);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { status: "missing", path: n.path };
  const ext = path.extname(abs).toLowerCase();
  if (TEXT_EXTS.has(ext) || [".csv", ".yaml", ".yml"].includes(ext)) {
    const text = fs.readFileSync(abs, "utf8").slice(0, 16000);
    return { status: "extracted", path: n.path, method: "local-text", text };
  }
  if (ext === ".pdf") {
    const text = printablePdfText(fs.readFileSync(abs));
    return text
      ? { status: "extracted", path: n.path, method: "local-pdf-basic", text }
      : { status: "planned", path: n.path, method: "pdf", reason: "No simple embedded text found. Use an approved local PDF extractor for richer text." };
  }
  if (IMAGE_EXTS.has(ext)) return { status: "planned", path: n.path, method: "ocr", reason: "OCR is intentionally not bundled. Use an approved local OCR adapter before model enrichment." };
  if ([".docx", ".pptx", ".xlsx"].includes(ext)) {
    const text = officeText(fs.readFileSync(abs), ext);
    return text
      ? { status: "extracted", path: n.path, method: `local-${ext.slice(1)}-zip-text`, text }
      : { status: "planned", path: n.path, method: "office", reason: "No extractable Office XML text found. Use an approved richer local Office adapter if needed." };
  }
  return { status: "skipped", path: n.path, reason: `No local extractor for ${ext || "extensionless file"}.` };
}
function writeLocalExtractionBundle(g, limit) {
  const outDir = path.join(ENRICH_DIR, "local-extract");
  fs.rmSync(outDir, { recursive: true, force: true });
  ensureDir(outDir);
  const candidates = g.nodes.filter(n => n.kind !== "topic" && n.path).slice(0, limit);
  const manifest = [];
  for (const n of candidates) {
    const item = localExtractForNode(n);
    const fileSlug = slug(`${n.kind}-${n.path || n.id}`) || sha(Buffer.from(n.id)).slice(0, 12);
    if (item.text) {
      const out = path.join(outDir, `${fileSlug}.md`);
      fs.writeFileSync(out, `---\nsource: "${yamlValue(item.path)}"\nmethod: "${yamlValue(item.method)}"\nevidence: "EXTRACTED"\n---\n\n# ${n.label || n.id}\n\n${item.text}\n`);
      item.output = path.relative(ROOT, out);
      delete item.text;
    }
    manifest.push({ node: compactNode(n), ...item });
  }
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), items: manifest }, null, 2));
  return { outputDir: path.relative(ROOT, outDir), manifest: path.relative(ROOT, manifestPath), counts: manifest.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {}) };
}
function enrich(args) {
  const g = load();
  const opts = parseEnrichArgs(args);
  if (opts.provider !== "local") throw new Error("Only --provider local is supported by the bundled enterprise-safe runtime. External enrichment must be implemented as an explicit approved adapter.");
  const localExtraction = opts.extractText ? writeLocalExtractionBundle(g, opts.limit) : { skipped: true, runWith: "node tools/semantic-kg.mjs enrich --provider local --extract-text" };
  const plan = {
    generatedAt: new Date().toISOString(),
    provider: opts.provider,
    status: "plan-only",
    privacy: "No content was sent to any model by this command.",
    localExtraction,
    candidateNodes: g.nodes.filter(n => n.kind !== "topic").slice(0, 50).map(n => compactNode(n)),
    nextSteps: [
      "Use --extract-text to create local sidecars for text-like files and basic PDF text when available.",
      "Use an approved local OCR/PDF/Office adapter for richer binary extraction.",
      "Generate proposed summaries and relationships into enrichment.proposed.json only after review.",
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
       if (nodes.length > 250) return ringLayout(nodes, width, height);
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
     function ringLayout(nodes, width, height) {
       const cx = width / 2;
       const cy = height / 2;
       const maxR = Math.max(80, Math.min(width, height) * 0.43);
       const minR = Math.max(48, Math.min(width, height) * 0.12);
       const ranked = rankedNodes(nodes);
       const topicList = unique(ranked.map(nodeTopic));
       const topicIndex = new Map(topicList.map((t, i) => [t, i]));
       const buckets = new Map(topicList.map(t => [t, []]));
       for (const n of ranked) buckets.get(nodeTopic(n)).push(n);
       const positions = new Map();
       for (const [topic, bucket] of buckets.entries()) {
         const base = topicIndex.get(topic) || 0;
         const topicStart = (Math.PI * 2 * base) / Math.max(1, topicList.length);
         const topicEnd = (Math.PI * 2 * (base + 1)) / Math.max(1, topicList.length);
         const span = Math.max(0.18, topicEnd - topicStart);
         bucket.forEach((n, i) => {
           const t = bucket.length <= 1 ? 0.5 : i / (bucket.length - 1);
           const ring = i % 5;
           const angle = topicStart + span * (0.12 + 0.76 * t);
           const degreeBoost = Math.min(1, Math.log2((degrees.get(n.id) || 1) + 1) / 8);
           const radius = minR + (maxR - minR) * (0.15 + 0.7 * ((ring + 1) / 5)) - degreeBoost * 38;
           const jitter = ((hash(n.id) % 100) - 50) / 100 * 18;
           positions.set(n.id, {
             x: Math.max(34, Math.min(width - 34, cx + Math.cos(angle) * (radius + jitter))),
             y: Math.max(34, Math.min(height - 34, cy + Math.sin(angle) * (radius + jitter))),
           });
         });
       }
       return positions;
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
function trackedFileRecords() {
  return walk(ROOT)
    .filter(abs => {
      const ext = path.extname(abs).toLowerCase();
      return TEXT_EXTS.has(ext) || IMAGE_EXTS.has(ext) || PDF_EXTS.has(ext) || VIDEO_EXTS.has(ext) || ARCHIVE_EXTS.has(ext);
    })
    .sort((a, b) => a.localeCompare(b))
    .map(abs => {
    const st = fs.statSync(abs);
    return { path: rel(abs), size: st.size, mtimeMs: Math.trunc(st.mtimeMs), ext: path.extname(abs).toLowerCase() || "none" };
  });
}
function trackedFilesSnapshot() {
  return trackedFileRecords().map(r => `${r.path}:${r.size}:${r.mtimeMs}`).join("\n");
}
function snapshotMap(records = trackedFileRecords()) {
  return new Map(records.map(r => [r.path, r]));
}
function diffSnapshots(prev, next) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const [p, n] of next.entries()) {
    const old = prev.get(p);
    if (!old) added.push(p);
    else if (old.size !== n.size || old.mtimeMs !== n.mtimeMs) changed.push(p);
  }
  for (const p of prev.keys()) if (!next.has(p)) removed.push(p);
  const removedBySize = new Map();
  for (const p of removed) {
    const r = prev.get(p);
    const key = `${r.size}:${r.ext}`;
    if (!removedBySize.has(key)) removedBySize.set(key, []);
    removedBySize.get(key).push(p);
  }
  const possibleRenames = [];
  for (const p of added) {
    const r = next.get(p);
    const key = `${r.size}:${r.ext}`;
    const candidates = removedBySize.get(key) || [];
    if (candidates.length) possibleRenames.push({ from: candidates.shift(), to: p });
  }
  return { added, changed, removed, possibleRenames, totalChanged: added.length + changed.length + removed.length };
}
function writeFreshness({ status, reason, diff, refresh = {}, records = trackedFileRecords() }) {
  ensureDir(OUT_DIR);
  const payload = {
    generatedAt: new Date().toISOString(),
    status,
    reason,
    graphExists: fs.existsSync(GRAPH_PATH),
    graphPath: path.relative(ROOT, GRAPH_PATH),
    trackedFiles: records.length,
    records,
    diff: diff || { added: [], changed: [], removed: [], possibleRenames: [], totalChanged: 0 },
    refresh,
  };
  fs.writeFileSync(FRESHNESS_JSON, JSON.stringify(payload, null, 2));
  return payload;
}
function freshnessResult() {
  const records = trackedFileRecords();
  const current = snapshotMap(records);
  const last = fs.existsSync(FRESHNESS_JSON) ? JSON.parse(fs.readFileSync(FRESHNESS_JSON, "utf8")) : null;
  const graphExists = fs.existsSync(GRAPH_PATH);
  if (!last) return { status: graphExists ? "unknown" : "missing", graphExists, message: graphExists ? "No freshness record found. Run kg:auto --once or kg:build." : "Graph artifact is missing. Run kg:build.", trackedFiles: records.length };
  const previousRecords = new Map((last.records || []).map(r => [r.path, r]));
  const diff = previousRecords.size ? diffSnapshots(previousRecords, current) : { added: [], changed: [], removed: [], possibleRenames: [], totalChanged: 0 };
  return {
    status: diff.totalChanged ? "stale" : last.status || "fresh",
    graphExists,
    freshnessPath: path.relative(ROOT, FRESHNESS_JSON),
    lastGeneratedAt: last.generatedAt,
    trackedFiles: records.length,
    diff,
    message: diff.totalChanged ? "Tracked files changed after the last auto refresh." : "Graph-It freshness record matches tracked files.",
  };
}
function freshness() {
  console.log(JSON.stringify(freshnessResult(), null, 2));
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
function parseAutoArgs(args) {
  const opts = { intervalMs: 1500, debounceMs: 500, once: false, quality: true, wiki: true, viewer: true, obsidian: true, proof: false };
  for (const arg of args) {
    if (arg === "--once") opts.once = true;
    else if (arg.startsWith("--interval=")) opts.intervalMs = Math.max(250, Number(arg.slice("--interval=".length)) || opts.intervalMs);
    else if (arg.startsWith("--debounce=")) opts.debounceMs = Math.max(100, Number(arg.slice("--debounce=".length)) || opts.debounceMs);
    else if (arg === "--no-quality") opts.quality = false;
    else if (arg === "--no-wiki") opts.wiki = false;
    else if (arg === "--no-viewer") opts.viewer = false;
    else if (arg === "--no-obsidian") opts.obsidian = false;
    else if (arg === "--proof") opts.proof = true;
    else if (arg) throw new Error(`Unknown auto option: ${arg}`);
  }
  return opts;
}
function autoRefresh(opts, diff, records) {
  const startedAt = new Date().toISOString();
  const outputs = [];
  build(); outputs.push(path.relative(ROOT, GRAPH_PATH));
  delta(); outputs.push(path.relative(ROOT, DELTA_REPORT_MD));
  if (opts.quality) { quality(); outputs.push(path.relative(ROOT, QUALITY_MD)); }
  if (opts.wiki) { wiki(); outputs.push(path.relative(ROOT, WIKI_DIR)); }
  if (opts.viewer) { viewer(); outputs.push(path.relative(ROOT, VIEWER_PATH)); }
  if (opts.obsidian) { obsidian(); outputs.push(path.relative(ROOT, path.join(WIKI_DIR, "obsidian"))); }
  if (opts.proof) { proof(["architecture", "security privacy", "agent rules"]); outputs.push(path.relative(ROOT, path.join(PROOF_DIR, "proof.md"))); }
  return writeFreshness({
    status: "fresh",
    reason: diff?.totalChanged ? "auto-refresh after tracked file changes" : "auto-refresh baseline",
    diff,
    records,
    refresh: { startedAt, completedAt: new Date().toISOString(), outputs, options: opts },
  });
}
function auto(args) {
  const opts = parseAutoArgs(args);
  let previous = snapshotMap();
  const initialDiff = { added: [...previous.keys()], changed: [], removed: [], possibleRenames: [], totalChanged: previous.size };
  console.log("Graph-It auto mode: refreshing baseline artifacts...");
  autoRefresh(opts, initialDiff, [...previous.values()]);
  if (opts.once) return;
  let timer = null;
  let running = false;
  const schedule = diff => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (running) return;
      running = true;
      try {
        const records = trackedFileRecords();
        console.log(`\nGraph-It auto refresh: ${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed.`);
        autoRefresh(opts, diff, records);
        previous = snapshotMap(records);
      } catch (err) {
        writeFreshness({ status: "error", reason: err.message, diff, records: trackedFileRecords(), refresh: { failedAt: new Date().toISOString() } });
        console.error(`Graph-It auto refresh failed: ${err.message}`);
      } finally {
        running = false;
      }
    }, opts.debounceMs);
  };
  console.log(`Graph-It auto mode active. interval=${opts.intervalMs}ms debounce=${opts.debounceMs}ms. Press Ctrl+C to stop.`);
  setInterval(() => {
    const next = snapshotMap();
    const diff = diffSnapshots(previous, next);
    if (diff.totalChanged) schedule(diff);
  }, opts.intervalMs);
}
function sessionPromptText() {
  const fresh = freshnessResult();
  return `# Graph-It Dev Session Start

Use this prompt at the start of an AI coding-agent session in this repo.

## Guardrails

1. Treat the repo as local/confidential. Do not upload source, generated graph artifacts, or private docs.
2. Check Graph-It freshness before broad file reads.
3. Prefer EXTRACTED relationships; use INFERRED and AMBIGUOUS links as discovery hints only.
4. Use compact graph context first, then open targeted files and line ranges.
5. Rebuild or run auto-refresh when freshness is stale.
6. Keep generated artifacts under ignored local folders unless explicitly reviewed for sharing.
7. Never read \`.semantic-kg/graph.json\` whole — it is large (see \`_approxTokens\`) and will amplify token cost. Query it via \`graph.query\` / \`graph.pack\` / \`graph.node\` (or the \`kg:query\` / \`kg:pack\` scripts) instead.
8. Keep your own responses terse: do not restate unchanged code or file contents back to the user, skip ceremony, and reserve extended reasoning for genuinely hard steps (routine file reads and passing tests do not need a narrated recap). Output tokens cost more than input on most models.

## Freshness

- Status: **${fresh.status}**
- Graph exists: **${fresh.graphExists ? "yes" : "no"}**
- Tracked files: **${fresh.trackedFiles ?? "unknown"}**
- Message: ${fresh.message || "No freshness message."}

## Recommended startup commands

\`\`\`powershell
npm run kg:auto -- --once
npm run kg:quality
npm run kg:pack -- --intent=code "<task symbol or feature>"
\`\`\`

## Agent workflow

1. Run \`npm run kg:pack -- --intent=code "<task>"\` or \`npm run kg:query -- --intent=docs "<topic>"\`.
2. Read suggested next-read ranges only.
3. Use \`npm run kg:delta\` after meaningful changes.
4. Use \`npm run kg:obsidian\` when a richer repo-memory vault is needed.
5. Before claiming completion, run the repo's real validation plus \`npm run kg:quality\`.
`;
}
function sessionPrompt(args = []) {
  ensureDir(OUT_DIR);
  const text = sessionPromptText();
  fs.writeFileSync(SESSION_PROMPT_MD, text);
  if (args.includes("--print")) console.log(text);
  else console.log(`Wrote ${path.relative(ROOT, SESSION_PROMPT_MD)}`);
}
function postCommitHookBlock() {
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
  return { start, end, block };
}
function installPostCommitHookForRoot(projectRoot) {
  const gitDir = path.join(projectRoot, ".git");
  if (!fs.existsSync(gitDir)) throw new Error("Cannot install hook because .git was not found in this project root.");
  const hookPath = path.join(gitDir, "hooks", "post-commit");
  ensureDir(path.dirname(hookPath));
  const { start, end, block } = postCommitHookBlock();
  const existing = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, "utf8").replace(/\r\n/g, "\n") : "";
  const managedBlockRx = new RegExp(`${escapeRx(start)}[\\s\\S]*?${escapeRx(end)}`);
  let unmanaged = existing.replace(managedBlockRx, "").trimEnd();
  if (!unmanaged) unmanaged = "#!/bin/sh";
  else if (!unmanaged.startsWith("#!")) unmanaged = `#!/bin/sh\n\n${unmanaged}`;
  const next = `${unmanaged}\n\n${block}\n`;
  fs.writeFileSync(hookPath, next.replace(/\n/g, "\n"));
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch (err) {
    console.warn(`Could not mark hook executable: ${err.message}`);
  }
  return hookPath;
}
function installPostCommitHook() {
  const hookPath = installPostCommitHookForRoot(ROOT);
  console.log(`Installed Graph-It managed post-commit hook at ${path.relative(ROOT, hookPath)}.`);
  console.log("The hook refreshes build, wiki, and viewer artifacts after each commit.");
}
function hook(args) {
  const subcommand = args[0] || "";
  if (subcommand === "install") installPostCommitHook();
  else { console.error("Usage: node tools/semantic-kg.mjs hook install"); process.exit(1); }
}
function parseBootstrapArgs(args) {
  const opts = { target: ".", withHook: false, build: false, force: false };
  for (const arg of args) {
    if (arg === "--with-hook") opts.withHook = true;
    else if (arg === "--build") opts.build = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (!arg.startsWith("--") && opts.target === ".") opts.target = arg;
    else throw new Error(`Unknown bootstrap option: ${arg}`);
  }
  return opts;
}
function normalizeProjectRoot(target) {
  const root = path.resolve(ROOT, target || ".");
  if (!fs.existsSync(root)) throw new Error(`Target directory does not exist: ${root}`);
  if (!fs.statSync(root).isDirectory()) throw new Error(`Target is not a directory: ${root}`);
  return root;
}
function ensureGitignoreEntry(projectRoot) {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const entry = ".semantic-kg/";
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "";
  const lines = existing.split(/\r?\n/).map(line => line.trim());
  if (lines.includes(entry) || lines.includes(".semantic-kg")) return { path: gitignorePath, changed: false };
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(gitignorePath, `${existing}${prefix}${entry}\n`);
  return { path: gitignorePath, changed: true };
}
function installToolIntoProject(projectRoot, opts) {
  const targetTool = path.join(projectRoot, "tools", "semantic-kg.mjs");
  ensureDir(path.dirname(targetTool));
  const source = fs.readFileSync(TOOL_SOURCE_PATH);
  const targetExists = fs.existsSync(targetTool);
  if (targetExists) {
    const current = fs.readFileSync(targetTool);
    if (sha(current) === sha(source)) return { path: targetTool, changed: false, skipped: false, reason: "already current" };
    if (!opts.force && path.resolve(targetTool) !== TOOL_SOURCE_PATH) {
      return { path: targetTool, changed: false, skipped: true, reason: "different existing tool; rerun with --force to replace" };
    }
  }
  fs.writeFileSync(targetTool, source);
  return { path: targetTool, changed: true, skipped: false, reason: targetExists ? "replaced" : "created" };
}
function updatePackageScripts(projectRoot) {
  const packagePath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(packagePath)) return { path: packagePath, changed: false, skipped: true, reason: "package.json not found" };
  const raw = fs.readFileSync(packagePath, "utf8");
  const pkg = JSON.parse(raw);
  const scripts = { ...(pkg.scripts || {}) };
  let changed = false;
  for (const [name, command] of Object.entries(PACKAGE_SCRIPTS)) {
    if (scripts[name] === command) continue;
    if (scripts[name] && scripts[name] !== command) continue;
    scripts[name] = command;
    changed = true;
  }
  if (!changed && pkg.scripts) return { path: packagePath, changed: false, skipped: false, reason: "already current" };
  pkg.scripts = scripts;
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  return { path: packagePath, changed: true, skipped: false, reason: "scripts updated" };
}
function runProjectCommand(projectRoot, args) {
  const result = spawnSync("node", ["tools/semantic-kg.mjs", ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  return {
    command: `node tools/semantic-kg.mjs ${args.join(" ")}`,
    status: result.status,
    ok: result.status === 0,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}
function bootstrapResult(args = []) {
  const opts = parseBootstrapArgs(args);
  if (opts.help) {
    return {
      usage: "node tools/semantic-kg.mjs bootstrap [target-dir] [--with-hook] [--build] [--force]",
      options: {
        "--with-hook": "Install the managed post-commit hook in the target repo.",
        "--build": "Run a local graph build after installing the tool.",
        "--force": "Replace an existing different tools/semantic-kg.mjs.",
      },
    };
  }
  const projectRoot = normalizeProjectRoot(opts.target);
  const tool = installToolIntoProject(projectRoot, opts);
  const gitignore = ensureGitignoreEntry(projectRoot);
  const packageScripts = updatePackageScripts(projectRoot);
  const hook = { skipped: true, reason: "run with --with-hook to install the managed post-commit hook" };
  if (opts.withHook) {
    const hookPath = installPostCommitHookForRoot(projectRoot);
    hook.skipped = false;
    hook.changed = true;
    hook.path = hookPath;
    hook.reason = "installed";
  }
  const build = opts.build && !tool.skipped
    ? runProjectCommand(projectRoot, ["build"])
    : { skipped: true, reason: opts.build ? "tool install was skipped" : "run with --build to build immediately" };
  return {
    generatedAt: new Date().toISOString(),
    projectRoot,
    sourceTool: TOOL_SOURCE_PATH,
    enterpriseDefaults: {
      localFirst: true,
      externalUploads: false,
      graphArtifactsIgnored: true,
      evidenceLabels: ["EXTRACTED", "INFERRED", "AMBIGUOUS"],
    },
    changes: { tool, gitignore, packageScripts, hook, build },
    nextSteps: [
      "Run npm run kg:build or node tools/semantic-kg.mjs build in the target repo.",
      "Run npm run kg:quality and review .semantic-kg/quality.md before relying on the graph.",
      "Run npm run kg:mcp:config -- --smoke-test, then wire the emitted MCP snippet into your client.",
      "Use graph.query before opening raw files and graph.delta after rebuilds.",
    ],
  };
}
function bootstrap(args) {
  console.log(JSON.stringify(bootstrapResult(args), null, 2));
}
function install(args = []) {
  const translated = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--project") translated.push(args[++i] || ".");
    else if (arg.startsWith("--project=")) translated.push(arg.slice("--project=".length));
    else translated.push(arg);
  }
  bootstrap(translated);
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
  try {
    const freshnessPayload = callMcpTool("graph.freshness", {});
    checks.push({ name: "graph.freshness", ok: true, resultBytes: Buffer.byteLength(JSON.stringify(freshnessPayload), "utf8") });
  } catch (err) {
    checks.push({ name: "graph.freshness", ok: false, error: err.message });
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
      "Call graph.freshness before broad graph use in long-running local sessions.",
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
    name: "graph.pack",
    description: "Pack ranked graph query hits into live, graph, compressed, and offloaded buckets before handing context to an agent.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms, symbol name, file path fragment, or documentation phrase." },
        intent: { type: "string", enum: ["auto", "code", "docs", "media", "all"], description: "Optional ranking intent." },
        limit: { type: "number", minimum: 1, maximum: 30, description: "Maximum ranked hits to pack." },
        budget: { type: "number", minimum: 200, maximum: 20000, description: "Approximate token budget for packed context." },
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
    name: "graph.freshness",
    description: "Return Graph-It freshness status and changed files since the last auto refresh.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "graph.export",
    description: "Write local GraphML, Cypher, and/or SVG graph exports under .semantic-kg/exports.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["all", "graphml", "cypher", "svg"], description: "Export format. Defaults to all." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "graph.proof",
    description: "Write a local proof pack with quality score, representative queries, and a local context size comparison.",
    inputSchema: {
      type: "object",
      properties: {
        queries: { type: "array", items: { type: "string" }, description: "Representative proof queries." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "graph.eval",
    description: "Run a local retrieval-quality evaluation (hit@1, hit@k, MRR, tokens-to-answer) using auto-generated cases from the graph or a supplied cases file. Use to check whether graph queries reliably surface the right symbols/sections.",
    inputSchema: {
      type: "object",
      properties: {
        k: { type: "number", minimum: 1, description: "Rank cutoff for hit@k. Defaults to 5." },
        limit: { type: "number", minimum: 1, maximum: 30, description: "Query hit limit per case. Defaults to 20." },
        auto: { type: "number", minimum: 1, maximum: 200, description: "Number of auto-generated cases when no cases file is given. Defaults to 30." },
        cases: { type: "string", description: "Optional path to a JSON cases file (array of { query, intent?, expect:{ id|label|path } })." },
        minHitRate: { type: "number", minimum: 0, maximum: 1, description: "Pass threshold for hit@k. Defaults to 0.8." },
      },
      additionalProperties: false,
    },
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
const MCP_SENT_LEDGER = new Set();
function applySentLedger(result) {
  // MCP sessions are one process per client, so this in-memory ledger is session-scoped.
  // Content already delivered this session is collapsed to a reversible pointer so repeated
  // packs of overlapping hits do not re-spend tokens on the same material.
  if (!result?.buckets) return result;
  for (const bucket of Object.keys(result.buckets)) {
    if (bucket === "live") continue;
    for (const item of result.buckets[bucket]) {
      if (!item?.id) continue;
      if (MCP_SENT_LEDGER.has(item.id)) {
        item.skipped = true;
        item.packedContent = `Already sent this session. Reload with graph.node "${item.id}".`;
        item.packedTokens = estimateTokens(item.packedContent);
      } else {
        MCP_SENT_LEDGER.add(item.id);
      }
    }
  }
  result.packedTokens = Object.values(result.buckets).flat().reduce((sum, item) => sum + (item.packedTokens || 0), 0);
  result.tokenDelta = Math.max(0, result.originalTokens - result.packedTokens);
  result.compressionRatio = result.originalTokens ? Math.round((result.packedTokens / result.originalTokens) * 100) / 100 : 1;
  result.withinBudget = result.packedTokens <= result.budgetTokens;
  return result;
}
function callMcpTool(name, args = {}) {
  if (name === "graph.stats") return mcpContent(statsResult());
  if (name === "graph.query") return mcpContent(queryResult({ query: args.query, intent: args.intent || "auto", limit: args.limit || 12 }));
  if (name === "graph.pack") return mcpContent(applySentLedger(packResult({ query: args.query, intent: args.intent || "auto", limit: args.limit || 12, budget: args.budget || 1600 })));
  if (name === "graph.path") return mcpContent(pathResult(args.from, args.to));
  if (name === "graph.node") return mcpContent(nodeResult(args.query));
  if (name === "graph.neighborhood") return mcpContent(neighborhoodResult(args.query, args.depth || 1, args.limit || 40));
  if (name === "graph.build") {
    const built = captureConsole(() => build());
    return mcpContent({ message: built.output, stats: statsResult() });
  }
  if (name === "graph.delta") return mcpContent(deltaResult());
  if (name === "graph.freshness") return mcpContent(freshnessResult());
  if (name === "graph.export") {
    const exported = captureConsole(() => exportGraph([args.format || "all"]));
    return mcpContent({ message: exported.output, exportDir: path.relative(ROOT, EXPORT_DIR) });
  }
  if (name === "graph.proof") {
    const proofed = captureConsole(() => proof(Array.isArray(args.queries) ? args.queries : []));
    return mcpContent({ message: proofed.output, proofDir: path.relative(ROOT, PROOF_DIR) });
  }
  if (name === "graph.mcp_config") return mcpContent(mcpConfigResult([`--client=${args.client || "all"}`, ...(args.smokeTest ? ["--smoke-test"] : [])]));
  if (name === "graph.eval") return mcpContent(evalResult({ k: args.k || 5, limit: args.limit || 20, auto: args.auto || 30, cases: args.cases || null, minHitRate: args.minHitRate ?? 0.8 }));
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
else if (cmd === "pack") pack(args);
else if (cmd === "impact") impact(args.join(" "));
else if (cmd === "drift") drift();
else if (cmd === "delta") delta();
else if (cmd === "wiki") wiki();
else if (cmd === "viewer") viewer();
else if (cmd === "quality") quality();
else if (cmd === "export") exportGraph(args);
else if (cmd === "proof") proof(args);
else if (cmd === "examples") examples(args);
else if (cmd === "agent-rules") agentRules(args);
else if (cmd === "obsidian") obsidian();
else if (cmd === "ingest") ingest(args);
else if (cmd === "enrich") enrich(args);
else if (cmd === "auto") auto(args);
else if (cmd === "freshness") freshness();
else if (cmd === "session-prompt") sessionPrompt(args);
else if (cmd === "watch") watch(args);
else if (cmd === "hook") hook(args);
else if (cmd === "bootstrap") bootstrap(args);
else if (cmd === "install") install(args);
else if (cmd === "mcp") mcp();
else if (cmd === "mcp-config") mcpConfig(args);
else if (cmd === "path") pathBetween(args[0] || "", args[1] || "");
else if (cmd === "baseline") baseline(args);
else if (cmd === "eval") evaluate(args);
else { console.error(`Unknown command: ${cmd}`); usage(); process.exit(1); }
