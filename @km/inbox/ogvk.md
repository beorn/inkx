---
id: "@km/inbox/ogvk"
aliases:
  - km-ogvk
  - "@km/_orphan/ogvk"
created_at: 2026-01-22T07:57:26Z
closed_at: 2026-01-22T08:01:25Z
---

# [x] Design iteration 3: Startup event buffering @km/_orphan #task #P2

Init gap addressed via heartbeat reconciliation (added in @km/_orphan/0zwm). Added chaos test for init_gap scenario. Full startup buffering deferred - heartbeat catches any gaps within 60s.