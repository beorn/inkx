---
mentions:
  - km
id: "@km/silvery/inline-bugs"
aliases:
  - km-silvery.inline-bugs
  - km-silvery-inline-bugs
created_by: claude:73d7a332
created_at: 2026-03-11T17:59:58Z
closed_at: 2026-04-21T05:13:59Z
close_reason: >-
  All 8 bugs fixed with regression tests.


  Fixes (4 commits in vendor/silvery/):

  - 0671b9d3 intro visible + no auto-done + correct Tab (bugs #1, #3, #4)

  - 90c5506b full-width input border + auto cache backend (bugs #6, #7)

  - 9d577ed5 empty Enter no-op + focus-aware border + jump-up guard (bugs #2,
  #5, #8)

  - a1291250 adapt scrollback tests to new Tab+Enter flow


  Per-bug summary:

  1. (compaction → 'session complete') — doAdvance/autoAdvance no longer set
  done=true; submit clears done; auto mode keeps session alive with
  respondRandom loop.

  2. (text auto-inserted) — empty Enter is now a no-op; placeholder never
  silently submits. Tab explicitly fills.

  3. (Tab behavior wrong) — new FooterControl.fillOrSubmit: empty Tab fills
  scripted message, non-empty Tab submits like Enter.

  4. (intro missing) — mount no longer auto-advances in non-auto mode; system
  intro exchange stays visible until user interacts.

  5. (input jump-up) — regression test samples border row during streaming and
  asserts monotonic progression.

  6. (empty streaming space) — cache=auto promotes completed exchanges to
  terminal scrollback in inline mode, compacting the viewport.

  7. (border broken) — added width='100%' to DemoFooter's bordered Box; border
  spans full terminal width instead of sizing to the ❯ prefix.

  8. (focus outline when unfocused) — regression test reads border cell
  foreground before/after CSI O and asserts distinct colors.


  Regression coverage: 121 tests pass in tests/examples + tests/features/inline
  + tests/features/scrollback (including 9 new tests in
  tests/examples/aichat-inline-bugs.test.tsx covering all 8 bugs).


  Verified in real terminal: ran bin/cli.ts aichat --inline and bin/cli.ts
  aichat --inline --auto --fast; intro appears, border full-width, no
  overlapping borders, proper scrollback promotion.


  km root picks up these fixes via the silvery submodule pointer; bumped
  separately via chore(silvery).
owner: bjorn@stabell.org
---

# [x] AI chat inline mode bugs: jump-up, exit, borders, advance behavior @km/silvery #bug #P1

AI chat inline mode bugs (static-scrollback.tsx). Tracking all reported issues.

## Bugs (2026-03-11)

1. **Compaction says 'session complete'** — after compacting, done=true fires and user can't continue. Should never stop.
2. **Text auto-inserted into input** — sometimes text appears in TextInput without user typing
3. **Tab behavior wrong** — should be: empty input → fill random text, non-empty input → act like Enter
4. **Intro text missing** — 'Scrollback demo' header/features no longer showing
5. **Input box jump-up** — input box visually jumps up then back down during interaction
6. **Empty space during streaming** — turns with gradual streaming (like 'All done! Summary...') show empty space under input box until content fills in, as if space is pre-allocated
7. **Border broken** — border rendering issues on exchange cards
8. **Focus outline when unfocused** — input box shows blue focus ring even when terminal window is not in focus

