---
id: "@km/inkz/13-visual-tests"
aliases:
  - km-inkz.13-visual-tests
  - km-inkz-13-visual-tests
created_at: 2026-01-19T12:02:52Z
closed_at: 2026-01-19T14:57:25Z
---

# [x] InkZ: Add visual regression tests for example apps @km/inkz #task #P2

## Goal

Create automated visual tests that verify example apps render correctly using ttyd + Playwright.

## Test Approach

1. Start example app with ttyd on a port
2. Wait for render (with timeout)
3. Capture screenshot via Playwright
4. Compare against baseline snapshot
5. Fail if significant differences

## Test Cases

### Dashboard
- [ ] Three panes visible with borders
- [ ] Text content visible in each pane
- [ ] Selection highlighting works

### Task List
- [ ] List items visible
- [ ] Checkbox symbols render
- [ ] Selection highlighting works

### Kanban
- [ ] Three columns visible
- [ ] Cards render with borders
- [ ] Tags display with colors

## Acceptance Criteria

- [ ] Visual tests exist for all 3 example apps
- [ ] Tests run in CI (headless)
- [ ] Baseline snapshots committed
- [ ] Tests fail on visual regression
- [ ] 10 second timeout per test
