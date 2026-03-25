# Lesson: Sticky Children Incremental Rendering

**Date**: 2026-02-12
**Bug**: 10/10 fuzz failures in `render-fuzz.fuzz.ts` after sticky children support
**Outcome**: Three complementary fixes needed; each alone was insufficient

## The Bug

After adding sticky children support to silvery's scroll containers, all 10 fuzz test seeds failed with `IncrementalRenderMismatchError`. The incremental render produced different buffer content than a fresh render, specifically at positions where sticky headers rendered.

## Root Cause

Sticky children use two-pass rendering: first pass renders normal items with scroll offset, second pass renders sticky headers at computed positions on top. This creates a coupling between buffer state and Text rendering via `getCellBg` — Text nodes without explicit background read the buffer to inherit bg from whatever was rendered underneath.

Three independent issues combined to cause mismatches:

### Fix 1: Full Viewport Clear to `bg: null`

**Problem**: In Tier 2 (needsViewportClear), the viewport was cleared to inherited bg (e.g., the parent's backgroundColor). But on a fresh render, the buffer starts with `null` bg at all positions. Text nodes call `getCellBg` to inherit bg — they got inherited bg on incremental render but `null` on fresh render.

**Fix**: Clear viewport to `bg: null` instead of inherited bg. This matches fresh render semantics where the buffer starts empty.

### Fix 2: `stickyForceRefresh` in Tier 3

**Problem**: When sticky children exist and only `subtreeDirty` is set (Tier 3 — no viewport clear), the cloned buffer has stale bg from *previous frames'* sticky headers at their *old* positions. If a first-pass item now occupies a position where a sticky header used to be, its Text nodes read stale bg via `getCellBg`.

**Fix**: When sticky children exist in Tier 3, force all first-pass items to re-render (`stickyForceRefresh=true`, `childHasPrev=false`). This ensures correct bg is painted before the sticky second pass.

### Fix 3: Sticky `ancestorCleared=false`

**Problem**: The second pass renders sticky headers ON TOP of first-pass content. Using `ancestorCleared=true` for sticky children caused transparent spacer Boxes (no backgroundColor) to clear their region — wiping overlapping sticky headers rendered earlier in the same second pass.

**Fix**: Use `ancestorCleared=false` for sticky children. On a fresh render, the buffer at sticky positions has first-pass content (not "cleared" space), so `ancestorCleared=false` matches fresh render semantics.

## Blind Paths

1. **Pre-clearing only current sticky positions** — Missed that OLD positions (from previous frames) also had stale bg in the cloned buffer. Had to clear the entire viewport.

2. **Setting `hasPrevBuffer=false` without clearing buffer** — Thought disabling the fast-path was sufficient. But Text nodes read bg from the buffer regardless of `hasPrevBuffer` — they use `getCellBg`, which reads actual buffer cells, not flags.

3. **`ancestorCleared=true` for sticky second pass** — Seemed logical (the viewport was just cleared), but it broke transparent overlays that exist within sticky header trees.

## Key Insight: getCellBg Coupling

The `getCellBg` coupling is the fundamental complication in incremental rendering. Every change to when/how regions are cleared changes what Text nodes render. The invariant is:

**At the time a Text node renders, the buffer state at its position must be identical whether reached via incremental or fresh rendering.**

This means:
- Clearing to inherited bg ≠ clearing to null (fresh starts null)
- Stale buffer content at old positions must be overwritten before Text renders
- `ancestorCleared` must match what the buffer actually contains, not what was "logically" done

## What Worked

1. **Fuzz testing caught it immediately** — 10/10 seeds failed, making it impossible to ignore
2. **`SILVERY_STRICT=1` pinpointed exact positions** — Error output showed cell values, node paths, bg values
3. **Each fix was validated independently** — Could see mismatch count drop with each fix (10 → 6 → 2 → 0)
4. **The pipeline CLAUDE.md was essential** — Understanding the three scroll tiers and the cascade formulas made the fix path clear

## Cross-References

- `vendor/silvery/src/pipeline/CLAUDE.md` — Scroll container three-tier strategy, sticky children two-pass rendering
- `vendor/silvery/src/pipeline/render-phase.ts` — `renderScrollContainerChildren`, `stickyForceRefresh`
- `docs/lessons/debugging-rendering.md` — General silvery debugging methodology
- `docs/lessons/incremental-rendering.md` — Fast-path logic and common bug patterns
