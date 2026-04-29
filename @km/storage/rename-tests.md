---
id: "@km/storage/rename-tests"
aliases:
  - km-storage.rename-tests
  - km-storage-rename-tests
created_at: 2026-02-04T13:20:47Z
closed_at: 2026-02-04T13:26:29Z
---

# [x] Add explicit tests for handleRename @km/storage #task #P3 @claude:9e69175d

File/folder renames have minimal explicit tests in sync test suite.

Should test:
- Rename preserves node IDs
- Updates fs_path correctly  
- Handles cross-directory moves
- Rename of folder updates all children's fs_path

See docs/archive/sync-test-coverage.md for full analysis.