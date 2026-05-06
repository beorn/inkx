---
mentions:
  - km
id: "@km/inbox/qwtw"
aliases:
  - km-qwtw
  - "@km/_orphan/qwtw"
created_at: 2026-01-20T07:44:52Z
closed_at: 2026-01-20T13:08:49Z
---

# [x] InkX: Refactor unicode.ts @km/_orphan #task #P3

## Problem

`vendor/beorn-inkx/src/unicode.ts` is 746 lines mixing concerns:

- Grapheme segmentation
- Display width calculation
- ANSI handling

## Proposed

Consider splitting into focused modules if it continues to grow.

