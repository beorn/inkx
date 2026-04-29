---
id: "@km/silvery/wrap-measurement"
aliases:
  - km-silvery.wrap-measurement
  - km-silvery-wrap-measurement
created_by: claude:0940ca20
created_at: 2026-04-24T21:47:53Z
closed_at: 2026-04-25T05:38:45Z
close_reason: "Not a flexily defect — test-harness artifact. Investigation
  (silvery-expert validated, 2026-04-24): the 'residual flexily bug' documented
  in apps/silvercode/tests/wrap-regression.test.tsx (line 138-179,
  expect(hasMiddle).toBe(false)) was caused by the test omitting root height
  pinning. createRenderer({cols, rows}) only passes cols/rows as the available
  size to calculateLayout() — it does NOT set root.style.width/height. Without a
  definite root height, column→row→wrappable-text chains collapse to height=1
  via correct CSS max-content sizing (row's intrinsic cross = max child
  max-content cross; wrappable Text at unconstrained width = height 1).
  Production silvercode uses <Screen>
  (vendor/silvery/packages/ag-react/src/ui/components/Screen.tsx:51-58) which
  sets explicit width={dims.width} height={dims.height} from the terminal — no
  collapse. flexily Phase 7a's NaN×NaN measureNode call
  (vendor/flexily/src/layout-zero.ts:947-952) is CSS-correct shrink-wrap
  behavior. Fix landed: (1) apps/silvercode/tests/wrap-regression.test.tsx —
  added width/height pin to Shell + the App-style chain test, flipped
  expect(hasMiddle).toBe(false)→.toBe(true), added contentPastBoundary
  assertion, updated docstring with the misdiagnosis note. (2)
  vendor/silvery/tests/features/wrap-nested-flexgrow.test.tsx — new regression
  suite covering 4 nested chain shapes with proper Root pinning + 1 skipped test
  documenting the harness-collapse pitfall. (3)
  vendor/flexily/tests/wrap-measurement-nested.test.ts — flexily-level coverage
  of the same chains, all pass. The original screenshot 2026-04-24 14.18.36
  wrap-clipping bug was a separate issue, fixed by silvercode commits cdf14b592
  + 363deaf6f (flexShrink/minWidth propagation through DetectionText +
  AssistantBlock outer rows). All 11 tests pass."
---

# [x] flexily: nested flexGrow columns break <Text wrap=wrap> measurement (grandchild gets outer max-content instead of inner available) @km/silvery #bug #P1 @claude:53042a7f

blocks:: [[@km/silvercode/wrap-ergonomic]]

## Symptom

In a nested flex-column chain where both outer AND inner Boxes have `flexGrow={1}` — e.g.:

```tsx
<Box flexDirection="column" flexGrow={1} overflow="hidden">          // outer
  <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>  // inner
    <Text wrap="wrap">a very long paragraph…</Text>
  </Box>
</Box>
```

The grandchild `<Text wrap="wrap">` gets measured against the OUTER Box's max-content width rather than the INNER Box's available width. Result: text doesn't wrap at the boundary the user sees.

## Workaround in use (silvercode, commit 363deaf6f)

Remove `flexGrow={1}` from the inner Box; rely on cross-axis stretch (default) instead. Only the outermost container carries flex-grow. Documented in SessionCard.tsx lines 51–57.

## Why this is wrong (contradicts CSS)

In CSS flexbox:
- `min-width: auto` defaults to `min-content` (size of longest unbreakable token) — this is the gotcha
- Canonical fix: set `min-width: 0` on the inner item → enables shrinking below intrinsic content width → grandchild text wraps
- Nested flex-grow is fine; users hit this once, learn min-width:0, move on

In silvery/flexily:
- We set `flexShrink={1} minWidth={0}` on every intermediate Box
- It still doesn't wrap — CSS's escape hatch doesn't work here
- Only removing the inner flex-grow works, which is negative knowledge ("don't stack flexGrow") that CSS devs wouldn't expect

## Investigation direction

Why does the grandchild Text measure against outer max-content? Candidates:
1. flexily's measurement function for text walks to the nearest flex-grow ancestor instead of direct parent
2. Text's intrinsic-size report during measurement phase ignores the inner Box's `minWidth={0}` constraint
3. Yoga-compat default `flexShrink: 0` propagates differently than explicit `flexShrink={1}` in the measurement pass
4. Some interaction with `overflow="hidden"` shrinkability (CSS spec §4.5) not bubbling down past the first flex-grow level

Starting points:
- `vendor/silvery/packages/ag-react/src/reconciler/nodes.ts:358` (flexShrink wiring — confirmed to call setFlexShrink(1) explicitly)
- `vendor/flexily/src/layout-zero.ts:576` (overflow-container shrinkability per CSS §4.5)
- Text measurement in flexily's measure callback

## Acceptance

- Failing test: a 1500-char paragraph in a nested `flexGrow`-column chain wraps at the inner Box's width (not outer's max-content)
- Both the current silvercode workaround AND the CSS-style `flexShrink=1 minWidth=0` pattern produce correct wrap
- Test lives in `vendor/flexily/tests/` with a silvery-level counterpart
- Document the fix (or the correct pattern) in `vendor/silvery/docs/guide/styling.md`

## Context

This bug has surfaced at least 3 times in km (2026-02-11, 2026-04-18, 2026-04-24). Each time it's fixed with a different workaround. Fixing the root makes all future uses of flex+text wrap just work by CSS semantics.