---
id: "@km/_orphan/bquv"
aliases:
  - km-bquv
created_at: 2026-01-20T10:38:38Z
closed_at: 2026-01-20T11:52:12Z
---

# [x] Add Home/End key handling tests to inkx @km/_orphan #task #P2

Ink PR #829 added Home/End key support. Verify inkx handles these correctly.

Test cases:
1. Home key detection in useInput
2. End key detection in useInput  
3. Shift+Home / Shift+End combinations
4. Cross-terminal compatibility

Reference: https://github.com/vadimdemedes/ink/pull/829