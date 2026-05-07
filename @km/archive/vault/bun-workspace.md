---
mentions:
  - km
id: "@km/vault/bun-workspace"
aliases:
  - km-vault.bun-workspace
  - km-vault-bun-workspace
created_by: claude:f53c94c1
created_at: 2026-03-27T22:53:22Z
closed_at: 2026-03-27T22:59:54Z
close_reason: Moved to ~vault/.beads
owner: bjorn@stabell.org
---

# [x] Set up ~vault as bun workspace with sync scripts @km/vault #task #P1

Add package.json with bun scripts: pull (rclone Drive→local), push (local→Drive with dry-run), status (diff), and init (first-time copy). Also git config for binary files.

