# Graph-It Security and Privacy

Graph-It is designed for confidential engineering and AI coding-agent workflows. The default runtime is local-first: it does not upload code, docs, media, graph artifacts, or metadata to external services.

## Default trust boundary

| Boundary | Default behavior |
|---|---|
| Input | Files under the current project root. |
| Output | Generated artifacts under ignored local folders. |
| Network | No outbound network calls by default. |
| Models | No external model calls by default. |
| MCP | stdio transport only. |
| Hooks | Local `node tools/semantic-kg.mjs ...` commands only. |

Anything that reads Graph-It artifacts and sends them elsewhere is outside the default Graph-It trust boundary and should follow your organization's data handling rules.

## Generated artifact handling

Graph-It artifacts can reveal architecture, file paths, symbol names, topics, and inferred relationships. Treat these as local operational data unless explicitly reviewed for sharing.

Ignored by default:

- `.semantic-kg/`
- `.graph-it/`

Review before sharing or committing:

- `.semantic-kg/exports/`
- `.semantic-kg/proof/`
- `.semantic-kg/wiki/`
- `.semantic-kg/graph.html`
- `worked/<name>/`

Use `examples --public` only as a scaffold. Human review is still required before publishing.

## Evidence labels

Every relationship should carry one of:

- `EXTRACTED`: directly supported by deterministic source structure or metadata.
- `INFERRED`: locally inferred heuristic/semantic relationship.
- `AMBIGUOUS`: uncertain relationship requiring human review.

Agents should not treat inferred relationships as authoritative facts.

## Local enrichment

`enrich --provider local` creates a plan only. `enrich --provider local --extract-text` writes local sidecars for:

- text-like files
- basic embedded PDF text when available
- ZIP/XML-based `.docx`, `.pptx`, and `.xlsx` text when available

It does not call a model or move data outside the repo.

Future adapters should:

1. prefer local extractors first
2. require explicit approval before any external model call
3. preserve evidence labels
4. record provider/source metadata
5. avoid becoming the default path

## Agent rules and MCP

`agent-rules` writes local instruction packs under `.graph-it/agent-rules/`. Review before copying them into assistant-specific config locations.

`mcp` exposes local graph tools over stdio. The MCP host controls what tool results are shown or sent elsewhere; use clients that respect your data boundary.

## Reporting issues

Do not include confidential graph artifacts, source snippets, customer data, credentials, or private file paths in public issues. Share sanitized reproduction steps instead.
