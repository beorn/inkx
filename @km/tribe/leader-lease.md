---
id: "@km/tribe/leader-lease"
aliases:
  - km-tribe.leader-lease
  - km-tribe-leader-lease
created_by: claude:19080504
created_at: 2026-03-26T17:11:33Z
closed_at: 2026-03-26T17:25:40Z
close_reason: All fixed and pushed. From GPT 5.4 Pro review triage.
---

# [x] Leader lease table for chief election @km/tribe #feature #P2

Multiple chiefs can coexist. Add leadership table with lease_until, holder_session_id, term. Only lease holder can emit assign/verdict. Prevents split-brain.