# Post-resize UI instability — diagnosis + fix

Bead: `@km/silvercode/post-resize-ui-stability`
Last update: 2026-05-06

## Symptom

Switching cmux workspaces away and back (NOT an intentional resize from the
user's perspective) triggers a visible UI shuffle in silvercode. cmux's
hide/show cycle emits a burst of SIGWINCH events at the TTY level, and
silvercode's responsive sidebar logic enters a feedback loop on every
arriving size.

Live repro (run by user, log captured at `/tmp/silvercode-strict2.log`):

```
SILVERY_STRICT=1 DEBUG='silvery:*,silvercode:*' DEBUG_LOG=/tmp/silvercode-strict2.log \
  silvercode --resume claude:f9eb64dc-d982-4a46-9a8e-da5fd882ac5f
```

Confirmed reference: Claude Code (Ink-based, also fullscreen) under the
same cmux workspace switch is stable. Bug is silvercode-specific, not a
fundamental silvery issue.

## Evidence (from live STRICT log)

### Multi-SIGWINCH per workspace switch

cmux fires 4-6 SIGWINCH events in ~300 ms per workspace switch. Width
transitions captured in the log show two interleaved patterns:

```
Pattern A (external SIGWINCH stream):    81 → 113 → 126 → 94
Pattern B (internal feedback loop):      0 → 94 → 120 → 88 → 120 → 88 → 120 → 88 → 0 → 94
```

Pattern B reveals the bug: ELEVEN distinct width transitions in ONE second
when only ONE settled state was expected. The 88↔120 oscillation is the
sidebar-visibility breakpoint flipping back and forth as each pass
remeasures, and the transient `available=0` indicates a subtree remount.

### 150 STRICT layout-overflow violations

```
40× child "silvery-box" width 126 exceeds parent inner 94   (overflow = 32 = sidebar width)
36× child "silvery-box" width 94  exceeds parent inner 81   (overflow = 13)
16× child "silvery-box" width 94  exceeds parent inner 93   (boundary)
13× child "silvery-text" width 36  exceeds parent inner 28
13× child "silvery-text" width 108 exceeds parent inner 85
12× child "silvery-text" width 102 exceeds parent inner 85
 4× child "silvery-text" width 336 exceeds parent inner 85  (long unwrappable token)
…
```

The +32 patterns are the smoking gun: a child measured against
without-sidebar width (126) is being placed inside a with-sidebar parent
(94). The inner dimension stale by exactly the sidebar's 32-col width.

The 336-wide silvery-text is a long unwrappable token (URL / code-fence
line / file path) inside a 35-deep box nesting — a SessionUpdateList
content node. Natural max-content width pins the parent flex calculation,
which is what the breakpoint logic feeds on.

## Root cause

Two compounding issues:

1. **AsideLayout (silvercode app) — three structurally-different React
   subtrees per mode.** `AsideLayout` (`apps/silvercode/src/components/AsideLayout.tsx`)
   conditionally renders one of three trees depending on `mode`
   (`hidden` / `inline` / `overlay`). Every mode flip during a SIGWINCH
   tears down the SidePanel subtree and rebuilds it. The remount feeds
   fresh dimensions into the breakpoint logic, which produces a different
   mode decision on the next pass. Feedback loop until something breaks
   it.

2. **Long unwrappable tokens (silvercode chat content).** Some chat
   content has Text leaves without `wrap="wrap"` (or wrappable-but-no-
   break-points strings such as long URLs). These pin the parent's
   max-content width to the natural width — 336 cols inside an 85-col
   parent. The pinned natural width contributes to the breakpoint
   computation: when the layout measures "I have a 336-col child", it
   decides "no room for sidebar" and removes it. Next pass: child fits
   in 94 cols of the wider available, breakpoint flips back. Oscillation.

## Fix landed (this bead)

### Phase 3 fix — Content.Row: stable React tree + Content.Layout context memoization

After live-log verification of the first attempt (AsideLayout always-mount
fix — landed in `5974b4c89`, then verified to make things worse: 150 → 545
overflows in `/tmp/silvercode-strict3.log`), the actual feedback-loop
source was traced to `Content.tsx` `Row` component:

**Content.Row had a structural branch on `usesMeasuredGeometry` (= `ctx.available > 0`)**:
- When `ctx.available === 0` (initial mount, pre-measurement): one tree
  shape (no layout-dependent margins, simple wrapper).
- When `ctx.available > 0` (after measurement): different tree shape
  (with absolute-positioned asides, optional spacers, measured-width
  middleNode).

Every `available=0 → available>0` transition (e.g. during a workspace-switch
SIGWINCH cascade where measurements flip between 0 and the real width)
caused Row to tear down and rebuild its subtree. The remount fed fresh
useBoxRect measurements into descendants → ContentContext consumers got
new `available` → re-rendered → loop. The 88↔120 oscillation visible in
the live log was a *secondary* symptom; the *primary* loop was the 0↔N
transition through the structural branch.

**Fix**:
1. `Content.Row` rewritten to render a SINGLE React tree across all
   measurement states. Width-derived ternaries inside that single tree
   produce the right widths in both pre-measurement (=0 → falls back to
   `width="100%"`) and measured (>0 → uses `middleWidth`) states.
2. `Content.MeasuredLayout` context value now wrapped in `useMemo` so
   downstream consumers don't re-render on identity-only changes.

The AsideLayout always-mount change from the first attempt was reverted
— it didn't break the feedback loop and added churn (display:none in
flexily wasn't fully zero-cost for the sidebar's contribution).

### Phase 1+2 fix — stability invariant test suite

`apps/silvercode/tests/lib/stability.ts` plus `welcome-stability.test.tsx`
and `chat-stability.test.tsx`. 19 tests covering 4 event types ×
2 screens:

- initial paint
- single resize
- cmux-style multi-SIGWINCH burst (81→113→126→94)
- focus-in (after blur)
- side-panel toggle (Ctrl+O)

All cells assert `≤ 1 distinct layout` in the post-event steady-state
window (300-400 ms after the event). Helper exposes `expectStableLayouts`,
`pollTermlessFrames`, `recordRenderFrames`.

## Not fixed (out of scope here)

### SIGWINCH coalescing already exists in silvery

`vendor/silvery/packages/ag-term/src/runtime/devices/size.ts` `createSize`
already coalesces resize events with a 16ms timer. The internal feedback
loop happens AFTER coalescing: even one published resize triggers the
React cascade. Adding more coalescing wouldn't help.

`createFixedSize` (used by emulator-backed terms / termless) does NOT
coalesce — it's intentionally synchronous so tests have predictable
timing. This is a test-fidelity gap (production has 16ms coalescing, tests
don't), but not a production bug.

### Long-unwrappable-token wrapping in SessionUpdateList

The 336-wide overflow indicates a Text leaf in chat content rendering
without proper wrap behaviour. Identifying the exact component (`Chat` /
`SessionUpdateList` / `MarkdownView` / `ToolCall` / `ToolResult`) and
adding the missing `wrap="wrap"` or `minWidth={0}` is a follow-up. With
the AsideLayout feedback loop broken, the long-text overflow may no
longer compound into the cascade — needs verification.

## Verification

In-test:
- 19 stability cells pass under SILVERY_STRICT=1 (default for `bun run test:fast`).
- Termless harness does NOT reproduce the live-session symptom (it lacks
  real-TTY async paths and the live transcript's specific content).

Live-session verification (user to run):
- Re-run the live repro after the AsideLayout fix.
- Compare STRICT overflow count: live log had 150; expect significantly
  fewer with the feedback loop broken.
- Visually confirm: workspace switch should not produce a visible shuffle.
