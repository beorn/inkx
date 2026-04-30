---
id: "@km/inbox/storage-dup-folders"
aliases:
  - km-storage-dup-folders
  - "@km/_orphan/storage-dup-folders"
created_at: 2026-02-01T16:11:59Z
closed_at: 2026-02-02T21:56:15Z
---

# [x] Duplicate folder entries in database cause UI issues @km/_orphan #bug #P1

When syncing a vault, duplicate folder nodes are created for the same fs_path. This causes: 1) Incorrect child counts, 2) Potential cursor/navigation bugs, 3) Wasted memory/storage. Found in vault8: Home, Office, Health, Kinship, and year folders all have duplicates.