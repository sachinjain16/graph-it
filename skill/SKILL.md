---
name: "graph-it"
description: "Build reusable local semantic knowledge graphs for codebases and mixed project folders to reduce token consumption. Use when the user asks for Graph-It, graph indexing, queryable project maps, semantic repo indexes, code/document/media knowledge graphs, or agent navigation baselines."
---

Use Graph-It when the user wants a reusable local semantic knowledge graph for a project, repository, documentation folder, or mixed corpus of code/docs/images/PDFs/videos. The goal is to reduce token consumption and improve agent navigation by creating a compact graph that can be queried before opening raw files.

Core principles:
1. Local-first by default. Do not send code, docs, screenshots, PDFs, or other project content to external services unless the user explicitly asks for an LLM/vision enrichment pass and confirms privacy implications.
2. Evidence honesty. Every edge must carry an evidence marker: EXTRACTED for deterministic facts, INFERRED for heuristic/semantic relationships, AMBIGUOUS when uncertain.
3. Enterprise-first posture. Prefer predictable repo-local setup, ignored generated artifacts, explicit trust boundaries, and MCP-native agent access over broad feature sprawl.
4. Cheap before expensive. Build deterministic structure first: files, hashes, symbols, sections, headings, mentions, references, archive/media metadata. Add semantic summaries and topic edges locally using names, surrounding text, headings, and configured topic vocabularies.
5. Project-specific topic maps. Infer sensible default topics from the project, then allow a topic vocabulary to be customized for that domain. Examples include architecture, build/deploy, security/privacy, user interface, documentation, data persistence, media assets, and project history.
6. Avoid generated-noise by default. Exclude build outputs, dependency folders, cache folders, lockfile noise, and generated docs unless the user wants generated artifacts indexed too.
7. Baseline usefulness. After building, run a small check that compares graph query output size/time against the raw files that would otherwise be opened. Report it as a local size comparison and save a baseline artifact.

Bundled resource:
- This skill includes `semantic-kg-template.mjs`, a dependency-free Node.js starting point. When available, copy it into the target project as `tools/semantic-kg.mjs`, then customize `SEMANTIC_TOPICS`, exclusions, summaries, and domain-specific inferred edge types.

Preferred implementation shape:
- Add a project-local tool such as `tools/semantic-kg.mjs`, `tools/project-kg.mjs`, or a language-appropriate equivalent.
- Generate `.semantic-kg/graph.json` and `.semantic-kg/cache/` by default. If the project already has a convention such as `.lhq-kg/`, preserve it.
- Add npm/package scripts when appropriate:
  - `kg:build` or equivalent build command
  - `kg:stats`
  - `kg:query -- "terms"`
  - `kg:pack -- --intent=code "SymbolName"` for graph context packing before handing context to an agent
  - `kg:query -- --intent=code "SymbolName"` for exact-symbol navigation
  - `kg:query -- --intent=docs "release phrase"` for docs/release-note lookup
  - `kg:impact -- "A"` for likely code/docs touchpoints and validation hints
  - `kg:drift` for narrative/docs marker drift, including `.semantic-kg/drift-report.json` and `.semantic-kg/drift-report.md` artifacts
  - `kg:delta` for changed files, semantic neighborhood movement, new inferred edges, isolated nodes, and recommended rereads
  - `kg:wiki` for agent-readable markdown pages under `.semantic-kg/wiki/`, including topic pages and a community report
  - `kg:viewer` for a standalone local `.semantic-kg/graph.html` viewer with search, filters, and node details
  - `kg:quality` for graph health score, coverage, noise, and repair actions
  - `kg:export` for GraphML, Cypher/Neo4j, and SVG local exports
  - `kg:proof` for local proof packs with quality, query results, and a local context size comparison
  - `kg:examples` for sanitized worked-example scaffolds that still require human review
  - `kg:agent-rules` for query-first instruction packs for common agent clients
  - `kg:enrich` for creating a privacy-safe local enrichment plan and optional local text sidecars without external calls
  - `kg:auto` for local auto-refresh and `.semantic-kg/freshness.json`
  - `kg:freshness` for checking whether tracked files changed since the last auto refresh
  - `kg:session-prompt` for an agent/dev-session kickoff prompt with guardrails
  - `kg:watch` for refreshing graph/wiki/viewer artifacts during active editing
  - `kg:hook:install` for installing a managed post-commit hook that refreshes local graph artifacts
  - `kg:bootstrap` for installing Graph-It into another repo with safe local defaults
  - `kg:mcp` for exposing graph query/pack/path/stats/node/neighborhood/build over MCP stdio
  - `kg:mcp:config` for generating local MCP client snippets and optional graph.stats/graph.delta smoke checks
  - optional `kg:path "A" "B"`
- Add the generated graph output directory to `.gitignore` unless the user explicitly wants checked-in graph artifacts.
- Update the project README or handoff state with the workflow and current graph stats.

Minimum graph schema:
- graph metadata: schemaVersion, generatedAt, root, includeGenerated, stats
- nodes: id, kind, label, path, line, ext, bytes, sha256, summary, semanticTags, tokens, optional caption
- edges: from, to, type, evidence, confidence when inferred, why when useful
- expected node kinds: file, code_file, doc_file, image_file, pdf_file, video_file, archive_file, section, symbol, component, concept, topic
- expected extracted edge types: CONTAINS, NEXT_SECTION, DEFINES, REFERENCES, MENTIONS, ARCHIVES, TAGGED, DUPLICATES
- expected inferred edge types: SEMANTICALLY_RELATED plus domain-specific edges such as USES_ROUTER, CONFIGURES_COST_CAP, GOVERNS_COST, SURFACE_FOR, PERSISTS_TO, DESCRIBES_MEDIA

Workflow:
1. Inspect the project root and identify source files, docs, media, archives, generated folders, and dependency folders.
2. Decide exclusion rules before building. Exclude dependencies and generated artifacts unless requested.
3. For reusable repo setup, prefer `node tools/semantic-kg.mjs bootstrap <target>` from the canonical Graph-It repo instead of manual copy/paste.
4. Create or adapt a local indexer. Prefer a single portable script with no required external dependencies.
5. Build the graph or run `auto --once`, then run `stats`.
6. Run `session-prompt --print` when starting a new development session with an AI coding agent.
7. Run `quality` and review `.semantic-kg/quality.md` before relying on the graph.
8. Run 3-5 representative query tests based on likely agent tasks, including at least one `--intent=code` exact-symbol lookup and one `--intent=docs` lookup.
9. Run `proof` with representative queries to capture quality, top hits, and a local context size comparison.
10. Run `impact` for one important component/symbol to verify code/docs touchpoints are useful.
11. Run `drift` when the project has narrative docs or release notes that should stay aligned with shipped work. Check the console output and saved drift report artifacts.
12. Run `export all` when downstream graph tools need GraphML, Cypher, or SVG.
13. Run `agent-rules all` when the target repo should carry query-first instructions for common agent clients.
14. Run `examples --public` only for non-confidential or already-reviewed projects, then review before publishing.
15. Compare query output KB against canonical raw files referenced by the query. Save the results to `.semantic-kg/baseline.json` or the project-specific graph folder.
16. Run `pack` for graph hits that would otherwise become large raw context; use live/graph/compressed/offloaded buckets before handing context to an agent.
17. Tighten noisy topic aliases and query scoring if broad words dominate results.
18. Document the workflow and graph stats.
19. Save a user/project memory when appropriate so future sessions use the graph first.

For colleagues or reusable delivery:
- Present it as a local project tool plus a Clawpilot skill workflow.
- Make it privacy-safe: no external content upload by default.
- Make it easy to extend by editing a `SEMANTIC_TOPICS` array or config object.
- Explain that deterministic extraction is not the same as full LLM understanding, but it lets an agent navigate with far less raw context for lookup and orientation tasks.
- Prefer current Graph-It behavior when creating or updating templates: enterprise bootstrap/install, package CLI aliases, trust docs, auto-refresh freshness, session-start prompt, JS/TS structural extraction, intent-aware ranking, exact-symbol prioritization, next-read line bundles, context pack, impact mode, drift report artifacts, delta reports, quality score, export pack, proof pack, local extraction sidecars, sanitized examples, agent-rule packs, agent wiki export, community reporting, watch/hook refresh, MCP server mode, MCP config helper, and baseline artifacts.

When operating in a project that already has a custom graph tool:
- Preserve that project's existing graph tool and output directory unless the user asks to migrate it.
- Preserve any project-specific deploy or release safety rules.
- Run the project's existing build, stats, representative query, impact, drift, quality, and proof commands before claiming the graph is useful.
