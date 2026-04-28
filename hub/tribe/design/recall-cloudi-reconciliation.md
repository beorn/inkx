# km-tribe.recall ↔ cloudi/ADR01 reconciliation

> **Date**: 2026-04-28
> **Bead**: `km-tribe.recall` (epic), see also `km-tribe.recall-eval-corpus`, `km-tribe.recall-thought`, `km-tribe.recall-deep-rounds`
> **Triggered by**: discovery during 2026-04-28 design session that cloudi has a fully-specced memory system (`cloudi/specs/active/ADR01/`, 861 + 2661 lines) and `docs/future/brain.md` already commits to absorbing it.

This note reconciles the recall-thought / deep-rounds work with the prior cloudi memory specs. tl;dr: they're complementary, not competing; the eval-corpus + runner is genuinely new infrastructure that serves both.

## Two layers, not two competing systems

| Layer | What it is | Where it lives | Status |
|---|---|---|---|
| **Substrate** | The store + retrieval primitives. SPO statements with ENGRAM cognitive types, entities, embeddings, FTS5 session-history, etc. | cloudi `ADR01-memory-system.md` (canonical spec). km absorbs via `docs/future/brain.md`. Today: FTS5 session-history is the only shipped piece. | Spec mature, implementation partial |
| **Active layer** | The thing that DECIDES what to retrieve, when, in what shape. Hypothesis-driven inner-loop, compiled state across turns, diff-emission. | Net-new in `km-tribe.recall-thought`, `km-tribe.recall-deep-rounds`. None of cloudi/Letta/Hindsight has this. | Designed in this epic |
| **Eval** | Measures substrate AND active layer. Three axes (conversational / external-data / per-thread overlap). Public benchmarks (LongMemEval, LoCoMo) for substrate sanity. | Net-new: `tools/recall-eval.ts` + `hub/tribe/eval/recall-corpus.yaml`. | v0 shipped 2026-04-28 |

## Substrate maturation

Cloudi's 4-phase plan, applied to km:

| Phase | Cloudi calls it | km equivalent | Status |
|---|---|---|---|
| 0 | (pre-Phase 1) | FTS5 session-history index | shipped |
| 1 | Statements | SPO triples + cognitive types + provenance | speccéd in brain.md, not yet implemented |
| 2 | Embeddings | Per-category semantic search, ranked merge | not yet |
| 3 | Entities | Modeled memory (PIM types) | not yet |
| 4 | Confidence | Cross-source accumulation | not yet |

km-tribe.recall's substrate-side work (multipath-rrf, cognitive-rerank, drop-synthesis) operates on Phase 0 (FTS5) and is gradually subsumed as Phase 1+ ships. Specifically:

- `km-tribe.recall-cognitive-rerank` is a **read-side ENGRAM approximation** for Phase 0. Phase 1 makes it native (statements ARE typed at ingest). Close cognitive-rerank when Phase 1 ships.
- `km-tribe.recall-multipath-rrf` (Hindsight TEMPR pattern) is **read-side** at any phase. Composes with all 4 phases. Keep.
- `km-tribe.recall-drop-synthesis` is **/pro override** for the ambient path. Independent of phase. Keep.

## Active layer is new territory

None of {cloudi/ADR01, Hindsight, Letta, Mem0, Zep, A-MEM, EmergenceMem, OpenMemory, ENGRAM} has the active-layer pattern km-tribe.recall is designing:

1. **Hypothesis-driven inner loop**: each round of retrieval forms an explicit hypothesis ("user wants concept X, episodic event Y, procedure Z"), tests via targeted search, evaluates evidence, refines. Closer to ReAct/Reflexion than to retrieval.
2. **Compiled state across turns**: persistent prompt-cached workspace held by a sub-agent; structured as ENGRAM-shaped (concepts/timelines/procedures) — same shape as cloudi statements but session-scoped.
3. **Diff-emission**: only the delta reaches the host agent. Not full state, not raw search results. Suppression by novelty + salience + confidence.

These work AT ANY PHASE of the substrate. The same active layer drives FTS5 (today) and SPO statements (after Phase 1) and Phase 4 confidence-accumulated entities (eventually).

## Eval-corpus design rationale

`tools/recall-eval.ts` + `hub/tribe/eval/recall-corpus.yaml` is the missing evaluation primitive across the whole stack:

- **Public-comparable substrate floor**: corpus pairs map to LongMemEval-shaped questions. Substrate variants are gradeable against published numbers (Letta 74%, Hindsight 91.4%).
- **Private adversarial gate**: corpus also has km-specific token-overlap traps (the `expected_irrelevant_session_ids` field). Catches drift the public benchmarks miss.
- **Three axes**: A=conversational, B=external-data integration (beads/docs/commits — novel), C=per-thread overlap (compiled-state value test — novel).

Cloudi's ADR01 Appendix A mentions LongMemEval as the validation benchmark but has no executable runner. km-tribe.recall's runner is reusable for both projects.

## What this means for the bead set

Closed:
- `km-tribe.recall-compiled-state` — folded into `recall-thought` earlier today.

Keep + reference cloudi:
- `km-tribe.recall-eval-corpus` — runner is substrate-agnostic, serves cloudi too. README updated to cite ADR01 §Architecture and REF01 §Benchmarks.
- `km-tribe.recall-multipath-rrf` — Hindsight TEMPR read-side adoption, composes with cloudi Phase 2.
- `km-tribe.recall-cognitive-rerank` — interim read-side ENGRAM until cloudi Phase 1 ships in km. Marked as superseded-on-Phase-1.
- `km-tribe.recall-thought` — active layer; cloudi-substrate-agnostic. Compiled state's data structure aligns with cloudi statements (SPO triples with ENGRAM categories).
- `km-tribe.recall-deep-rounds` — active layer's inner loop. Cloudi-substrate-agnostic.
- `km-tribe.recall-salience-trigger` — when-to-fire. Cloudi-substrate-agnostic.
- `km-tribe.recall-drop-synthesis` — ambient-path tuning. Independent.
- `km-tribe.recall-eval-longmemeval` — substrate sanity floor. Reuses runner.
- `km-tribe.recall-eval-external-data` — Axis B. km-specific.

Reference for absorption work:
- The km-side absorption of cloudi ADR01 lives in `docs/future/brain.md` and the deferred bead `[DEFERRED] [P4] km-tools.* Agent memory: implement Cloudi ADR01 SPO memory system for km`. Substrate work happens there; this epic operates on whatever substrate is shipped.

## Open question

Is there value in coordinating the cloudi-absorption bead with this epic? Likely yes — the active layer would land more cleanly on Phase 1 statements than on FTS5 alone. But that's a sequencing question for after eval-corpus produces real numbers.
