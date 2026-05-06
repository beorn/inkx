---
mentions:
  - km
  - claude
id: "@km/tui/testing-dx"
aliases:
  - km-tui.testing-dx
  - km-tui-testing-dx
created_at: 2026-02-04T11:27:23Z
closed_at: 2026-02-04T13:49:17Z
assignee: claude:27f1a547
---

# [x] Invest in TUI testing DX (storybook, visual regression, state inspection) @km/tui #epic #P3 @claude:27f1a547

Make it easy for Claude to drive any inkx app using inkx/runtime loops for interactive testing, and to write tests.

## Goals

1. Claude can programmatically drive any inkx app via inkx/runtime
2. Easy test authoring with the new app.press() / app.text API
3. Good documentation and examples for AI-assisted testing

## Approach

Since @km/silvery-legacy/loop is complete, leverage:

- createRenderer() from inkx/testing
- app.press(key) for input simulation
- app.text / app.ansi for output assertions
- Frame iteration for fuzz testing

## Deliverables

- Document the testing patterns for Claude Code
- Ensure inkx/testing exports are complete
- Add examples showing AI-driven testing patterns

