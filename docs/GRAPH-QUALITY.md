# Graph-It Quality

Graph-It quality scoring turns graph generation into an improvement loop.

Run:

```powershell
node tools/semantic-kg.mjs quality
```

Outputs:

- `.semantic-kg/quality.json`
- `.semantic-kg/quality.md`
- `.semantic-kg/quality-summary.json`

## What it checks

| Signal | Meaning |
|---|---|
| Connectivity | Ratio of non-topic nodes connected to the graph |
| Source coverage | Nodes with path/file/summary evidence |
| Orphan nodes | Nodes with no relationships |
| Weak inferred edges | Low-confidence inferred relationships |
| Duplicate labels | Ambiguous node labels |
| God nodes | Over-connected nodes that may need splitting or better typing |

## Grades

| Score | Grade |
|---:|---|
| 90-100 | excellent |
| 75-89 | good |
| 60-74 | needs-attention |
| 0-59 | weak |

## Recommended loop

```powershell
node tools/semantic-kg.mjs build
node tools/semantic-kg.mjs quality
node tools/semantic-kg.mjs obsidian
node tools/semantic-kg.mjs viewer
```
