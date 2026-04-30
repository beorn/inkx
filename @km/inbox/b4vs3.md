---
id: "@km/inbox/b4vs3"
aliases:
  - km-b4vs3
  - "@km/_orphan/b4vs3"
created_by: claude:b92140a2
created_at: 2026-03-17T15:05:10Z
closed_at: 2026-03-17T20:28:00Z
close_reason: Default changed to metadata. 12 tests updated to explicitly set
  none where needed.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] Change default materialization from none to metadata @km/_orphan #task #P2 @claude:b92140a2

User wants index files auto-created when folder gets a title/body, but NOT for ordering changes. Default materialization should be 'metadata' (title + body only), not 'none'. Requires updating ~10 E2E tests that assume none as default.