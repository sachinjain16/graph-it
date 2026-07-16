# Token-aware design notes

Graph-It exists so an AI coding agent can find the few files and line ranges that
matter before it starts reading source. This document explains where an agent's context
budget tends to go, how Graph-It is designed to spend less of it, and the design
decisions behind the context packer.

Guiding principle: **build it right.** The tool measures its own footprint honestly and
prefers a conservative estimate over a flattering one. Graph-It makes no guaranteed
savings promises — real benefit depends on repo size, query quality, and how the agent
uses the results.

## 1. Where context budget goes

Two surfaces matter.

### The agent's coding session

| Sink | Relative weight | Driver |
|---|---|---|
| Raw file reads | High | Opening whole files or globbing to find one symbol. |
| Redundant re-reads across turns | Medium | Re-opening the same file because nothing tracks what was already seen. |
| Directory scans and broad search | Low–Medium | Repeated recursive listings and wide grep. |
| Conversation history growth | Medium | Prior reads persist in the window until compaction. |
| Tool schemas and system prompt | Low | Fixed per-turn overhead. |
| Model output | Varies | Restated code, ceremony, and deep reasoning on routine steps. |

Graph-It targets the first three directly by turning "read files to orient" into "query
a compact graph, then read only what it points to."

### Graph-It's own footprint

The graph artifact itself has a cost. On a non-trivial repo `graph.json` is large, so the
design assumes it is **never read whole** — only queried. If an agent loads the full
graph, the tool stops helping. The gating below exists to prevent exactly that.

## 2. How Graph-It keeps context small

1. **Query-first navigation.** `query` ranks nodes and returns compact hits plus
   suggested next-read line ranges, so the agent reads targeted ranges instead of files.
2. **Importance-aware ranking.** Ranking blends keyword/identifier matching with a
   centrality signal (PageRank over the extracted edge graph, biased toward the nodes
   that match the query), so well-connected, query-relevant nodes rank above incidental
   keyword hits.
3. **Budgeted context packing.** `pack` fills a token budget by graceful degradation:
   top hits at full detail, the next band in an extractive "compressed" form, and the
   remainder collapsed into a single reversible pointer. It stays within the budget give
   or take one small item.
4. **Reversibility.** Every packed item carries a `reloadWith` id. Compressed and
   offloaded material is never lost — the agent reloads the original with `graph.node`.
5. **De-duplicated reads.** Overlapping next-read line ranges are merged within and
   across hits so the same lines are not suggested twice.
6. **Session de-duplication (MCP).** The MCP server keeps a session-scoped ledger of
   already-delivered items; a repeated pack collapses previously sent items to reversible
   pointers instead of re-emitting their content.
7. **Graph gating.** Each build stamps `graph.json` with `_approxTokens` and a warning,
   `graph.stats` reports `graphApproxTokens`, and the session prompt plus agent-rule packs
   instruct agents never to read the raw graph.
8. **Output discipline.** The session prompt and agent rules ask the agent to avoid
   restating unchanged code and to reserve extended reasoning for genuinely hard steps.

## 3. Token estimation

Token counts come from a dependency-free approximation that weights identifiers,
numbers, punctuation, and whitespace separately, and never reports below a plain
character-based floor. This is intentionally conservative for code, where punctuation and
identifiers tokenize densely. The numbers are a local planning aid for budgeting the
context pack — not an exact tokenizer count, and not a savings claim. If exact counts are
ever needed, an explicit tokenizer could be added behind an opt-in flag without changing
the default dependency-free behavior.

## 4. Design decisions

- **Dependency-free and local by default.** No model calls and no network in the default
  runtime. Compression is **extractive** (signatures, first lines, anchors, line ranges),
  never a learned/model-based compressor, so the local-first trust boundary holds.
- **Reversibility over deletion.** Reducing detail must always be recoverable via
  `graph.node`; the packer never silently drops content it cannot restore.
- **Honest measurement.** The proof pack and context pack report measured local sizes and
  conservative token estimates. They do not present per-query figures as end-to-end
  session guarantees.

## 5. What ships today

All of the following are implemented and covered by `tests/smoke.mjs`:

- Conservative token estimator and a plain floor.
- `graph.json` gating: `_warning` + `_approxTokens` header, `graphApproxTokens` in stats,
  and raw-read prohibition in the session prompt and agent-rule packs.
- Importance-aware ranking (personalized PageRank blended into scoring).
- Budgeted, graceful-degradation context packing (full → compressed → reversible offload).
- Extractive `compressed` bucket and `reloadWith` reversibility on every packed item.
- Next-read range de-duplication.
- MCP session ledger that collapses repeated packs to reversible pointers.
- Output-discipline guidance in the session prompt and agent rules.

## 6. Intentionally out of scope

- Learned or model-based prompt compression. It would require a model and outbound calls,
  which breaks the dependency-free, local-first default. Compression stays extractive.
