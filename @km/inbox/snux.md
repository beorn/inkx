---
id: "@km/_orphan/snux"
aliases:
  - km-snux
created_at: 2026-01-20T15:54:13Z
closed_at: 2026-01-20T15:54:40Z
---

# [x] ColumnsView columns too wide - need reasonable max width @km/_orphan #bug #P2

## Problem
In columns view, the columns are too wide and don't have a reasonable max width constraint like cards view does.

## Reproduction
1. Open km TUI with a board in columns view
2. Observe that columns stretch too wide, especially on wide terminals

## Expected
Columns should have a reasonable max width (similar to cards view) so they don't become excessively wide.