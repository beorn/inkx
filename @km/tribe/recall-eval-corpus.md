---
id: "@km/tribe/recall-eval-corpus"
aliases:
  - km-tribe.recall-eval-corpus
  - km-tribe-recall-eval-corpus
created_by: claude:4de4a3ab
created_at: 2026-04-28T06:29:21Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-eval-corpus
    depends_on_id: km-tribe.recall
    type: parent-child
    created_at: 2026-04-27T23:29:48Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [ ] Build labeled adversarial corpus for recall/mem-thought evaluation @km/tribe #task #P1

blocks:: [[@km/tribe/recall]]

# Why

Step 1's hypothesis test (manual eyeball ledger across ~10 cycles) measures the wrong thing. After 4 cycles in a live session, the eyeball verdict is dominated by incidental token overlap and the human grader can't distinguish "FTS rank earned by literal query terms" from "rank earned by recall agent's expanded variants" — even with the explainability fields just added (commit d43f98e7d).

The ceiling on Step 1 is reached: we can tell each cycle is noise-leaning, but we cannot tell which axis (trigger / query / retrieval / display) is responsible without a measurement primitive. Every other improvement in @km/tribe/recall (salience trigger, drop synthesis, outcome-aware rank, compiled-state sub-agent) is unfalsifiable until we have ground truth.

This bead builds the eval primitive that grades all four tiers.

# What

A labeled adversarial corpus of ~30-50 pairs:

```yaml
- id: pair-001
  conversation_prefix: |
    [USER] ... last N turns of a real session ...
  expected_relevant_session_ids:
    - <session-id-1>  # genuinely useful past sessions
    - <session-id-2>
  expected_irrelevant_session_ids:
    - <session-id-3>  # token-overlap traps (must NOT surface)
  notes: why these are/aren't relevant
```

Plus a runner `tools/recall-eval.ts`:
- For each pair, build the query exactly the way the system would (using current strategy)
- Run the recall pipeline (`recall --agent --max-rounds 1 --json`)
- Score: did `expected_relevant` appear in top-K? Did `expected_irrelevant` appear?
- Aggregate: precision@5, recall@5, MRR for relevant; rate-of-trap-hits for irrelevant

# Acceptance

- `hub/tribe/eval/recall-corpus.yaml` with ≥30 labeled pairs
- `hub/tribe/eval/README.md` with corpus design + how to add pairs
- `tools/recall-eval.ts` runner with `--baseline` mode (current system) and CSV output
- Baseline numbers documented in design doc — these become the gate every other Tier 3 change must clear

# Why this unblocks the project

Once corpus + runner exist, every other open Tier 3 bead becomes a measurable A/B:
- @km/tribe/recall-salience-trigger: does it raise precision@5 vs polling?
- @km/tribe/recall-drop-synthesis: does removing synthesis hurt recall on the corpus?
- @km/tribe/recall-step1-hypothesis-test: closeable as superseded — auto-grading replaces eyeball ledger.

# Decision rationale

User chose option (b) on 2026-04-27: "pivot to building eval corpus instead — same goal (measure mem-thought usefulness) but with a measurement primitive that scales."

# Status

- Probe (PID 28356) stopped 2026-04-28 06:30 — no more cycles burning LLM budget on ungradable noise
- Hook still emits whatever's in the log (cycle 1 from new format) so we can compare baseline behavior pre-corpus