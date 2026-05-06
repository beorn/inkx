---
mentions:
  - km
  - claude
id: "@km/storage/node-differ-tests"
aliases:
  - km-storage.node-differ-tests
  - km-storage-node-differ-tests
created_at: 2026-02-04T13:20:48Z
closed_at: 2026-02-04T13:26:29Z
assignee: claude:9e69175d
---

# [x] Add unit tests for diffNodes @km/storage #task #P3 @claude:9e69175d

The diffNodes function in handlers/node-differ.ts lacks direct unit tests.

Critical function for detecting what changed during file updates. Currently only tested implicitly through higher-level sync tests.

Should test:

- Structural key matching
- ID remapping (new→existing)
- Created/updated/deleted detection
- Edge cases: empty file, all nodes deleted, type changes

See docs/archive/sync-test-coverage.md for full analysis.

