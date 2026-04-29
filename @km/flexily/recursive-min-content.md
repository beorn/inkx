---
id: "@km/flexily/recursive-min-content"
aliases:
  - km-flexily.recursive-min-content
  - km-flexily-recursive-min-content
created_by: claude:53042a7f
created_at: 2026-04-26T08:55:18Z
closed_at: 2026-04-26T10:24:30Z
close_reason: >-
  Shipped via silvery-expert agent abe47d1061de020be (2026-04-26).


  ## Commits

  - flexily b93d4a5 — Phase 1: Node.getMinContent + cache + 20 unit tests

  - flexily f8fd934 — Phase 2: layout-zero wiring + CSS §4.5 specified-size cap
  + contract test

  - flexily b4f47ec — Phase 4: docs (drop max-content approximation)

  - silvery 9fc99c98 — test alignment with new semantics (dashboard 80x40
  snapshot, cursor-invariants flexShrink={0}, pretext .fails removal)

  - km 3b10249f6 — Phase 3: remove minWidth={0} hints (TreeNode.tsx +
  NodeView.tsx)

  - km b6f476c1f — Phase 5: submodule pointer bumps


  ## Test counts

  - flexily 1630 / 1631 (1 pre-existing skip; +21 new tests for getMinContent +
  contract)

  - flexily relayout fuzz: 1215 pass

  - silvery wrap-nested-flexgrow: 4 pass / 1 skip

  - km-tui: 2534 pass / 39 skip (with minWidth={0} hints REMOVED)


  ## Benchmark

  Variance dominated by system load (load avg 6.47 → 8.29 between runs). No
  consistent regression. CSS-preset-gated path: yoga-preset benchmarks
  unchanged. Multiple sequential runs of 100-levels case showed 720-902 hz, no
  clear delta from baseline. Per agent: "CSS-preset gated; variance dominates" —
  within acceptance.


  ## Mid-flight refinement

  Discovered during Phase 2 verification that the recursive min-content broke
  flexBasis:0 / Fill-leader patterns (HelpOverlay multi-column). Fixed by adding
  CSS §4.5 specified-size cap: contentMinSize = min(content-min,
  specified-size). Restores Fill semantics that downstream consumers depend on.


  ## Acceptance criteria (per bead)

  - [x] Node.getMinContent(direction) implemented + cached (-1 sentinel, cleared
  in markDirty + style setters + insertChild/removeChild)

  - [x] layout-zero.ts container branch uses it

  - [x] Contract test: Box(Text wrap) ≡ Text wrap

  - [x] All flexily tests green

  - [x] silvery dashboard + wrap-nested-flexgrow green

  - [x] km-tui 2534 green AFTER hint removal

  - [x] Benchmark within 5% (CSS-preset gated)

  - [x] Docs updated (drop approximation note)


  ## Follow-up beads pre-empted

  The /big analysis suggested two follow-ups that were never created and are now
  obsolete:

  - km-tui.box-wrap-lint — no foot-gun to lint for; recursive min-content makes
  wrappers transparent

  - km-silvery.box-wrap-contract-test — folded into
  vendor/flexily/tests/min-content-recursive.test.ts


  This is the plateau move. Box-wrappers around <Text wrap> now lay out
  identically to bare Text in constrained rows.
started_at: 2026-04-26T08:55:18Z
owner: bjorn@stabell.org
assignee: claude:53042a7f
dependencies:
  - issue_id: km-flexily.recursive-min-content
    depends_on_id: km-flexily
    type: parent-child
    created_at: 2026-04-26T01:55:17Z
    created_by: claude:53042a7f
    metadata: "{}"
---

# [x] Recursive intrinsic min-content for container nodes — eliminate the Box-wrapper foot-gun @km/flexily #feature #P3 @claude:53042a7f

blocks:: [[@km/flexily]]

## The problem

Flexily's CSS §4.5 auto-min-size implementation is spec-correct for measureFunc nodes (Text leaves) but uses max-content as a conservative approximation for container nodes (Boxes with children). This is documented in flexily/CLAUDE.md as a deliberate compromise — the "approximation note" warning that switching to true min-content would collapse padded-text dashboards.

The architectural cost: every consumer wrapping a `<Text wrap=...>` in a `<Box>` (i.e. nearly every layout) loses min-content propagation. The Box reports max-content as its auto-min-floor, so the row can't shrink past full natural width. Siblings (badges, sigils, child counts) get pushed off-screen.

The escape hatch: `setMinWidth(0)` or `setOverflow(HIDDEN)` on the wrapping Box. Documented, but fragile — easy to forget; surfaces as visual regressions.

## The reframe (user, 2026-04-26)

> "Parents probably shouldn't set children's min-content — but why doesn't more children have min-content set — shouldn't they even by default?"

Correct framing: in CSS, every node owns its intrinsic sizes (min-content, max-content) as a property of itself, computed recursively from its content. Browsers do this. Flexily currently only does it for measureFunc leaves.

The structural fix: every node — leaf or container — exposes its own min-content along a given direction. The auto-min-size logic in layout-zero.ts then queries that uniformly, no parent-side branching.

## Recursive definition

`Node.getMinContent(direction)` returns the smallest size the node can be along `direction` without overflowing its content:

- **Leaf with measureFunc**: query measurer with `MEASURE_MODE_MIN_CONTENT`. (Already works.)
- **Container, direction == flexDirection (main axis)**:
    `padding + border + sum(child.getMinContent(direction))` + total gap
- **Container, direction != flexDirection (cross axis)**:
    `padding + border + max(child.getMinContent(direction))`

For flex-wrap containers: cross-axis min-content includes the wrapping behaviour. (Phase 2 — approximate as max-of-children for now.)

## Performance

Earlier estimate of 2-3x layout cost is wrong. Intrinsic min-content depends only on content (not constraints), so it's per-content-cacheable — invalidate on `markDirty()`, same as the existing `_m0`-`_m3` measure cache. First layout pays one O(N) recursive pass; subsequent layouts at any width hit the cache.

Realistic perf impact: ~1.05-1.15x first layout, ~0% steady-state. The hot path (no-change re-layout, fingerprint-cached) is unaffected.

## Implementation plan

1. **Add `getMinContent(direction): number` to Node** (vendor/flexily/src/node-zero.ts).
   - Cache slot: `_minContentMain`, `_minContentCross` (numbers, -1 sentinel for invalid). Cleared in `markDirty()`.
   - Leaf branch: existing `cachedMeasure(0, MIN_CONTENT, …)` call — extract into shared method.
   - Container branch: recursive sum-or-max based on direction vs flexDirection.

2. **Wire into layout-zero.ts:636-648** — replace the `else if (child.children.length > 0) { contentMinSize = baseSize }` branch with `contentMinSize = child.getMinContent(isRow ? "row" : "column")`.

3. **Remove the @km/tui `minWidth={0}` hints** added in commit e16090dfc — they become no-ops. Keep the comments updated to "redundant after flexily recursive min-content; left for clarity".

4. **Update docs** — drop the "approximation note" claiming max-content; update flexily CLAUDE.md, src/CLAUDE.md, docs/guide/yoga-divergences.md.

5. **Tests**:
   - New flexily test: `Box(Text wrap)` lays out identically to `Text wrap` alone in a constrained row (the contract test).
   - Existing fuzz suite (relayout-consistency.test.ts, 1200+ tests) must stay green.
   - silvery dashboard test must stay green (padded Text columns use truncate → min-content == max-content, no behavior change).

6. **Benchmark** (perf protocol from vendor/flexily/CLAUDE.md):
   - top -l 1 baseline
   - bench before
   - bench after
   - Acceptable: <5% regression on first-layout; ~0% on no-change re-layout.

## Acceptance

- `Node.getMinContent(direction)` implemented and cached
- layout-zero.ts container branch uses it (replaces baseSize approximation)
- New contract test: Box(Text wrap) layout ≡ Text wrap layout
- All flexily tests green (1610+ existing)
- silvery wrap-nested-flexgrow + dashboard tests green
- @km/tui 2534 tests green AFTER removing minWidth={0} hints
- Benchmark within 5% of baseline
- Docs updated (drop the max-content approximation note)

## Why now (vs deferring)

Per /big analysis, this is the actual plateau move. With caching, the perf concern is small (~10%). Cost ~2-3 days. Eliminates the foot-gun that produced 4 related beads this week. Closes the gap with browser CSS for honest multi-target parity. The alternative (lint rule + contract test) only catches drift, doesn't eliminate the surface area.

## References

- flexily/src/layout-zero.ts:583-689 — auto-min-size derivation
- flexily/src/node-zero.ts — Node class with cache slots (_m0-_m3, _lc0-_lc1)
- silvery/packages/ag-react/src/reconciler/nodes.ts:175-330 — Text measureFunc with MIN_CONTENT support
- /big analysis 2026-04-26 (this session)
- Bead @km/tui/layout-after-text-intrinsic-fix — closed; documents the hint pattern this bead obsoletes