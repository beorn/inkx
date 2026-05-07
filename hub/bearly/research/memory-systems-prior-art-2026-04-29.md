# Memory systems prior-art notes — 2026-04-29

Combined research from two sources surfaced this session:

1. **/csw memory-systems** background agent (12 systems, ~3,800 words)
2. **testfix-2 tribe message** (4 additional directions: Collaborative Memory, MIRIX, Yegge bd-compact, Bedrock multi-tenant RAG)

Saved here to keep the design conversation focused on eval-first build. Re-read before:

- Building Tier 4 mem-dream (session-end consolidation)
- Adding ENGRAM cognitive type tagger
- Designing the multi-source memory layer (`_local/` + `<source>/`)

## Key direction-shaping findings

### Hybrid retrieval has won everywhere

Hindsight, post-2025 Mem0, Zep, Notion, Cody — all combine ≥3 of: semantic embeddings + BM25/keyword + entity/graph + temporal + reranker. **km is single-modality (FTS5 BM25).** This is the gap.

### Letta's tiered memory ≈ our S_t + Δ thesis

Letta has core (always-in-context, agent-editable, 2K chars) + archival (vector DB, agent-searches) + recall (full message history) + buffer (FIFO). Our `S_t` block ≈ Letta core. Filesystem-memory variant beat graph variant on LoCoMo (74% vs 68.5%) — graphs aren't worth extraction noise for general agent memory.

### Mem0 deleted graph support entirely (-4000 LOC)

For "+20 LoCoMo / +26 LongMemEval". Hybrid (semantic + BM25 + entity matching) won. Single biggest signal in the field: **don't build a graph store for general agent memory**.

### Inspectability is the silent feature

Cody shows "Used context: 7 items" with file paths. Notion shows source citations. Smart Connections stores `.ajson` you can `cat`. Pieces and ChatGPT-memory are loathed when opaque. The pointer envelope with `reason=`, `from=`, `summary=` directly supports this.

### ENGRAM cognitive types give +31% accuracy

Episodic / semantic / procedural / instruction / opinion. Universal across systems (different vocabulary, same insight). MIRIX extends with Resource + Knowledge Vault as separate modules.

### Bi-temporal model for evolving facts (Zep/Graphiti)

`(transaction_time, valid_time)` interval per assertion. Only architecture that correctly answers "where did Alice work as of 2025-06-01?" vs "where does Alice work now?". Already in brain.md as `validity TEXT` (JSON [from, to]).

### Yegge's bd compact (testfix-2 surfaced)

LLM summarizes old closed beads → replaces detailed body with concise summary → marks compacted. Same shape as our session-end consolidation primitive. Two consumers (beads + sessions) could share one compaction pipeline.

### Bedrock multi-tenant RAG

Unified retrieval, filter on demand by tenant. We do this already (project_path filter). Validates the "store unified, filter at retrieval" architecture.

## Anti-patterns (don't adopt)

- **ChatGPT-style aggregated dossier** — drifts, leaks across contexts, opaque (Simon Willison reaction)
- **Graph-store-as-primary** — Mem0 deleted; not worth extraction noise for our scope
- **Frontier benchmark chase** — Hindsight 91.4% LongMemEval needs 4 retrievers + reflection layer + neural reranker; over-engineered for personal recall
- **Always-on injection on every prompt** — ChatGPT does this; users hate it. Active+passive blend wins.

## Mapping to recall v3 build order

| Prior-art finding                                    | Bead / direction                                            | Status                                    |
| ---------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| Letta core (always-in-context)                       | recall-session-state-block                                  | designed, not built                       |
| Hybrid retrieval (RRF)                               | recall-hybrid-rrf                                           | designed, not built                       |
| Inspectable retrieval (Cody pills, Notion citations) | recall-pointer-mode + reason/from/summary envelope          | designed, not built                       |
| ENGRAM cognitive types                               | recall-engram-typing                                        | designed, folds into rerank LLM call      |
| MIRIX multi-module extension                         | future — extend ENGRAM tagger w/ Resource + Knowledge Vault | future                                    |
| Bi-temporal validity                                 | brain.md Phase 1 — validity TEXT                            | already planned                           |
| Yegge bd-compact                                     | recall-session-end-consolidation (postponed)                | postponed per user, but pattern validated |
| Multi-tenant filter                                  | already implemented (project_path)                          | done                                      |
| Mem0 graph deletion                                  | NOT a direction; we don't build a graph store               | confirmed                                 |

## Active eval-first focus

Building order (current):

1. ✅ Realistic-prompt eval corpus (Axis D) — done
2. ✅ Hot-path eval harness (`tools/recall-eval-hotpath.ts`) — done
3. → Use eval to iterate on existing salience gate (5 false_skips diagnosed)
4. → Stage in S_t block + hybrid retrieval as the eval guides
5. Re-enable hook only when eval scores pass thresholds on Axis D

Postponed: session-end consolidation, ENGRAM tagger refinements, multi-source `_local/<source>/` design — all good directions, none on the critical path until eval can score them.

## Source links

### From /csw research

- ChatGPT memory dump prompt-injection trick: https://embracethered.com/blog/posts/2025/chatgpt-how-does-chat-history-memory-preferences-work/
- Simon Willison on ChatGPT memory: https://simonwillison.net/2025/May/21/chatgpt-new-memory/
- Letta blog: https://www.letta.com/blog/agent-memory
- Letta benchmark: https://www.letta.com/blog/benchmarking-ai-agent-memory
- Mem0 paper: https://arxiv.org/html/2504.19413v1
- Mem0 graph→entity migration: https://docs.mem0.ai/platform/features/graph-memory
- Hindsight: https://arxiv.org/html/2512.12818v1
- Hindsight VentureBeat: https://venturebeat.com/data/with-91-accuracy-open-source-hindsight-agentic-memory-provides-20-20-vision
- Cursor indexing: https://cursor.com/docs/context/codebase-indexing
- Cody context: https://sourcegraph.com/docs/cody/core-concepts/context
- Cognee: https://github.com/topoteretes/cognee
- Zep paper: https://arxiv.org/abs/2501.13956
- Pieces LTM-2: https://pieces.app/blog/what-is-new-ltm-2
- Smart Connections: https://github.com/brianpetro/obsidian-smart-connections
- Notion vector search: https://www.notion.com/blog/two-years-of-vector-search-at-notion

### From testfix-2 tribe message

- Multi-source memory architectures: https://emergentmind.com/topics/memory-mechanisms-in-llm-based-agents
- Multi-agent shared graph memory: https://neo4j.com/nodes-ai/agenda/multi-agent-shared-graph-memory-building-collective-knowledge-for-agents
- Multi-tenant RAG (Bedrock): https://aws.amazon.com/blogs/machine-learning/multi-tenant-rag-with-amazon-bedrock-knowledge-bases
- Yegge introducing beads: https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system

