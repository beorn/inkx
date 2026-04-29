---
id: "@km/_orphan/6lkh"
aliases:
  - km-6lkh
created_at: 2026-01-20T10:37:49Z
closed_at: 2026-01-20T10:48:28Z
---

# [x] Add CJK character width tests to inkx @km/_orphan #task #P0

Ensure double-width CJK characters render correctly in inkx.

Tests needed:
- Chinese characters (中文)
- Japanese characters (日本語)  
- Korean characters (한국어)
- Mixed CJK and ASCII text
- CJK in truncation scenarios
- CJK in scrolling containers

This is critical because ink has multiple issues with CJK rendering and width calculation.