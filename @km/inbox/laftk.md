---
mentions:
  - km
  - claude
id: "@km/inbox/laftk"
aliases:
  - km-laftk
  - "@km/_orphan/laftk"
created_by: claude:b92140a2
created_at: 2026-03-17T08:33:08Z
closed_at: 2026-03-17T15:04:32Z
close_reason: finalizeBatchLinks now accepts fs parameter, threaded from both call sites.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] P1: Re-materialization bypasses injected FS abstraction @km/_orphan #bug #P1 @claude:b92140a2

finalizeBatchLinks() uses realFs.writeFileSync() directly instead of the injected fs parameter. Breaks test isolation and skips reconciliation — new index file exists on disk but DB doesn't know about it until next scan. Fix: thread fs through finalizeBatchLinks(), emit create op for new file.

