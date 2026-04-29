# recall v3 — overhaul plan

**Status**: planning, eval-first build. Memory hook disabled (`KM_RECALL_DISABLED=1`) until eval scores hit threshold on the realistic-prompt corpus.

**Tracking bead**: `@km/bearly/recall-v3-overhaul` (epic)

## The thesis

Memory recall = `f(S_t, Δ)`

- `S_t` = built-up session state (anchors introduced, beads claimed, files edited, last N user prompts, scope of work). Maintained per-session, refreshed as the conversation grows.
- `Δ` = the prompt's new contribution beyond S_t (new anchors, topic-shift signals, drill-in questions).
- Recall fires only when Δ is substantive, debounced for thinking-out-loud sequences, and the query is constructed from `(S_t, Δ)`, not just the bare prompt.

## What's wrong with v2

1. Single-modality FTS5 BM25 — no anchor-alignment between prompt and snippet
2. No session-state awareness — every prompt evaluated in isolation
3. Re-surfaces content already in current session's transcript (autocatalytic loop)
4. No cognitive-type separation (episodic / semantic / procedural / instruction / opinion)
5. Heavy boilerplate envelope (~280 chars per emit just for wrapper)
6. No pointer-vs-inline tradeoff — everything's full-content
7. No selection rationale — agent can't tell strong vs weak match
8. Eval corpus is synthetic (anchor-rich pairs); real prompts are 38% S_t-only

## Target architecture

```
turn N user prompt → UserPromptSubmit hook
  ↓
[Stage 0] classifyPromptSkip + recent-debounce check
[Stage 1] hasSalience + extract Δ from (P, S_t)
[Stage 2] recent-context-exclusion filter (rolling hash over last 4K tokens)
[Stage 3] Hybrid retrieval (RRF over: FTS5 keyword + recency-weighted + scope-proximity)
[Stage 4] LLM rerank-with-typing (single Haiku call returns: relevant, type,
                                  form=inline|pointer, summary, hint)
[Stage 5] Emit envelope with structured pointers + inline + session-context-summary
  ↓
session-end → consolidate S_t into structured YAML artifact (high-signal, indexed)
```

## Component beads

| ID | Layer | Description | Effort |
|---|---|---|---|
| `@km/bearly/recall-session-state-block` | core | Letta-style always-current S_t block (anchors, beads, files, last-N-prompts) | M |
| `@km/bearly/recall-recent-context-exclusion` | filter | Rolling-hash bloom-filter over last 4K tokens; drop overlapping candidates | S |
| `@km/bearly/recall-debounce` | filter | Skip recall if <20-30s since last prompt | XS |
| `@km/bearly/recall-snippet-sanitize` (already filed) | rerank | LLM-rewrite + indexer-side strip; extend to typed/hinted output | M |
| `@km/bearly/recall-engram-typing` | rerank | Tag every surfaced item with cognitive type | XS (folds into rerank call) |
| `@km/bearly/recall-pointer-mode` | emit | Inline-vs-pointer classifier + activation hints | M |
| `@km/bearly/recall-hybrid-rrf` | retrieve | Multi-pathway: FTS keyword + recency + scope-proximity, RRF merge | M |
| `@km/bearly/recall-session-end-consolidation` | consolidate | Structured YAML artifact at SessionEnd; replaces prose summary | M |
| `@km/bearly/recall-realistic-eval-corpus` | eval | Axis D: 24 realistic prompts from sessions 51f52497, da9990c5, ca24a540, 4de4a3ab | S |
| `@km/bearly/recall-eval-harness-v3` | eval | Per-stage logging, hot-path mode, useful-rate scoring, HTML report | M |

XS = < 1h, S = 1-4h, M = 4-12h, L = 12+h.

## Build order

**Phase 0 — eval infrastructure (gate)**
- `recall-realistic-eval-corpus` — extend hub/tribe/eval/recall-corpus.yaml with Axis D
- `recall-eval-harness-v3` — extend tools/recall-eval.ts:
  - `--mode hot-path` (matches UserPromptSubmit pipeline)
  - Per-stage decision log (skip reasons, gate decisions, rerank output)
  - useful-rate scoring across baseline / v3 / hybrid modes
  - HTML report (per-pair: prompt, S_t snapshot, retrieved candidates, gates, final emit, label)
- Smoke test: run baseline vs disabled. Verify the eval is doing the right thing.

**Phase 1 — core primitives (parallel, worktree-isolated)**
- `recall-session-state-block` — `bun recall current-session-state` CLI + library
- `recall-recent-context-exclusion` — rolling-hash filter
- `recall-debounce` — timer in SeenStore

**Phase 2 — rerank stage (depends on Phase 1)**
- Extend `recall-snippet-sanitize`: single Haiku call returns
  `{ relevant, type, form, summary, hint }`
- Cache by sha256(snippet) for summary; per-prompt for relevance/type/form/hint

**Phase 3 — emit envelope + retrieval (parallel with Phase 2)**
- `recall-pointer-mode` — inline-vs-pointer classifier
- `recall-engram-typing` — type field in emit
- `recall-hybrid-rrf` — multi-pathway retrieval

**Phase 4 — session-end consolidation**
- `recall-session-end-consolidation` — YAML artifact extraction at SessionEnd
- Backfill across existing sessions (~$25-50 one-time)

**Phase 5 — re-enable hook**
- Eval scores >60% useful on Axis D
- Set `KM_RECALL_DISABLED=0` in settings.json
- Monitor recall-emit-log for 1 week

## Eval scoring

For each prompt in the corpus (across axes A/B/C/D), the eval grades:

1. **Skip correctness** — should this prompt have skipped recall? Did it?
2. **Retrieval quality** — given correct fire decision, did relevant content surface?
3. **Useful-rate** — was the emit actually useful (manual eyeball OR LLM judge)?
4. **No re-surface** — did the system avoid emitting content already in current session?
5. **Type correctness** — was the assigned ENGRAM type right?
6. **Pointer-vs-inline correctness** — did the system pick the right form?

Aggregated metrics:
- P@5, R@5, MRR (current)
- Skip-decision F1 (new)
- Useful-rate (new)
- Re-surface rate (new — should be 0)
- Type accuracy (new)
- Pointer-fitness (new)

## What evaluators see

`bun tools/recall-eval.ts --mode v3 --report html` produces:

`/tmp/recall-eval-2026-04-29.html`:
- Per-pair: prompt, S_t snapshot, all retrieved candidates ranked, per-stage decisions, final emit, gold label, pass/fail
- Aggregate: metrics matrix across baseline / v3 / hybrid modes, score deltas
- Diff view: which pairs changed verdict between modes, why

Run after each Phase. Block re-enable until Phase 5 criteria met.

## Constraints

- Memory hook stays disabled throughout build
- All components shipped in vendor/bearly/plugins/recall/
- No hot-path regressions: Stage 0 + Stage 1 (regex) must remain <5ms
- Stage 4 LLM rerank: cached, async-safe, <500ms p95
- Eval must be reproducible (seeded if planner is non-deterministic)

## Out of scope (defer)

- Vector embeddings (cross-system research said hybrid wins; we're not on the SOTA chase)
- Graph store (Mem0 deleted theirs; not worth extraction noise for our scope)
- Frontier benchmarks (LongMemEval / LoCoMo — interesting but km is bounded scope)
- Always-on `S_t` injection into every prompt (ChatGPT antipattern)
- Cross-machine sync of memory (single-user-multi-machine is out of scope today)
