---
mentions:
  - km
id: "@km/inbox/nnvd"
aliases:
  - km-nnvd
  - "@km/_orphan/nnvd"
created_at: 2026-01-20T15:54:59Z
closed_at: 2026-01-20T16:00:39Z
---

# [x] TabsView: Column head right padding doesn't get bg color @km/_orphan #bug #P2

## Problem

In tabs view, column head titles should have space padding on left and right, but the right padding doesn't get the background color.

## Reproduction

1. Open km TUI in tabs view
2. Look at column/tab headings
3. Left padding has bg color, right padding doesn't

## Expected

Both left and right padding should have the background color.

