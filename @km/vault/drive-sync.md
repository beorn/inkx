---
id: "@km/vault/drive-sync"
aliases:
  - km-vault.drive-sync
  - km-vault-drive-sync
created_by: claude:f53c94c1
created_at: 2026-03-27T22:53:04Z
closed_at: 2026-03-27T22:59:54Z
close_reason: all steps complete
owner: bjorn@stabell.org
---

# [x] Drive → Vault sync pipeline @km/vault #epic #P2

Set up rclone-based sync between Google Drive folders and ~vault local copies. Each folder gets a pull/push script with dry-run safety. Git tracks local changes for undo. km browses local copies safely.