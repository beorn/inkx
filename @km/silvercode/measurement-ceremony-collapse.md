---
aliases:
  - km-silvercode.measurement-ceremony-collapse
  - km-silvercode-measurement-ceremony-collapse
created_at: 2026-05-06T23:57:42.117Z
---

# Silvercode: collapse measurement-aware ceremony in Content.tsx #feature #P2

After `useDeferredBoxRect` (in flight, silvery agent) + bootstrap-width hint (`@km/silvercode/bootstrap-width-hint`) both ship, the entire `available > 0` first-frame guard collapses. This bead deletes the dual-branch ceremony.

## Why

Silvery's responsive-layout promise is "useBoxRect measurement just works." Today, every consumer has to handle the 0 → measured transition explicitly because in-flight rect signals start at 0 and only update at the next batch's commit. Apps wrote stable-tree workarounds to prevent the structural-flip bug:

- `Content.Row` lines 252-358: `usesMeasuredGeometry = ctx.available > 0` ternaries everywhere
- The 9-line "Stable React tree across all measurement states" comment block at Content.tsx:347-360 explaining why we DON'T `return null` at available=0
- `ContentRowContext.Provider({ available: 0 })` for downstream lanes that "care"
- `MeasuredLayoutProbe` measure-then-render indirection

Once the measurement signal seeds with bootstrap width on first render (e.g., from `term.size.cols()`), `available` is approximately right from frame 1 — never literally 0. The dual-branch logic collapses to a single branch.

## Approach

After dependencies land:

1. Delete `usesMeasuredGeometry` ternaries in `Content.tsx` (Row, ProseLane, Wide, Full, Body) — keep only the measured branches.
2. Delete the 9-line comment block at Content.tsx:347-360 (no longer load-bearing).
3. Delete `ContentRowContext` and the `value: 0` fallback branch — lanes can `useBoxRect()` their parent directly via deferred-rect.
4. Delete `MeasuredLayoutProbe` indirection if it's no longer needed (lanes measure themselves).
5. Drop `flexShrink={1} minWidth={0}` ceremony where redundant.

## Files in scope

- apps/silvercode/src/components/Content.tsx (~766 → ~500 LOC expected)

## Dependencies

- BLOCKED BY: silvery agent's deferred-rect work on `vendor/silvery/packages/ag-react/src/hooks/useLayout.ts`
- BLOCKED BY: `@km/silvercode/bootstrap-width-hint` (file separately)

## Acceptance

- Content.tsx has no `usesMeasuredGeometry` branches
- ContentRowContext deleted (lanes use deferred-rect)
- `bun vitest run apps/silvercode` green
- Real-TTY visual smoke: `bun silvercode` startup, resize, focus-change all stable
- STRICT log shows no degenerate frames in Content tree on first paint

Investigation 2026-05-07: ternaries are still load-bearing without bootstrap-width hint. Frame 1 has measured=0; lanes need per-row laneWidth fallback to render at sensible width. Attempted aggressive collapse during /max session caused STRICT incremental-vs-fresh mismatch in content-layout plan-drawer test (render #4 bg cell mismatch). Reverted. Real prerequisite chain: bootstrap-width-hint → measurement-ceremony-collapse. Both depend on deferred-rect which IS shipped (bf0b2f12). Actual cleanup possible right now is small: drop dead 'usesMeasuredGeometry' alias (=== ctx.available > 0). Bigger collapse waits for bootstrap-width hint.

