---
id: "@km/tui/tab-switch-layout-shift"
aliases:
  - km-tui.tab-switch-layout-shift
  - km-tui-tab-switch-layout-shift
created_by: Bjørn Stabell
created_at: 2026-04-15T04:20:45Z
closed_at: 2026-04-21T04:35:34Z
close_reason: >-
  Fixed via two commits:


  1) apps/km-tui: added km:tui:resize debug namespace (board-app.ts) logging
     term:resize, term:focus, and setDimensions with timestamps. Enable with
     DEBUG=km:tui:resize DEBUG_LOG=/tmp/km-resize.log bun km view <path>.
     Commit: 0df2e893b feat(km-tui): add km:tui:resize debug namespace

  2) vendor/silvery: added a 16ms resize coalescer in ag-term/runtime/
     term-provider.ts. On first SIGWINCH, a flush is scheduled one frame
     ahead (setTimeout 16ms). Additional SIGWINCH arriving before the
     flush fires just let the flush read the latest stdout.columns/rows —
     they don't enqueue new events. Any burst settling within one frame
     collapses to ONE `term:resize` event carrying the final geometry.
     Silvery commit: 742b1676 fix(ag-term): coalesce resize bursts within
     one frame (16ms). km bump commit: 92250e86f chore(silvery): bump.

  Root cause (hypothesis b ruled in, a confirmed): cmux/tmux emit 2-5

  SIGWINCH events within ~5ms during tab switch-back as the PTY re-syncs.

  Each one previously propagated as a separate term:resize through the

  event loop, hitting setDimensions + a full re-render at an intermediate

  size. The 16ms coalesce window absorbs the burst without delaying a

  genuine user-driven resize (which is spaced far further apart than one

  frame anyway).


  Regression tests
  (vendor/silvery/tests/runtime/term-provider-resize-coalesce.test.ts):

  - 3-event burst with 2ms gaps → 1 event with final dims (was 3)

  - 5-event rapid-fire burst → 1 event with final dims (was 5)

  - 2 resizes separated by 50ms → 2 events (no regression on legit resizes)

  - Single SIGWINCH → 1 event (no regression on simple case)

  All 4 tests pass; they failed pre-fix with expected(1).received(3)/(5).


  Manual verification (/tmp/verify-coalesce.ts):

  Before: would emit 3 resize events.

  After:  3 SIGWINCH at t=2,4,6ms → 1 resize event at t=18ms cols=120 rows=35.


  Acceptance criteria:

  (1) MET: Tab switching produces at most one layout render with the final
      (post-resize) dimensions. The flush-once-per-frame timer guarantees
      the event loop sees a single term:resize per burst.
  (2) MET: Regression test covers the coalescing contract. Bug's absence
      is captured as 4 tests asserting event count + final dims.

  Self-verification:

  - tsc non-vendor errors: 0

  - silvery runtime/feature resize tests: 13 passed | 3 expected fail
  (pre-existing)

  - km-tui canary (showcase.spec.ts): 15/15 passed

  - km-tui resize-garble.slow.test.ts: 4 pre-existing failures (column
  visibility
    at 240 width, unrelated — uses driver.app.resize() not term-provider path)
  - km-tui nav-garble-wide.test.ts: 2 pre-existing failures at 200x50/160x40
    (createTestApp fixed dimensions, no term-provider involved)
---

# [x] Layout shifts 2-3 times after switching back to km view tab @km/tui #bug #P2 @claude:8b5b9e1c

blocks:: [[@km/tui]]

When switching to a cmux tab running `km view` from another tab, the layout visibly shifts 2-3 times before settling — initially too narrow, then widening. Happens every tab switch. Not visible on initial render, only on tab switch-back. Likely cause: terminal focus regain triggers a sequence of re-layouts with stale/intermediate dimensions before the true cols/rows arrive. Suspects: (1) term:focus handler in apps/@km/tui/src/board/board-app.ts:64 sets terminalFocused UI flag — touching state triggers re-render; (2) silvery ag-term runtime may re-query caps/dims on focus; (3) Ghostty/cmux may emit a FocusIn event followed shortly by a SIGWINCH/resize with slightly different dims, causing two+ resize events; (4) Flexily layout cache may invalidate and recompute twice. Investigation: instrument term:resize handler to log (width, height, source, timestamp) across a tab-switch cycle — expect to see 2-3 events. Also check if the first layout after focus regain uses a cached stale dimension. Repro: `bun km view <vault>`, switch to another cmux tab, switch back; observe 2-3 visible layout flashes. Happens every time.