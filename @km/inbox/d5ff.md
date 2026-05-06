---
mentions:
  - km
id: "@km/inbox/d5ff"
aliases:
  - km-d5ff
  - "@km/_orphan/d5ff"
created_at: 2026-01-20T15:54:59Z
closed_at: 2026-01-20T16:00:39Z
---

# [x] All views: Column/section heads styling doesn't match design @km/_orphan #bug #P2

## Problem

Column and section headings don't match the design system colors:

- Default: bolded white
- Cursor in item inside: bolded yellow
- Selected: cyan bg with bolded black fg
- Section has own color: colored bg with bolded white fg

## Reproduction

1. Open km TUI
2. Observe column/section headings
3. Styling doesn't match the above spec

## Expected

Headings should use correct colors per the design system.

