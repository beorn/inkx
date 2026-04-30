---
id: "@km/inbox/hkk4"
aliases:
  - km-hkk4
  - "@km/_orphan/hkk4"
created_at: 2026-01-20T14:25:37Z
closed_at: 2026-01-20T14:36:54Z
---

# [x] inkx: warnedBgConflicts global Set never clears @km/_orphan #bug #P1

High: content-phase.ts:465 has module-level warnedBgConflicts Set that never clears. Causes memory leak in long-running apps and warnings don't repeat even after user fixes issues. Should clear between render cycles or provide explicit reset.