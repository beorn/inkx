# Lesson: Layout Caching Bugs in Flexx

**Date**: 2026-02-10
**Bugs**: km-10mat, km-frod5 (3 bugs total)
**Outcome**: Found and fixed 3 distinct incremental layout caching bugs; built 1100+ fuzz tests

## What Happened

All 524 Flexx tests passed. The TUI showed visual corruption (text bleeding past card borders) that only appeared when navigating between views — i.e., during **re-layout of partially-dirty trees**.

The key insight: zero tests exercised `calculateLayout()` twice on the same tree. Every test built a fresh tree, laid it out once, and checked results. This gave zero coverage of the caching logic that makes Flexx fast.

## The Three Bugs

1. **measureNode corruption**: `measureNode()` overwrote `layout.width/height` on clean nodes as a side effect. Fingerprint check then skipped the clean node, preserving corrupted values.

2. **NaN cache sentinel**: `resetLayoutCache()` used `NaN` to invalidate entries, but `NaN` is a legitimate "unconstrained" query. `Object.is(NaN, NaN) === true` → false cache hits.

3. **Fingerprint mismatch**: Auto-sized children receive `NaN` as availableWidth. When parent's flex distribution changed between passes (shrinkage at 60px vs no shrinkage at 80px), `NaN===NaN` fingerprint matched, preserving stale overridden dimensions.

## How They Were Found

A **differential oracle**: build tree → layout → mark dirty → re-layout → compare against fresh layout of identical tree. Fresh layout is trivially correct (no caching involved). Any difference is a bug.

Bug 1 was found by a targeted test mirroring the real TUI card structure. Bugs 2 and 3 were found by fuzz testing with random trees and random dirty subsets.

## Lessons

### 1. Single-pass tests give false confidence in caching code

524 passing tests and zero coverage of the code that makes Flexx fast (caching, fingerprints, dirty propagation). The "happy path" of caching is when it returns the right value; the bugs are when it returns the *wrong* value — and you need re-layout tests to exercise that.

### 2. NaN is treacherous as a sentinel

JavaScript's `NaN` is both a legitimate value (unconstrained dimension) and a natural choice for "invalid/unset." But `Object.is(NaN, NaN)` is `true` and `NaN === NaN` is `false` — both can create bugs depending on which comparison you use. Use sentinel values outside the legitimate domain (`-1` for non-negative fields).

### 3. Fingerprints must capture all inputs that affect output

A child's `layoutNode` fingerprint checks `availableWidth`. But the parent can override the child's width *after* layoutNode returns (flex distribution). The fingerprint doesn't know about this override, so it falsely matches when the override changes. Cache keys must account for parent-child interactions.

### 4. Differential oracles are the gold standard for cache testing

You don't need to hardcode expected values. Just compare "incremental" against "fresh from scratch." The oracle eliminates entire classes of bugs without knowing the specific failure mode. Chrome learned this the hard way with LayoutNG.

### 5. Fuzz testing catches what hand-written tests miss

Bug 1 was found by a targeted test. Bugs 2 and 3 were found by fuzz testing — the developer didn't anticipate the specific combination of auto-sized children, NaN constraints, and flex distribution changes. With seeded RNG, failures are reproducible.

## What We Built

- `vendor/flexture/tests/relayout-consistency.test.ts` — 1100+ tests across 9 groups
- `vendor/flexture/docs/testing.md` — test methodology
- `vendor/flexture/docs/incremental-layout-bugs.md` — bug taxonomy with Chrome/Yoga/PanGui industry context
- `vendor/hightea/tests/layout-snapshots.test.tsx` — 7 rendered output snapshot tests

## Cross-References

- `vendor/flexture/docs/incremental-layout-bugs.md` — full bug taxonomy and industry history
- `vendor/flexture/docs/testing.md` — test infrastructure reference
- `docs/lessons/debugging-rendering.md` — complementary lesson on inkx rendering bugs
- `docs/lessons/incremental-rendering.md` — inkx incremental rendering (distinct from layout caching)
