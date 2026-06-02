# Graph-It roadmap

These additions are likely to deliver the most value for Clawpilot and team use.

## 1. Agent wiki export

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

## 2. Interactive graph viewer

Generate `.semantic-kg/graph.html` with search, node type filters, topic filters, and evidence toggles for `EXTRACTED` vs `INFERRED`.

## 3. Community and god-node report

Add a compact project intelligence report:

- highest degree nodes
- bridge nodes across communities
- surprising cross-topic links
- suggested questions
- stale or orphaned files

## 4. Watch mode and post-commit hook

Support:

```powershell
node tools/semantic-kg.mjs watch
node tools/semantic-kg.mjs hook install
```

A fast changed-file pass would keep code/doc graphs fresh during active agent work.

## 5. Graph exports

Add export modes:

```powershell
node tools/semantic-kg.mjs export graphml
node tools/semantic-kg.mjs export cypher
node tools/semantic-kg.mjs export svg
```

## 6. Optional media enrichment

Keep deterministic metadata by default. Add explicit opt-in adapters for:

- local OCR
- local PDF text extraction
- image captioning
- multimodal LLM captioning with privacy confirmation

## 7. MCP server mode

Expose graph commands over stdio:

- `graph.query`
- `graph.path`
- `graph.stats`
- `graph.node`
- `graph.neighborhood`

## 8. Delta reports

Compare the latest graph to the previous graph and report:

- new files
- removed files
- changed semantic neighborhoods
- new inferred edges
- newly isolated nodes
