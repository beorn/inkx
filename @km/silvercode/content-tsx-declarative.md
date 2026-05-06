---
_stub: true
---

# #P3 ^content-tsx-declarative

## Update 2026-05-06 — first attempt regressed; reverted

Tried minimum-viable form: replace `useBoxRect()` in `MeasuredLayoutProbe` with `useTerm(t => t.size.cols())` and accept an optional `available` prop on `Content.Layout` (App.tsx passes `viewportCols - SIDE_PANEL_WIDTH` when the inline panel is mounted, falls back to live term cols otherwise). Tests at apps/silvercode/tests/{welcome,chat}-stability.test.tsx all 11 cells passed (with silvery 100 ms trailing-edge debounce in place — see km-silvery.resize-coalesce-trailing-edge).

Local PTY repro `/tmp/repro-post-resize.ts` numbers:

| Configuration                                    | STRICT overflows |
| ------------------------------------------------ | ---------------- |
| Pre-fix (original Content + AsideLayout + 16 ms) | 702              |
| Phase 3 (Content.Row stable tree + memo, 16 ms)  | 208              |
| Silvery trailing-edge 100 ms only                | 248              |
| + Content useTerm-based available                | 255              |
| + AsideLayout always-mount on top                | 271              |

The structural-flip overflow patterns (`width=94 vs parent inner width=49`) suggest Content's *theoretical* `available` (derived from viewport + panel state) "leads" silvery's layout convergence: descendants size to the predicted post-flip width while flexily is still mid-converge through a smaller width. That mismatch is what STRICT counts.

Reverted to the useBoxRect probe in commit `0acf89bc7`. Path forward (deferred):

1. Investigate whether Content's lane-width math (`min(measure, available - gutter)`) at the *moment* of an AsideLayout mode-flip lags one render behind the structural change — could be solved by deriving available with `useDeferredValue` or by making the lane widths flexbox-computed (`maxWidth` only, no `width`) so flexily handles convergence end-to-end.
2. Compare visible-shuffle (settled-frame count) with overflow count — they may diverge. The user's reported symptom is shuffle, not strict count.
3. Consider an explicit silvery API for "publish only after the entire convergence loop settles" so Content's downstream consumers see the post-converge value, not intermediate.

