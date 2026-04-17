# Memory Systems Analysis: ENGRAM/AutoMem/Hindsight for km recall

> **See also**: [brain architecture doc](../future/brain.md) — the committed design that incorporates these findings (memory graph with ENGRAM cognitive types, chats as event source, entity schemas, solidification).

Evaluates whether advanced memory system designs could improve km's recall architecture.
Compares current FTS5-based retrieval with three research systems, estimates effort vs accuracy gain.

## Current km Recall Architecture

km recall uses a **flat FTS5-indexed SQLite database** (`~/.claude/session-index.db`):

- **Indexing**: Incremental — new sessions only, 30-day window, multiple content types (messages, plans, summaries, todos, session memory, beads)
- **Retrieval**: FTS5 full-text search with time/project/type filters, results ranked by FTS5 score, deduplicated by session
- **Synthesis**: Optional cheap-model LLM pass extracts decisions, approaches, warnings from raw results
- **Latency**: ~10-50ms search + ~3-6s LLM synthesis (model racing gpt-5-nano vs haiku)

**Strengths**: Fast, simple, reliable. No external dependencies. Handles 30 days of sessions well.

**Limitations**:
- No semantic structure — everything is flat text snippets
- No cognitive type separation (facts, events, instructions mixed together)
- No confidence scoring or cross-session corroboration
- No entity extraction or relationship queries
- No temporal reasoning ("when was X true?")
- FTS5 keyword matching misses semantically similar but lexically different content

## Research Systems

### ENGRAM (77.55% LoCoMo)

Separates memory into three cognitive types: **Episodic** (events), **Semantic** (facts), **Procedural** (instructions). Per-category retrieval with K~25 per type prevents cross-type interference.

Key finding: removing cognitive separation drops accuracy by 31%. This is the single highest-impact design insight across all three systems.

### AutoMem (90.53% LoCoMo)

Hybrid graph+vector dual-storage with 9-signal scoring. Requires FalkorDB + Qdrant infrastructure. Entity types (PERSON, ORGANIZATION, LOCATION, etc.) with temporal/semantic/causal edges. High accuracy but heavy infrastructure requirements.

### Hindsight (91.4% LongMemEval, current SOTA)

Biomimetic 4-network memory: World facts, Experiences, Opinions, Observations. Multi-pathway retrieval (TEMPR) combines semantic similarity, BM25 keyword, entity graphs, temporal filtering, then merges via reciprocal rank fusion.

Key innovation: each network prevents memory type conflicts. Observations are LLM-generated preference-neutral summaries updated when facts change.

## Opportunity Analysis

| Opportunity | System | Effort | Accuracy Gain | Recommendation |
|-------------|--------|--------|---------------|----------------|
| Cognitive type separation | ENGRAM | Low | High (+31%) | **Do first** |
| Confidence accumulation | ENGRAM/AutoMem | Low | Medium | Do second |
| Per-category FTS5 indexes | ENGRAM | Low-Medium | Medium | Do second |
| Multi-pathway retrieval | Hindsight | Medium | High | Do third |
| Entity extraction | AutoMem/Hindsight | High | Medium | Defer |
| Graph storage | AutoMem | High | Medium | Skip |
| Embedding-based search | All three | Medium | Medium | Phase 2 (brain roadmap) |

### Phase 1: Cognitive Type Tags (Low effort, high impact)

**What**: Tag each indexed message/summary with a cognitive type: `fact`, `event`, `instruction`, `decision`. Use a cheap LLM during indexing (already runs summaries) or simple heuristics.

**How**: Add a `category TEXT` column to the FTS5 table. Filter by category during retrieval. Return separate result sets per category (K=25 each) then merge.

**Effort**: ~2-3 hours. SQLite schema change + categorization logic + retrieval filter.

**Expected impact**: Significant. Prevents "how to run tests" instructions from drowning in meeting notes. ENGRAM's ablation study shows this is worth ~31% accuracy.

### Phase 2: Confidence Scoring (Low effort, medium impact)

**What**: Track how many sessions mention the same fact. Weight results by cross-session corroboration count.

**How**: After FTS5 search, group results by semantic similarity (or exact match). Count how many distinct sessions each fact appears in. Boost rank by `log(session_count + 1)`.

**Effort**: ~1-2 hours. Post-processing step on existing results.

**Expected impact**: Medium. Recurring patterns (architecture decisions, preferences) surface above one-off mentions.

### Phase 3: Multi-Pathway Retrieval (Medium effort, high impact)

**What**: Combine FTS5 keyword search with temporal proximity scoring. For any query, run: (1) FTS5 keyword match, (2) recency-weighted results, (3) session-proximity results (messages near other relevant messages). Merge via reciprocal rank fusion.

**How**: Three parallel SQLite queries with different scoring functions, merged with `1/rank` fusion. No external infrastructure needed.

**Effort**: ~4-6 hours. Multiple query paths + fusion logic + tuning weights.

**Expected impact**: High. Temporal context matters — "what did we decide about X?" benefits from recency + keyword + session context.

### Deferred: Entity Extraction & Graph Storage

AutoMem's graph storage and Hindsight's entity extraction are powerful but require:
- External services (FalkorDB, Qdrant) or significant SQLite graph modeling
- LLM extraction pipeline during indexing (expensive, slow)
- Entity resolution logic (deduplication, merging)

> **Update**: km now absorbs Cloudi's memory system (see [brain architecture](../future/brain.md)). Entity extraction will be implemented in km via SPO triples and entity schemas — but as later phases of the roadmap, not in the initial recall improvements.

### Later: Embedding-Based Search

Vector search (semantic similarity) requires:
- Embedding model integration (API calls during indexing + query)
- Vector storage (SQLite doesn't natively support ANN search)
- Significant latency increase

FTS5 with cognitive type separation captures most of the value for session recall. Embeddings are planned as Phase 2 of the [brain architecture roadmap](../future/brain.md#implementation-roadmap) to handle query/storage phrasing mismatch in SPO retrieval.

## Conclusion

km recall's FTS5 architecture is fundamentally sound. The cloudi research (ADR01) validates this — its Phase 1 is also "core type + keyword search." The highest-impact improvements are:

1. **Cognitive type separation** (ENGRAM's key insight) — tag indexed content as fact/event/instruction/decision, retrieve per-category. ~31% accuracy improvement for ~3 hours work.
2. **Confidence accumulation** — boost facts mentioned across multiple sessions. ~2 hours.
3. **Multi-pathway retrieval** (simplified Hindsight) — combine FTS5 + recency + session proximity via rank fusion. ~5 hours.

Total estimated effort for meaningful improvement: ~10 hours across 3 phases. No external infrastructure needed — all SQLite-native.

> **Update**: The full AutoMem/Hindsight architectures (entity extraction, graph storage, embeddings) are now part of km's roadmap via the [brain architecture](../future/brain.md) — km absorbs Cloudi's memory system. The phased approach above remains correct: recall ranking improvements first, SPO memory and entity schemas in later phases.

## References

- [Brain architecture](../future/brain.md) — committed design incorporating these findings
- Cloudi ADR01 memory system spec *(internal: `~/Code/pim/cloudi/specs/active/ADR01/`)*
- [Plain-brain exploration](plain-brain.md) — original exploration (graduated to brain.md)
- km recall implementation: `vendor/bearly/tools/recall.ts`, `recall/search.ts`
