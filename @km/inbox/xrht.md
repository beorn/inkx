---
mentions:
  - km
id: "@km/inbox/xrht"
aliases:
  - km-xrht
  - "@km/_orphan/xrht"
created_at: 2026-01-20T07:44:25Z
closed_at: 2026-01-20T07:52:10Z
---

# [x] Remove deprecated toTreeViewModel export @km/_orphan #task #P4

## Problem

packages/@km/_orphan/board/src/transformers.ts:36 exports deprecated `toTreeViewModel` alias.
Only used in archive/@km/_orphan/opentui/src/App.tsx.

## Solution

If archive is truly unmaintained:

1. Remove from transformers.ts
2. Remove from @km/_orphan/board/src/index.ts exports (line 7)

