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
  console.log(`Semantic KG\n\nUsage:\n  node tools/semantic-kg.mjs build [--include-generated]\n  node tools/semantic-kg.mjs stats\n  node tools/semantic-kg.mjs query "terms"\n  node tools/semantic-kg.mjs baseline "query one" "query two"`);
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
function query(q) { const g = load(); const terms = tokenize(q).concat(String(q).toLowerCase().split(/\s+/).filter(Boolean)); const a = adj(g); const hits = g.nodes.map(n => { const hay = [n.id, n.kind, n.label, n.path, n.summary, n.caption, ...(n.tokens || []), ...(n.semanticTags || []), ...(n.aliases || [])].join(" ").toLowerCase(); let score = 0; for (const t of terms) { if (hay.includes(t)) score += 8; if (n.label?.toLowerCase() === t) score += 20; } for (const nb of (a.get(n.id) || []).slice(0, 50)) for (const t of terms) if (`${nb.type} ${nb.node.label} ${nb.node.path}`.toLowerCase().includes(t)) score += 2; return { n, score }; }).filter(x => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 12);
  for (const { n, score } of hits) { console.log(`\n[${score}] ${n.kind}: ${n.label}`); if (n.path) console.log(`  ${n.path}${n.line ? `:${n.line}` : ""}`); if (n.summary) console.log(`  ${n.summary}`); if (n.semanticTags?.length) console.log(`  Topics: ${n.semanticTags.join(", ")}`); for (const nb of (a.get(n.id) || []).slice(0, 8)) console.log(`  ${nb.dir === "out" ? "->" : "<-"} ${nb.type} ${nb.node.kind}:${nb.node.label}${nb.node.path ? ` (${nb.node.path}${nb.node.line ? `:${nb.node.line}` : ""})` : ""}`); }
}
function stats() { const g = load(); console.log(JSON.stringify(g.stats, null, 2)); }
function baseline(args) { const qs = args.length ? args : ["architecture", "build deploy", "auth state", "ui component"]; const results = qs.map(q => { const start = Date.now(); let out = ""; const old = console.log; console.log = (...x) => { out += x.join(" ") + "\n"; }; query(q); console.log = old; return { query: q, ms: Date.now() - start, outputKB: Math.round(Buffer.byteLength(out) / 102.4) / 10 }; }); fs.writeFileSync(path.join(OUT_DIR, "baseline.json"), JSON.stringify({ generatedAt: new Date().toISOString(), tests: results }, null, 2)); console.table(results); }

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || cmd === "help" || cmd === "--help") usage();
else if (cmd === "build") build();
else if (cmd === "stats") stats();
else if (cmd === "query") query(args.join(" "));
else if (cmd === "baseline") baseline(args);
else { console.error(`Unknown command: ${cmd}`); usage(); process.exit(1); }
