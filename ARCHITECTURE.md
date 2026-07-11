# Graph-It Architecture

Graph-It is a local knowledge graph runtime for AI coding agents. It is designed to sit inside or beside a repo, produce compact evidence-labeled project context, and expose that context through CLI commands, local artifacts, and MCP stdio tools.

## Design goals

- **Agent-agnostic**: useful from Copilot CLI, Claude Code, Cursor, Codex, Clawpilot, and MCP-aware clients.
- **Local-first**: source files and generated graph artifacts stay on the workstation by default.
- **Evidence-aware**: every edge carries an evidence label so agents can distinguish facts from heuristics.
- **Portable**: the runtime is a single dependency-free ESM script that can be bootstrapped into target repos.
- **Enterprise-safe**: generated artifacts are ignored by default and enrichment is explicit/local unless extended.

## Pipeline

```text
walk project
  -> classify files
  -> extract deterministic structure
  -> add local topic relationships
  -> write graph/cache
  -> report/query/export/proof/freshness
  -> serve graph through MCP stdio
```

## Runtime surfaces

| Surface | Role |
|---|---|
| `tools/semantic-kg.mjs` | Portable runtime copied into target repos. |
| `graph-it` | Package CLI alias for the same runtime. |
| `semantic-kg` | Compatibility CLI alias. |
| npm `kg:*` scripts | Repo-local command shortcuts. |
| MCP stdio server | Agent tool interface for graph query/path/node/build/delta/freshness/export/proof/config. |
| Agent-rule packs | Query-first instructions for agents that do not use MCP. |

## Generated artifacts

| Artifact | Purpose |
|---|---|
| `.semantic-kg/graph.json` | Primary local graph for query, impact, path, and MCP tools. |
| `.semantic-kg/cache/` | SHA-based local cache records. |
| `.semantic-kg/quality.{json,md}` | Graph health score, issues, and repair plan. |
| `.semantic-kg/freshness.json` | Auto-refresh state and changed-file diff. |
| `.semantic-kg/session-start.md` | Dev-session kickoff prompt with Graph-It guardrails. |
| `.semantic-kg/delta-report.{json,md}` | Current-vs-previous graph changes. |
| `.semantic-kg/drift-report.{json,md}` | Docs/narrative drift checks. |
| `.semantic-kg/proof/` | Local proof packs with quality and query-compression evidence. |
| `.semantic-kg/exports/` | GraphML, Cypher, SVG, and manifest exports. |
| `.semantic-kg/wiki/` | Agent-readable topic/community pages and Obsidian export. |
| `.semantic-kg/graph.html` | Standalone local graph viewer. |
| `.semantic-kg/enrichment/local-extract/` | Optional local text sidecars. |
| `.graph-it/agent-rules/` | Local query-first instruction packs. |
| `worked/<name>/` | Optional sanitized worked-example scaffolds. |

## Graph model

Nodes represent files, code symbols, components, dependencies, exports, document sections, media placeholders, topics, concepts, and generated knowledge surfaces.

Edges are labeled:

- `EXTRACTED`: deterministic relationship from source structure, symbols, imports, headings, links, references, or metadata.
- `INFERRED`: local heuristic relationship, usually topic or semantic proximity.
- `AMBIGUOUS`: uncertain relationship that should be reviewed before relying on it.

Agents should prefer `EXTRACTED` relationships for high-confidence navigation and treat `INFERRED` / `AMBIGUOUS` relationships as guidance.

## Bootstrap and install

`bootstrap` and `install --project` create a repo-local Graph-It setup:

1. copy the runtime into `tools/semantic-kg.mjs`
2. add `.semantic-kg/` to `.gitignore`
3. add npm `kg:*` scripts when `package.json` exists
4. optionally build immediately
5. optionally install the managed post-commit hook

Existing different runtimes are not overwritten unless `--force` is passed.

## Auto-refresh and freshness

`auto` is a daemon-lite local updater for active development. It re-walks tracked files on an interval, detects added/changed/removed files, refreshes graph artifacts after a debounce window, and writes `.semantic-kg/freshness.json`.

`graph.freshness` exposes the same status over MCP so agents can check whether graph context is fresh before relying on it.

`session-prompt` writes `.semantic-kg/session-start.md`, a reusable kickoff prompt with local/confidential-work guardrails, graph-first navigation rules, and validation expectations.

## Extension points

Graph-It intentionally keeps the default runtime dependency-free. Future adapters should remain optional:

- parser-backed AST extraction
- richer local PDF extraction
- local OCR
- Office extraction beyond ZIP/XML text
- approved model enrichment with explicit privacy confirmation

Adapters should preserve evidence labels and avoid becoming default external upload paths.
