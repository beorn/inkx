# Recall Evaluation Corpus

Labeled adversarial corpus + runner for measuring km-tribe.recall (Tiers 1-4) precision/recall on real conversational prefixes against the actual session-history FTS5 index.

Bead: `km-tribe.recall-eval-corpus`.

## Why this exists

The Step 1 hypothesis test (manual eyeball ledger, 5-min polling probe) hit its ceiling at ~4 cycles in a live session: each cycle was clearly noise-leaning, but we couldn't tell **why** without ground truth. Adding explainability fields (Strategy / rationale / matched= / rank — commit `d43f98e7d`) helped a human grader interpret one cycle, but didn't scale to "does change X help across the corpus?"

Without an eval primitive, every other Tier 3 improvement is unfalsifiable. With one, every improvement becomes an A/B against a fixed corpus.

## What gets measured

Three independent axes — published memory benchmarks (LongMemEval, LoCoMo) only cover the first; axes B and C are novel territory.

### Axis A — Conversational retrieval (Q1: per-query precision/recall)

For each pair `(conversation_prefix, expected_relevant_session_ids[], expected_irrelevant_session_ids[])`:

- Run the recall pipeline as it would fire today
- Score: did `expected_relevant` appear in top-K? Did `expected_irrelevant` appear?
- Aggregate: precision@5, recall@5, MRR for relevant; trap-hit rate for irrelevant

This is what most retrieval evals measure. It tells us if the system can pick the right past **conversation** snippet. LongMemEval and LoCoMo provide an external sanity floor on this axis — see `km-tribe.recall-eval-longmemeval`.

### Axis B — External-data integration (km-tribe.recall-eval-external-data)

km integrates substrates the published benchmarks ignore: beads, design docs, git history, ambient streams, future LSP. Pairs are `(conversation_prefix, expected_external_artifacts[])` where artifacts have a `kind` (bead / doc / commit / file).

Tracked under sibling bead `km-tribe.recall-eval-external-data`. Same runner, different corpus, scored per-kind. This axis is where km's design exceeds the published systems' problem definition.

### Axis C — Per-thread redundancy (Q2: compiled-state value test)

For each multi-turn pair `(conversation_thread_with_N_turns, expected_relevant_per_turn[][])`:

- Run the recall pipeline at each turn boundary
- Measure overlap of surfaced top-K across consecutive turns
- High overlap (>60%) → compiled-state caching is a real optimization
- Low overlap (<30%) → each turn surfaces fresh material, compiled-state is over-engineering

This question is the user's clarification on 2026-04-27: *compiled-state is a multi-turn optimization, not a foundational requirement. It earns its keep only if the same conversation thread keeps benefiting from the same retrieved context.*

None of LongMemEval / LoCoMo / ENGRAM / AutoMem / Hindsight measures this — they're passive memory systems with no sub-agent. mem-thought (km-tribe.recall-thought) is novel on this axis.

## Corpus format

`recall-corpus.yaml` — one entry per pair:

```yaml
- id: pair-001
  kind: single-query                    # or: multi-turn
  conversation_prefix: |
    [USER] why does column wrapping fail when N>5?
    [ASSISTANT] (debugging output...)
    [USER] wait, did we fix this before?
  expected_relevant_session_ids:        # at least one should appear in top-K
    - 4de4a3ab
  expected_irrelevant_session_ids:      # token-overlap traps; must NOT appear
    - 87d20187                          # tests/relevance.test.ts — incidental match on "relevance"
  notes: |
    The user is asking "did we fix this before". 4de4a3ab has the column-wrap incident
    debugging session. 87d20187 contains the literal token "relevance" but is unrelated
    test infrastructure — should be filtered out.
```

For multi-turn entries, `conversation_prefix` is a list of turn-boundaries:

```yaml
- id: thread-002
  kind: multi-turn
  turns:
    - prefix: "[USER] start of session..."
      expected_relevant_session_ids: [...]
    - prefix: "[USER] start of session...\n[USER] follow-up that builds on..."
      expected_relevant_session_ids: [...]
    - prefix: "[USER] ...full thread up to turn 3..."
      expected_relevant_session_ids: [...]
```

## Generating pairs

Adversarial means: include cases the system gets wrong today.

Sources:

1. **Real session history** — pick conversation prefixes from `~/.claude/projects/.../*.jsonl`, then label which past sessions a human would actually want surfaced
2. **The probe log itself** — every cycle in `~/.cache/mem-thought-hypothesis.log` is a candidate pair; mark it relevant/irrelevant by hand
3. **Token-overlap traps** — explicitly find sessions whose snippets contain tokens from the query but are about something different (the recall corpus's TestSuite analog)
4. **Multi-turn threads** — sample 3-5 long conversations and annotate per-turn

Initial target: 30 single-query pairs + 5 multi-turn threads. Enough to detect ≥10% precision shifts with statistical confidence.

## Runner

`tools/recall-eval.ts` (TODO):

- `--corpus <path>` — defaults to `hub/tribe/eval/recall-corpus.yaml`
- `--mode baseline` — current production behavior
- `--mode salience-trigger` — A/B against salience-driven query construction
- `--mode no-synthesis` — A/B with synthesis disabled
- `--mode compiled-state` — A/B with multi-turn caching enabled
- `--top-k 5` — what counts as a "hit"
- `--out <path>` — CSV output for analysis

Per-pair output: `pair_id, mode, top_k_session_ids, hit_relevant_count, hit_irrelevant_count, mrr, latency_ms, llm_cost`

## Acceptance gates for downstream Tier 3 beads

Once corpus + runner exist, the following beads become measurable:

- `km-tribe.recall-salience-trigger` — must improve precision@5 by ≥10% vs baseline
- `km-tribe.recall-drop-synthesis-from-ambient` — must not regress recall@5
- `km-tribe.recall-compiled-state` — must show ≥40% per-thread overlap on multi-turn pairs (else it's not earning its complexity)

Without clearing these gates, those changes don't ship.

## Open questions

- Should pairs include the prompt-cache state? (Compiled-state Q2 may need to model what's already cached vs cold.)
- How to label "mixed"? — current label is binary relevant/irrelevant per session-id. May need fractional weights.
- How often do we regenerate the corpus? — corpus drifts as session-history grows; needs annual review at least.

