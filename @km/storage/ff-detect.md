---
mentions:
  - km
id: "@km/storage/ff-detect"
aliases:
  - km-storage.ff-detect
  - km-storage-ff-detect
created_by: claude:b92140a2
created_at: 2026-03-17T05:58:14Z
closed_at: 2026-03-17T06:06:47Z
close_reason: Implemented findIndexFile, isIndexFile, getChildSlotTarget in
  packages/km-tree/src/index-file.ts. 22 unit tests in
  packages/km-tree/tests/index-file.test.ts all pass.
owner: bjorn@stabell.org
---

# [x] Index file detection utility (km-tree) @km/storage #task #P2

Pure functions: findIndexFile, isIndexFile, getChildSlotTarget in packages/@km/tree/src/index-file.ts. Reusable by view and storage layers.

