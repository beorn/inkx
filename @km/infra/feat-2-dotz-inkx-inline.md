---
mentions:
  - km
  - claude
id: "@km/infra/feat-2-dotz-inkx-inline"
aliases:
  - km-infra.feat-2-dotz-inkx-inline
  - km-infra-feat-2-dotz-inkx-inline
created_at: 2026-01-28T23:07:41Z
closed_at: 2026-01-29T01:03:02Z
assignee: claude:18380d7e
---

# [x] DotzReporter: use inkx inline mode with single component @km/infra #feature #P2 @claude:18380d7e

## Requirements

1. Single React component for both TTY and non-TTY modes
2. TTY: `render(term, <App />, { mode: 'inline' })`
3. Non-TTY: `renderString(<App />)`
4. All output through inkx (layout, colors, dots)
5. No direct stdout writes

## Current Issue

Inline mode cursor positioning conflicts with vitest output, causing garbled display.

## Needs Investigation

- How inkx inline mode handles updates
- Why cursor positioning interferes with vitest
- Whether inkx needs fixes for this use case

