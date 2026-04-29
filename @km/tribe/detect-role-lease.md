---
id: "@km/tribe/detect-role-lease"
aliases:
  - km-tribe.detect-role-lease
  - km-tribe-detect-role-lease
created_by: claude:19080504
created_at: 2026-03-30T19:45:15Z
closed_at: 2026-03-30T19:46:44Z
close_reason: "Fixed: detectRole checks leadership table first. If valid lease
  exists, new sessions always become members. Published v0.6.1."
---

# [x] detectRole() should check leader lease, not just heartbeats @km/tribe #bug #P2

detectRole() only checks if a chief heartbeat exists. Long-running sessions predate the lease code and become false chiefs. Fix: detectRole should check the leadership table — if a valid lease exists (lease_until > now), don't claim chief regardless of heartbeat state.