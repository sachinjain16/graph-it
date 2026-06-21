# Graph-It Ingest and Enrich

Graph-It remains local-first by default. Ingest and enrich are safe scaffolds for mixed-content graph expansion.

## Ingest

```powershell
node tools/semantic-kg.mjs ingest README.md docs
```

This stages supported files into:

```text
.semantic-kg/ingest
```

It does not upload content or call a model.

Supported staging extensions:

- `.md`
- `.txt`
- `.rst`
- `.html`
- `.csv`
- `.json`
- `.docx`
- `.pptx`
- `.xlsx`
- `.pdf`

Binary files should be converted to markdown/text before rich semantic indexing.

## Enrich

```powershell
node tools/semantic-kg.mjs enrich --provider local
```

This writes:

```text
.semantic-kg/enrichment-plan.json
```

The command is plan-only. It does not call a model. Future enrichment should write proposed summaries/relationships for human review before merging into `graph.json`.
