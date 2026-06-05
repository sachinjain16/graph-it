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
node .\tools\semantic-kg.mjs baseline "architecture" "build deploy" "auth state"
```

To use it in another project, copy the template from here into the target repo:

```powershell
Copy-Item .\tools\semantic-kg.mjs C:\path\to\project\tools\semantic-kg.mjs
```

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
    "kg:path": "node tools/semantic-kg.mjs path",
    "kg:baseline": "node tools/semantic-kg.mjs baseline"
  }
}
```

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

## High-value roadmap additions

The current template covers deterministic extraction, semantic topic edges, intent-aware query, next-read ranges, impact mode, drift checks with report artifacts, and baseline measurement. The highest-value next additions are:

1. **Agent wiki export**: generate `.semantic-kg/wiki/index.md` plus one markdown page per topic/community so agents can crawl small human-readable pages instead of JSON.
2. **Interactive graph viewer**: generate `.semantic-kg/graph.html` using a local/static vis-network or D3 view with search, filters, and evidence toggles.
3. **Community detection**: cluster graph nodes into project areas and surface god nodes, bridge nodes, and surprising cross-community links.
4. **Watch mode and git hook**: rebuild changed-file indexes on save or post-commit so the graph stays current during multi-agent development.
5. **GraphML / Neo4j / Cypher exports**: allow Gephi, yEd, Neo4j, and other graph tools to consume the project map.
6. **Media enrichment adapters**: add optional local OCR/PDF text extraction and opt-in multimodal captioning, with privacy warnings before any external model use.
7. **MCP server mode**: expose graph query/path/stats over stdio so coding agents can query the graph directly.
8. **Delta reports**: show what changed between graph builds and whether new files created new semantic neighborhoods.

## Clawpilot skill

The reusable **Graph-It** skill lives in `skill/SKILL.md`. Install it by copying the folder into a Clawpilot local skills directory, or keep this repo as the source for team customization.

Recommended trigger language:

- "Build a semantic graph for this repo"
- "Build a local semantic graph for this project"
- "Create a queryable project map"
- "Baseline token reduction with a graph index"
- "Use the semantic graph before grepping"
