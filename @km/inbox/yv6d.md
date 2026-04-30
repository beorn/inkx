---
id: "@km/inbox/yv6d"
aliases:
  - km-yv6d
  - "@km/_orphan/yv6d"
created_at: 2026-01-20T10:38:17Z
closed_at: 2026-01-20T10:54:45Z
---

# [x] Verify inkx process exit timing and waitUntilExit behavior @km/_orphan #task #P1

Ink issue #796 reports no reliable way to wait for pending renders before process exit, forcing arbitrary timeout workarounds.

Test scenarios:
1. Does waitUntilExit() work reliably in inkx?
2. Does final render complete before process exits?
3. Test with rapid state changes followed by exit
4. Test with async exit handlers

Reference: https://github.com/vadimdemedes/ink/issues/796