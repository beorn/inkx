---
mentions:
  - km
id: "@km/inbox/i0qe"
aliases:
  - km-i0qe
  - "@km/_orphan/i0qe"
created_at: 2026-01-20T15:54:16Z
closed_at: 2026-01-20T15:54:40Z
---

# [x] ColumnsView blank line appears underneath many items (oneliner variant bug) @km/_orphan #bug #P2

## Problem

In columns view, many lines show up with a blank line underneath them. This appears to be a common problem with the one-liner variant.

## Reproduction

1. Open km TUI with a board in columns view
2. Observe items in the columns
3. Many items have an extra blank line underneath them

## Expected

Items should render without extra blank lines - oneliner variant should be compact.

