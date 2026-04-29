---
id: "@km/_orphan/9vcwk"
aliases:
  - km-9vcwk
created_by: claude:550b034d
created_at: 2026-02-12T13:06:38Z
closed_at: 2026-02-12T13:35:06Z
---

# [x] Follow directory symlinks safely during file discovery @km/_orphan #feature #P2 @claude:550b034d

Follow symlinks to directories during initial discovery and reconciliation scan. Uses realpathSync + visited Set to prevent cycles and deduplication. Symlinks pointing inside repo root are skipped (already indexed). Loop detection emits warnings.