---
id: "@km/tui/mouse-hover-tests"
aliases:
  - km-tui.mouse-hover-tests
  - km-tui-mouse-hover-tests
created_by: claude:ceb7c9cb
created_at: 2026-03-30T06:00:49Z
owner: bjorn@stabell.org
---

# [ ] Mouse hover/popover testing — fake timers + programmatic mouse events @km/tui #task #P3

## Problem
No automated tests for mouse hover interactions: popover show/hide timing, tooltip content, 
mouse-enter-popover grace period, fast target switching. All verified manually.

## Research Findings

### Approach 1: Vitest fake timers + silvery mouse events
- Use `vi.useFakeTimers()` to control setTimeout (show/hide delays)
- Silvery's `testEnv` already supports `board.click(x, y)` — extend with `board.hover(x, y)`
- Pattern: hover card → advance 400ms → assert popover visible → hover away → advance 300ms → assert hidden
- Source: [Vitest fake timers](https://dev.to/brunosabot/mastering-time-using-fake-timers-with-vitest-390b)

### Approach 2: @microsoft/tui-test
- End-to-end terminal testing framework using xterm.js
- Supports mouse events in terminal apps
- Auto-wait for renders
- Source: [microsoft/tui-test](https://github.com/microsoft/tui-test)

### Approach 3: Extend silvery test helpers
- Add `sendMouseEvent(type, x, y)` to the test renderer (mouseenter, mouseleave, mousemove)
- Silvery already has `processMouseEvent` + `hitTest` — just need to expose in test API
- Combined with fake timers, this enables full hover intent testing

## Recommended: Approach 3 (extend silvery)
Silvery's virtual renderer + fake timers is the fastest and most integrated approach.
Tests run in <100ms, no real terminal needed.

### What to build
1. `board.mouseEnter(selector)` / `board.mouseLeave(selector)` helpers
2. `board.hoverCard(nodeId)` convenience (mouseEnter + wait for armed state)
3. Fake timer integration for popover show/hide delays
4. Test cases: show, hide, fast switch, warm window, mouse-enter-popover

## /complete
- Tests exist for: popover show on Cmd+hover, hide on leave, instant swap, warm window
- Tests use fake timers (no real delays)