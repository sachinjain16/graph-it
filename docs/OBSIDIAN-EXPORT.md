# Graph-It Obsidian Export

Graph-It can export a vault-friendly markdown graph for human browsing and durable notes.

Run:

```powershell
node tools/semantic-kg.mjs obsidian
```

Output:

```text
.semantic-kg/wiki/obsidian/
```

The export includes:

- YAML frontmatter
- note type folders
- tags from semantic topics
- backlinks to related nodes
- `Graph-It Index.md`
- `Graph Quality.md`

## Folder model

```text
concepts/
docs/
files/
symbols/
artifacts/
```

Use this export when Graph-It output should become a durable, human-editable knowledge vault.
