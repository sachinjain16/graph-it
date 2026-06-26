# Graph-It Obsidian Export

Graph-It can export a repo graph as a local Obsidian-style vault for humans and AI coding agents.

```powershell
node tools/semantic-kg.mjs obsidian
```

Output:

```text
.semantic-kg/wiki/obsidian/
  Agent Start Here.md
  Graph-It Index.md
  Graph Quality.md
  Backlinks Index.md
  MOCs/
    index.md
    concepts.md
    docs.md
    files.md
    symbols.md
    artifacts.md
    <topic>.md
  concepts/
  docs/
  files/
  symbols/
  artifacts/
  .obsidian/
    app.json
    graph.json
```

## What makes it vault-native

- Stable note filenames include type and a short hash of the graph ID.
- Notes include YAML frontmatter with `graph_it_id`, `type`, `source`, `line`, and `graph-it/*` tags.
- Each note has outbound links and backlinks.
- `Agent Start Here.md` gives AI agents a safe navigation path.
- `MOCs/` contains Map of Content notes by folder/type and semantic topic.
- `Backlinks Index.md` provides a vault-wide relationship index.
- `.obsidian` starter config enables link-safe defaults and graph search for `graph-it` tags.

## Recommended use

1. Run `node tools/semantic-kg.mjs build`.
2. Run `node tools/semantic-kg.mjs quality`.
3. Run `node tools/semantic-kg.mjs obsidian`.
4. Open `.semantic-kg/wiki/obsidian/` as an Obsidian vault.
5. Start from `Agent Start Here.md` or `Graph-It Index.md`.

The vault is generated local operational data. Review before sharing or committing.
