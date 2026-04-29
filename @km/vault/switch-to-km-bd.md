---
id: "@km/vault/switch-to-km-bd"
aliases:
  - km-vault.switch-to-km-bd
  - km-vault-switch-to-km-bd
created_by: claude:f53c94c1
created_at: 2026-03-27T22:53:40Z
closed_at: 2026-03-27T22:59:54Z
close_reason: Moved to ~vault/.beads
owner: bjorn@stabell.org
---

# [x] Switch ~vault issue tracking from beads to km bd @km/vault #task #P2

Currently ~vault uses standalone beads (bd). Migrate to using km's built-in bd command so issues are part of the km ecosystem. Evaluate what's needed — may need km bd to work without the full km repo, or the vault .km/ may be sufficient.