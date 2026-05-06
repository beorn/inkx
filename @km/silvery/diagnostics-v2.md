---
mentions:
  - km
  - claude
id: "@km/silvery/diagnostics-v2"
aliases:
  - km-silvery.diagnostics-v2
  - km-silvery-diagnostics-v2
created_by: claude:c9beade3
created_at: 2026-03-13T01:05:12Z
closed_at: 2026-03-13T03:03:02Z
close_reason: >-
  Implemented Tiers 1-3. Tier 4 (architectural simplification) is
  research/design, not implementation.


  Tier 1: SILVERY_STRICT auto-includes content-phase stats + cell attribution in
  errors.

  Tier 2: 7 property-invariant fuzz tests (idempotence, no-op, inverse,
  viewport, combined).

  Tier 3: 7 new silvery fuzz components + km-tui expanded with large/nested
  fixtures, mutation keys.

  Bugs found: pre-existing scroll incremental rendering issues → tracked in
  km-silvery.scroll-incr-fuzz.

  Steering docs updated across 6 files.
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Rendering regression diagnostics v2: unified system, property invariants, mutation testing @km/silvery #feature #P1 @claude:c9beade3

14-day analysis (2026-02-26 to 2026-03-12) found 7 rendering regressions, 4 shipped to users before tests caught them. Both GPT 5.4 and O3 Deep Research reviewed our system and confirmed our approach (differential testing) is sound but identified concrete gaps. This bead tracks the improvements.

## What Was Already Done (session 2026-03-12)

- Fixed stale formula in SKILL.md Step 5 (layoutChangedThisFrame, not rectEqual)
- Added diagnostic quick reference table to SKILL.md
- Added SILVERY_STRICT_OUTPUT to decision tree (was missing)
- Updated getCellBg to inheritedBg in SKILL.md
- Added inline mode, multi-pass, fixture complexity, init-sequence notes to tui.md

## Remaining Work (priority order)

### Tier 1: Integrated Diagnostics

- Unified SILVERY_DIAG env var with presets (regression, cascade-debug, perf, ci)
- Auto-include INSTRUMENT data in IncrementalRenderMismatchError
- Auto-include CELL_DEBUG trace for mismatched cell in STRICT errors
- Per-frame diagnostic record: cascade inputs, chosen strategy, dirty nodes, timings, oracle result
- Cascade formulas emit reason codes (not just boolean results)

### Tier 2: Property-Based Invariants

- Idempotence: render(S) twice -> dirty set empty, output identical
- Dirty-set soundness: changed_cells is subset of invalidated_cells
- Inverse operations: fold+unfold = identity, scroll+unscroll = identity
- Compositionality: independent subtree updates commute
- No-op invariant: setting text to same value -> render plan = no-op
- Viewport clipping: offscreen-only changes do not affect visible buffer
- Wrap-boundary: edits at wrap points (width-1, width, width+1)

### Tier 3: Coverage and Scale

- Real-vault regression suite (anonymized Asana vault snapshot, 100+ items, STRICT mode)
- Mutation testing for cascade formulas (remove each contentAreaAffected term, verify test fails)
- Init-sequence test (focus reporting timing, alternate screen sequence order)
- Multi-pass layout feedback test (component that triggers doRender iteration)
- Scale up fuzz tests: larger trees, more node types, scroll+sticky+absolute combos

### Tier 4: Architectural Simplification (research/design)

- Evaluate generation counters vs dirty flags (Chrome LayoutNG-inspired)
- Evaluate dirty rectangle model vs per-node flag cascade
- Evaluate 3-tier strategy (micro-diff/region-repaint/full-repaint) vs 5-formula cascade
- Cost-benefit: is full re-render + output diff fast enough to replace incremental content phase?

## Sources

- GPT 5.4 analysis: /tmp/llm-c9beade3-1773363481150-muiz.txt
- O3 Deep Research: /tmp/llm-c9beade3-1773363477624-acf1.txt
- Chrome LayoutNG: immutable fragment trees, WPT tests for every bug
- GraphicsFuzz: metamorphic testing for GPU drivers

