# Graph-It

**Graph-It (semantic-graph-indexer)** is a local-first Clawpilot skill and portable Node.js template for building semantic knowledge graphs over codebases and mixed project folders.

The goal is simple: query a compact graph before opening raw source/docs/media, reducing agent token consumption while preserving evidence boundaries.

## What it does

- Indexes files, docs, code symbols, headings, archives, and media metadata.
- Adds local semantic summaries and topic relationships.
- Marks every relationship as `EXTRACTED`, `INFERRED`, or `AMBIGUOUS`.
- Writes a queryable graph to `.semantic-kg/graph.json`.
- Saves SHA-based cache records under `.semantic-kg/cache/`.
- Runs quick baselines comparing graph query output against raw-file context size.
- Prioritizes exact code symbols with `--intent=code`.
- Prioritizes docs/release-note sections with `--intent=docs`.
- Suggests tight next-read line ranges for follow-up inspection.
- Reports change impact and docs drift with dedicated commands.
- Writes drift reports to `.semantic-kg/drift-report.json` and `.semantic-kg/drift-report.md`.
- Reports graph deltas across builds with changed files, changed neighborhoods, new inferred edges, isolated nodes, and recommended rereads.
- Exports an agent-readable wiki with topic pages and a community report.
- Generates a standalone interactive graph viewer at `.semantic-kg/graph.html`.
- Scores graph quality with orphan, god-node, weak-edge, duplicate-label, and source-coverage checks.
- Exports an Obsidian-friendly vault with YAML frontmatter, tags, backlinks, and note-type folders.
- Stages mixed documents locally for future extraction/enrichment workflows.
- Creates a privacy-safe opt-in enrichment plan without calling a model.
- Watches project changes and refreshes graph/wiki/viewer artifacts.
- Installs a managed post-commit hook to keep local graph artifacts fresh after commits.
- Exposes graph query, path, stats, node, neighborhood, and build tools through MCP stdio server mode.
- Generates copy-ready MCP client configuration for the current project.
- Avoids external uploads by default.

## Quick start

Run against this repo:

```powershell
node .\tools\semantic-kg.mjs build
node .\tools\semantic-kg.mjs stats
node .\tools\semantic-kg.mjs query --intent=code "MyComponent"
node .\tools\semantic-kg.mjs query --intent=docs "release notes auth"
node .\tools\semantic-kg.mjs impact "MyComponent"
node .\tools\semantic-kg.mjs drift   # writes .semantic-kg/drift-report.{json,md}
node .\tools\semantic-kg.mjs delta   # writes .semantic-kg/delta-report.{json,md}
node .\tools\semantic-kg.mjs wiki    # writes .semantic-kg/wiki/
node .\tools\semantic-kg.mjs viewer  # writes .semantic-kg/graph.html
node .\tools\semantic-kg.mjs quality # writes .semantic-kg/quality.{json,md}
node .\tools\semantic-kg.mjs obsidian # writes .semantic-kg/wiki/obsidian/
node .\tools\semantic-kg.mjs ingest README.md docs
node .\tools\semantic-kg.mjs enrich --provider local
node .\tools\semantic-kg.mjs watch   # refreshes local graph artifacts as files change
node .\tools\semantic-kg.mjs hook install
node .\tools\semantic-kg.mjs mcp     # MCP stdio server for agent tools
node .\tools\semantic-kg.mjs mcp-config --smoke-test
node .\tools\semantic-kg.mjs baseline "architecture" "build deploy" "auth state"
```

## Use Graph-It in another repo

1. Copy `tools\semantic-kg.mjs` into the target repo at `tools\semantic-kg.mjs`.
2. Add the package scripts below if the target repo uses npm.
3. Add `.semantic-kg/` to the target repo's `.gitignore`.
4. Run `npm run kg:build`, then `npm run kg:mcp:config -- --smoke-test`.
5. Copy the generated MCP snippet into your MCP client settings.
6. Use `graph.stats` to confirm the server is connected, then use `graph.query` before opening raw files and `graph.delta` after rebuilds.

## Suggested package scripts

```json
{
  "scripts": {
    "kg:build": "node tools/semantic-kg.mjs build",
    "kg:stats": "node tools/semantic-kg.mjs stats",
    "kg:query": "node tools/semantic-kg.mjs query",
    "kg:impact": "node tools/semantic-kg.mjs impact",
    "kg:drift": "node tools/semantic-kg.mjs drift",
    "kg:drift:report": "node tools/semantic-kg.mjs drift",
    "kg:delta": "node tools/semantic-kg.mjs delta",
    "kg:wiki": "node tools/semantic-kg.mjs wiki",
    "kg:viewer": "node tools/semantic-kg.mjs viewer",
    "kg:quality": "node tools/semantic-kg.mjs quality",
    "kg:obsidian": "node tools/semantic-kg.mjs obsidian",
    "kg:ingest": "node tools/semantic-kg.mjs ingest",
    "kg:enrich": "node tools/semantic-kg.mjs enrich",
    "kg:watch": "node tools/semantic-kg.mjs watch",
    "kg:hook:install": "node tools/semantic-kg.mjs hook install",
    "kg:mcp": "node tools/semantic-kg.mjs mcp",
    "kg:mcp:config": "node tools/semantic-kg.mjs mcp-config",
    "kg:path": "node tools/semantic-kg.mjs path",
    "kg:baseline": "node tools/semantic-kg.mjs baseline"
  }
}
```

## World-class graph workflow

Use Graph-It as a local knowledge-graph product loop:

```powershell
node .\tools\semantic-kg.mjs build
node .\tools\semantic-kg.mjs quality
node .\tools\semantic-kg.mjs obsidian
node .\tools\semantic-kg.mjs viewer
```

Outputs:

- `.semantic-kg/quality.md` - graph health, issues, and next actions.
- `.semantic-kg/wiki/obsidian/` - durable vault-style notes with tags and backlinks.
- `.semantic-kg/graph.html` - searchable/filterable graph explorer with quality summary.
- `.semantic-kg/enrichment-plan.json` - opt-in enrichment plan when `enrich` is run.

For mixed documents:

```powershell
node .\tools\semantic-kg.mjs ingest README.md docs
node .\tools\semantic-kg.mjs enrich --provider local
```

`enrich` is plan-only by default. It does not call a model or move data outside the repo.

Add this to `.gitignore` in the target project:

```text
.semantic-kg/
```

## Graph schema

Graph metadata:

- `schemaVersion`
- `generatedAt`
- `root`
- `includeGenerated`
- `stats`

Node fields:

- `id`
- `kind`
- `label`
- `path`
- `line`
- `ext`
- `bytes`
- `sha256`
- `summary`
- `semanticTags`
- `tokens`
- optional `caption`

Common node kinds:

- `file`
- `code_file`
- `doc_file`
- `image_file`
- `pdf_file`
- `video_file`
- `archive_file`
- `section`
- `symbol`
- `component`
- `concept`
- `topic`

Common extracted edge types:

- `CONTAINS`
- `NEXT_SECTION`
- `DEFINES`
- `REFERENCES`
- `MENTIONS`
- `ARCHIVES`
- `TAGGED`
- `DUPLICATES`

Common inferred edge types:

- `SEMANTICALLY_RELATED`
- project-specific edges like `USES_ROUTER`, `CONFIGURES_COST_CAP`, `GOVERNS_COST`, `SURFACE_FOR`, `PERSISTS_TO`, or `DESCRIBES_MEDIA`

## Privacy model

This project is local-first. The included template does not call external APIs and does not upload source, documents, screenshots, PDFs, or other private data.

If you later add LLM or vision enrichment, make it opt-in and preserve evidence labels so users can distinguish extracted facts from inferred interpretations.

## MCP server mode

Run Graph-It as a dependency-free MCP stdio server:

```powershell
node .\tools\semantic-kg.mjs mcp
```

Available MCP tools:

- `graph.stats`: returns graph counts and artifact metadata.
- `graph.query`: returns ranked nodes, nearby relationships, and suggested next-read ranges.
- `graph.path`: finds the shortest known relationship path between two nodes.
- `graph.node`: resolves and inspects one node by id, label, symbol, or path fragment.
- `graph.neighborhood`: returns a compact local neighborhood around a node.
- `graph.build`: rebuilds the local graph artifact.
- `graph.delta`: compares the current graph with the previous build snapshot and returns recommended rereads.
- `graph.mcp_config`: returns copy-ready local MCP configuration for this project.

This lets coding agents query `.semantic-kg/graph.json` before opening raw files. The server communicates only over stdio and keeps project content local unless the host agent separately sends tool results elsewhere.

Generate MCP client configuration for the current repo:

```powershell
node .\tools\semantic-kg.mjs mcp-config --smoke-test
```

The helper validates the local tool and graph artifact, emits generic, Claude Desktop, and Clawpilot-compatible MCP snippets, and can smoke-test `graph.stats` plus `graph.delta`.

## High-value roadmap additions

The current template covers deterministic extraction, semantic topic edges, intent-aware query, next-read ranges, impact mode, drift checks with report artifacts, delta reports, agent wiki export, community reporting, interactive graph viewing, watch/hook refresh, MCP server mode, MCP config generation, and baseline measurement. The highest-value next additions are:

1. **GraphML / Neo4j / Cypher exports**: allow Gephi, yEd, Neo4j, and other graph tools to consume the project map.
2. **Media enrichment adapters**: add optional local OCR/PDF text extraction and opt-in multimodal captioning, with privacy warnings before any external model use.

## Clawpilot skill

The reusable **Graph-It** skill lives in `skill/SKILL.md`. Install it by copying the folder into a Clawpilot local skills directory, or keep this repo as the source for team customization.

Recommended trigger language:

- "Build a semantic graph for this repo"
- "Build a local semantic graph for this project"
- "Create a queryable project map"
- "Baseline token reduction with a graph index"
- "Use the semantic graph before grepping"
