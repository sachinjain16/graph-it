---
name: "graph-it"
description: "Build reusable local semantic knowledge graphs for codebases and mixed project folders to reduce token consumption. Use when the user asks for Graph-It, graph indexing, queryable project maps, semantic repo indexes, code/document/media knowledge graphs, or agent navigation baselines."
---

Use Graph-It when the user wants a reusable local semantic knowledge graph for a project, repository, documentation folder, or mixed corpus of code/docs/images/PDFs/videos. The goal is to reduce token consumption and improve agent navigation by creating a compact graph that can be queried before opening raw files.

Core principles:
1. Local-first by default. Do not send code, docs, screenshots, PDFs, or other project content to external services unless the user explicitly asks for an LLM/vision enrichment pass and confirms privacy implications.
2. Evidence honesty. Every edge must carry an evidence marker: EXTRACTED for deterministic facts, INFERRED for heuristic/semantic relationships, AMBIGUOUS when uncertain.
3. Cheap before expensive. Build deterministic structure first: files, hashes, symbols, sections, headings, mentions, references, archive/media metadata. Add semantic summaries and topic edges locally using names, surrounding text, headings, and configured topic vocabularies.
4. Project-specific topic maps. Infer sensible default topics from the project, then allow a topic vocabulary to be customized for that domain. For LHQ+, examples are AI content generation, BYOK cost governance, Reading, Daily Pack, Parent controls, Curriculum standards, Little Wonders, Docs/architecture, Build/deploy, Media assets, Phase history, and Browser persistence.
5. Avoid generated-noise by default. Exclude build outputs, dependency folders, cache folders, lockfile noise, and generated docs unless the user wants generated artifacts indexed too.
6. Baseline usefulness. After building, run a small benchmark that compares graph query output size/time against the raw files that would otherwise be opened. Report reduction as a byte/context proxy and save a baseline artifact.

Bundled resource:
- This skill includes `semantic-kg-template.mjs`, a dependency-free Node.js starting point. When available, copy it into the target project as `tools/semantic-kg.mjs`, then customize `SEMANTIC_TOPICS`, exclusions, summaries, and domain-specific inferred edge types.

Preferred implementation shape:
- Add a project-local tool such as `tools/semantic-kg.mjs`, `tools/project-kg.mjs`, or a language-appropriate equivalent.
- Generate `.semantic-kg/graph.json` and `.semantic-kg/cache/` by default. If the project already has a convention such as `.lhq-kg/`, preserve it.
- Add npm/package scripts when appropriate:
  - `kg:build` or equivalent build command
  - `kg:stats`
  - `kg:query -- "terms"`
  - `kg:query -- --intent=code "SymbolName"` for exact-symbol navigation
  - `kg:query -- --intent=docs "release phrase"` for docs/release-note lookup
  - `kg:impact -- "A"` for likely code/docs touchpoints and validation hints
  - `kg:drift` for narrative/docs marker drift
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
3. Create or adapt a local indexer. Prefer a single portable script with no required external dependencies.
4. Build the graph and run `stats`.
5. Run 3-5 representative query tests based on likely agent tasks, including at least one `--intent=code` exact-symbol lookup and one `--intent=docs` lookup.
6. Run `impact` for one important component/symbol to verify code/docs touchpoints are useful.
7. Run `drift` when the project has narrative docs or release notes that should stay aligned with shipped work.
8. Compare query output KB against canonical raw files referenced by the query. Save the results to `.semantic-kg/baseline.json` or the project-specific graph folder.
9. Tighten noisy topic aliases and query scoring if broad words dominate results.
10. Document the workflow and graph stats.
11. Save a user/project memory when appropriate so future sessions use the graph first.

For colleagues or reusable delivery:
- Present it as a local project tool plus a Clawpilot skill workflow.
- Make it privacy-safe: no external content upload by default.
- Make it easy to extend by editing a `SEMANTIC_TOPICS` array or config object.
- Explain that deterministic extraction is not the same as full LLM understanding, but often provides 50x-300x less context for navigation tasks.
- Prefer Graph-It v3 behavior when creating or updating templates: intent-aware ranking, exact-symbol prioritization, next-read line bundles, impact mode, drift checks, and baseline artifacts.

When operating in LHQ+ specifically:
- Work in `C:\dev\.liqplus-deploy`.
- Use the existing tool `tools\lhq-kg.mjs` and output `.lhq-kg\graph.json`.
- Preserve the deploy rule: never run `npm run deploy` or `npm run deploy:preview`.
- Run `npm run kg:build`, `npm run kg:stats`, representative `npm run kg:query -- --intent=code "..."`, `npm run kg:impact -- "..."`, and `npm run kg:drift` before claiming the graph is useful.
