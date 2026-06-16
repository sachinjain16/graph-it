# Graph-It roadmap

These additions are likely to deliver the most value for Clawpilot and team use.

## Today's shipped backlog

- Agent wiki export for compact topic and community pages.
- Community and god-node report for bridge nodes, surprising links, and stale/orphaned files.
- Interactive graph viewer for local search, filters, and neighborhood inspection.
- Watch mode and managed post-commit hook for keeping local artifacts fresh.
- MCP server mode for agent access to graph query, path, stats, node, neighborhood, and build tools.
- Delta reports for changed files, semantic neighborhood movement, new inferred edges, newly isolated nodes, and recommended rereads.
- MCP Config Helper for copy-ready MCP client configuration and local smoke checks.

## Building next

- Graph Quality Score for trust, coverage, drift, and noise signals before agents rely on a graph.

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

## 1. Graph exports

Add export modes:

```powershell
node tools/semantic-kg.mjs export graphml
node tools/semantic-kg.mjs export cypher
node tools/semantic-kg.mjs export svg
```

## 2. Optional media enrichment

Keep deterministic metadata by default. Add explicit opt-in adapters for:

- local OCR
- local PDF text extraction
- image captioning
- multimodal LLM captioning with privacy confirmation

