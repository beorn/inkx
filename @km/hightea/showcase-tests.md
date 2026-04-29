---
id: "@km/hightea/showcase-tests"
aliases:
  - km-hightea.showcase-tests
  - km-hightea-showcase-tests
created_by: claude:fbad9cb1
created_at: 2026-03-06T09:26:50Z
closed_at: 2026-03-06T09:44:52Z
---

# [x] Playwright tests for web showcase demos on hightea.dev @km/hightea #task #P1

The web showcases on hightea.dev (dashboard, kanban, data-explorer, cli-wizard, dev-tools, coding-agent, text-input, scroll, focus, layout-feedback) often have visual bugs: overlapping output, input not accepted, variables not updating, layout broken. These are the first thing potential users see.

## Problem
No automated testing for the web showcases. Bugs are only caught when someone visits the site and notices. The showcases use renderToXterm() which renders real hightea output to xterm.js in the browser — so bugs here are real rendering/interaction bugs.

## Approach
Create Playwright browser tests that:
1. Load each showcase HTML page (showcase.html?demo=X)
2. Wait for xterm.js to initialize and render
3. Verify expected text appears in the terminal canvas
4. Send keyboard input and verify the UI responds
5. Check for visual regressions (overlapping text, missing borders)

## Test matrix (10 showcases):
- dashboard: renders multi-pane layout, time updates
- kanban: arrow keys navigate columns/cards, text renders in cards
- data-explorer: filter input works, table renders
- cli-wizard: step navigation works
- dev-tools: log entries appear on key press
- coding-agent: text input works, messages appear
- text-input: typing works, cursor moves
- scroll: arrow keys scroll list, selection visible
- focus: Tab cycles focus between panels
- layout-feedback: width/height values are non-zero (bug was just fixed!)

## Infrastructure
- Use Playwright (already a dev dependency)
- Test files in vendor/hightea/tests/web/ or similar
- Can run against dev server (bun run docs:dev) or built static files
- xterm.js canvas can be queried via xterm's API or screenshot comparison

## Key challenge
xterm.js renders to canvas, not DOM text. Options:
1. Use xterm's buffer API via page.evaluate() to read terminal text
2. Screenshot comparison with visual regression testing
3. Both — text assertions for logic, screenshots for visual regressions