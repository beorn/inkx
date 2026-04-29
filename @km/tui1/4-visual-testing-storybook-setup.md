---
id: "@km/tui1/4-visual-testing-storybook-setup"
aliases:
  - km-tui1.4
  - km-tui1-4
  - "@km/tui1/4"
created_at: 2026-01-16T23:46:19Z
closed_at: 2026-01-17T00:40:59Z
---

# [x] Visual testing storybook setup @km/tui1 #task #P2

Set up comprehensive visual testing using the storybook pattern.

## Background

TUI2 has a storybook at apps/@km/tui/packages/@km/_orphan/opentui/src/storybook.tsx that allows visual testing of components. TUI1 should have equivalent coverage.

## Current State

TUI1 has tests at:
- apps/@km/tui/packages/@km/_orphan/ink/tests/storybook.tsx

## Tasks

- [ ] Verify TUI1 storybook covers all view modes (list, columns, cards, tabs)
- [ ] Add edge cases (long text, many items, empty states)
- [ ] Document how to run and capture storybook screenshots
- [ ] Integrate with ttyd + Playwright workflow from @km/tui1/3-add-headless-testing-infrastructure-force-tty

## Acceptance Criteria

- [ ] Storybook renders all 4 view modes
- [ ] Edge cases documented and testable
- [ ] Can capture screenshots headlessly