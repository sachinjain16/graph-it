# Install Graph-It

Graph-It can be used three ways:

1. **Source checkout**: run `node tools/semantic-kg.mjs ...` from this repo.
2. **Package CLI**: run `graph-it ...` after installing from a package or tarball.
3. **Repo-local bootstrap**: copy the portable runtime into any target repo with safe defaults.

## Prerequisites

- Node.js 20+
- Git when using hook installation
- An MCP-capable or instruction-file-capable AI coding agent for agent integration

No external services, model keys, database servers, or native dependencies are required for the default runtime.

## Validate this repo

```powershell
npm run check
npm test
npm run kg:build
npm run kg:quality
npm run kg:mcp:config -- --smoke-test
```

## Bootstrap a target repo

From the Graph-It source repo:

```powershell
node .\tools\semantic-kg.mjs bootstrap ..\target-project --build
```

From an installed/package CLI:

```powershell
graph-it install --project ..\target-project --build
```

Bootstrap does the following:

- installs `tools\semantic-kg.mjs`
- adds `.semantic-kg/` to `.gitignore`
- adds npm `kg:*` scripts when `package.json` exists
- optionally runs `build` with `--build`
- optionally installs a managed post-commit hook with `--with-hook`
- avoids replacing an existing different Graph-It runtime unless `--force` is passed

## Optional companion: Memorize-It

Graph-It works on its own. Memorize-It is a separate optional companion for long-term session memory and repo-local learnings.

Use Graph-It for query-first repo navigation:

```powershell
graph-it install --project ..\target-project --build
```

Then optionally add Memorize-It for prior-work context:

```powershell
cd ..\target-project
ai-memory install-hooks --project .
ai-memory learn --scope local --project . --category convention --text "<first repo convention>"
```

Recommended default agent rhythm:

```powershell
graph-it query --intent=code "<symbol or feature>"
ai-memory inject --scope both --project . --query "<new task>" --max-chars 4000
```

## Configure AI coding agents

From the target repo:

```powershell
npm run kg:agent-rules -- all
npm run kg:mcp:config -- --smoke-test
```

Use the generated outputs as appropriate:

| Output | Use |
|---|---|
| `.graph-it\agent-rules\generic-graph-it.md` | Generic AGENTS.md-style guidance. |
| `.graph-it\agent-rules\copilot-graph-it.md` | GitHub Copilot CLI guidance. |
| `.graph-it\agent-rules\claude-graph-it.md` | Claude Code guidance. |
| `.graph-it\agent-rules\cursor-graph-it.mdc` | Cursor rule content. |
| `.graph-it\agent-rules\codex-graph-it.md` | Codex-style agent guidance. |
| `kg:mcp:config` output | MCP server snippets for MCP-aware clients. |

Review generated agent rules before copying them into client-specific instruction locations.

## Recommended local workflow

```powershell
npm run kg:build
npm run kg:quality
npm run kg:proof -- "architecture" "security privacy" "install"
npm run kg:query -- --intent=code "TargetSymbol"
npm run kg:delta
```

Optional expansion commands:

```powershell
npm run kg:export -- all
npm run kg:enrich -- --provider local --extract-text
npm run kg:examples -- --name target-project --public
```

Generated artifacts are local operational data. Review before publishing or sharing.

## Package smoke check

Before publishing a package:

```powershell
npm pack --dry-run
```

The package exposes two CLI names:

- `graph-it`
- `semantic-kg`

Both execute the same runtime.
