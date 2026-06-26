# Graph-It roadmap

These additions are prioritized for enterprise AI coding-agent use across MCP-capable clients and instruction-file-based agents. Clawpilot is one supported client, not the only target.

## Today's shipped backlog

- Agent wiki export for compact topic and community pages.
- Vault-native Obsidian export with stable note IDs, MOCs, backlinks index, agent entry note, and starter `.obsidian` config.
- Community and god-node report for bridge nodes, surprising links, and stale/orphaned files.
- Interactive graph viewer for local search, filters, and neighborhood inspection.
- Watch mode and managed post-commit hook for keeping local artifacts fresh.
- MCP server mode for agent access to graph query, path, stats, node, neighborhood, and build tools.
- Delta reports for changed files, semantic neighborhood movement, new inferred edges, newly isolated nodes, and recommended rereads.
- MCP Config Helper for copy-ready MCP client configuration and local smoke checks.
- Graph Quality Score for trust, coverage, drift, and noise signals before agents rely on a graph.
- Enterprise bootstrap command for safe repo-local installation, npm script setup, `.semantic-kg/` ignore rules, optional build, and optional hook install.
- Enterprise trust docs for architecture, local-first security, artifact boundaries, evidence labels, and enrichment rules.
- Graph export pack for GraphML, Cypher/Neo4j, and SVG local artifacts.
- Proof pack for local graph quality, representative queries, and context-reduction proxy evidence.
- Dependency-free smoke test and GitHub Actions CI.
- Local enrichment sidecars for text-like files and basic embedded PDF text without external calls.
- Package-friendly `graph-it install` CLI alias and npm package metadata.
- Stronger JS/TS structural extraction for imports, requires, re-exports, and explicit exports.
- Agent-rule pack generator for generic, Copilot CLI, Claude Code, Cursor, and Codex workflows.
- Sanitized worked-example generator for reviewed public proof artifacts.
- Local Office ZIP/XML text extraction for `.docx`, `.pptx`, and `.xlsx`.

## Building next

- Publish reviewed sanitized worked examples and screenshots from non-confidential repos.
- Approved richer local media adapters for OCR and stronger PDF extraction.
- Optional parser-backed AST adapters for JS/TS and Python when dependency policy allows.

## Shipped: Agent wiki export

Generate `.semantic-kg/wiki/index.md` plus topic/community pages. This is likely the highest ROI addition because agents can navigate compact markdown pages without parsing the full graph JSON.

Expected output:

```text
.semantic-kg/wiki/
  index.md
  topics/
    architecture.md
    build-and-deploy.md
    security-and-privacy.md
```

## Shipped: Vault-native Obsidian export

Generate `.semantic-kg/wiki/obsidian/` as a local Obsidian-style vault:

```powershell
node tools/semantic-kg.mjs obsidian
```

The vault includes:

- stable note filenames with graph ID hashes
- YAML frontmatter and `graph-it/*` tags
- outbound links and backlinks per note
- role summaries, source excerpts, relationship confidence, neighborhood diagrams, and agent prompts per note
- `Agent Start Here.md`
- `Graph-It Index.md`
- `Graph Quality.md`
- `Backlinks Index.md`
- MOCs by note type and semantic topic
- minimal `.obsidian` starter config

## Shipped: Community and god-node report

The `wiki` command writes `.semantic-kg/wiki/community-report.md` with:

- highest degree nodes
- bridge nodes across communities
- surprising cross-topic links
- suggested questions
- stale or orphaned files

## Shipped: Interactive graph viewer

The `viewer` command writes `.semantic-kg/graph.html`, a standalone local SVG viewer with search, node type filters, topic filters, evidence toggles, and click-through node neighborhood details.

## Shipped: Watch mode and post-commit hook

Graph-It now supports:

```powershell
node tools/semantic-kg.mjs watch
node tools/semantic-kg.mjs hook install
```

A fast changed-file pass would keep code/doc graphs fresh during active agent work.

## Shipped: MCP server mode

Graph-It now runs as a dependency-free MCP stdio server:

```powershell
node tools/semantic-kg.mjs mcp
```

Exposed MCP tools:

- `graph.query`
- `graph.path`
- `graph.stats`
- `graph.node`
- `graph.neighborhood`
- `graph.build`
- `graph.delta`
- `graph.mcp_config`

This lets coding agents query `.semantic-kg/graph.json` directly before opening raw source files.

## Shipped: Delta reports

Graph-It now preserves `.semantic-kg/previous-graph.json` before each new build and compares it with `.semantic-kg/graph.json`:

```powershell
node tools/semantic-kg.mjs delta
```

The report writes `.semantic-kg/delta-report.json` and `.semantic-kg/delta-report.md` with:

- added, removed, and changed files
- added and removed nodes or edges
- changed semantic neighborhoods
- new inferred edges
- newly isolated nodes
- topic movement
- recommended rereads for agents

## Shipped: MCP Config Helper

Graph-It now generates local MCP configuration for the current project:

```powershell
node tools/semantic-kg.mjs mcp-config --smoke-test
```

The helper:

- validates that the local Graph-It tool and graph artifact exist
- emits generic, Claude Desktop, and Clawpilot-compatible MCP snippets
- smoke-tests `graph.stats` and `graph.delta` when requested
- returns the same configuration through MCP as `graph.mcp_config`

## Shipped: Graph Quality Score

Graph-It now writes `.semantic-kg/quality.json`, `.semantic-kg/quality.md`, and `.semantic-kg/quality-summary.json`:

```powershell
node tools/semantic-kg.mjs quality
```

The score covers connectivity, source coverage, orphan nodes, weak inferred edges, duplicate labels, god-node candidates, and a repair plan.

## Shipped: Enterprise bootstrap

Graph-It now bootstraps another repo with safe defaults:

```powershell
node tools/semantic-kg.mjs bootstrap ..\target-repo --build
```

Bootstrap:

- installs `tools\semantic-kg.mjs`
- adds `.semantic-kg/` to `.gitignore`
- adds npm scripts when `package.json` exists
- can install the managed post-commit hook with `--with-hook`
- avoids overwriting an existing different tool unless `--force` is passed

## Shipped: Enterprise trust docs

Graph-It now includes:

- `ARCHITECTURE.md` for the local graph pipeline, artifact lifecycle, and command roles
- `SECURITY.md` for trust boundaries, generated artifact handling, evidence labels, hooks, and opt-in enrichment rules

## Shipped: Graph exports

Graph-It now writes local exports under `.semantic-kg/exports/`:

```powershell
node tools/semantic-kg.mjs export all
```

Outputs include `graph.graphml`, `graph.cypher`, `graph.svg`, and `manifest.json`.

## Shipped: Proof pack

Graph-It now writes `.semantic-kg/proof/proof.json` and `.semantic-kg/proof/proof.md`:

```powershell
node tools/semantic-kg.mjs proof "architecture" "security privacy" "MCP config"
```

The proof pack captures graph health, representative query hits, output size, raw-file size proxy, and reduction ratios.

## Shipped: Smoke test and CI

Graph-It now includes a dependency-free smoke test:

```powershell
npm test
```

The test bootstraps a temporary repo and validates build, query, quality, export, proof, local enrichment, and MCP config smoke checks. GitHub Actions runs `npm run check` and `npm test`.

## Shipped: Local extraction sidecars

Graph-It now supports:

```powershell
node tools/semantic-kg.mjs enrich --provider local --extract-text
```

This creates local sidecars under `.semantic-kg/enrichment/local-extract/` for text-like files and basic embedded PDF text when available.

## Shipped: Package install metadata

Graph-It now exposes package CLI aliases:

```powershell
graph-it install --project ..\target-repo --build
semantic-kg install --project ..\target-repo --build
```

The `install` command wraps enterprise bootstrap for package users.

## Shipped: Agent-rule packs

Graph-It now writes query-first instruction packs:

```powershell
node tools/semantic-kg.mjs agent-rules all
```

Outputs are local under `.graph-it/agent-rules/`.

## Shipped: Sanitized examples

Graph-It now creates reviewed-example scaffolds:

```powershell
node tools/semantic-kg.mjs examples --name graph-it --public
```

Outputs are written under `worked/<name>/` and still require human review before publishing.

## 1. Optional richer media enrichment

Keep deterministic metadata by default. Add explicit opt-in local adapters for:

- local OCR
- stronger local PDF text extraction
- multimodal LLM captioning only with privacy confirmation

