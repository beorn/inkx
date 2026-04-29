---
id: "@km/storage/save-roundtrip"
aliases:
  - km-storage.save-roundtrip
  - km-storage-save-roundtrip
created_at: 2026-02-08T22:05:18Z
closed_at: 2026-02-11T16:51:16Z
assignee: claude:dffe6eeb
---

# [x] Save roundtrip: TUI edit doesn't write to filesystem and board doesn't re-render @km/storage #bug #P2 @claude:dffe6eeb

Two issues reported with 'km view /tmp/vt':

1. **TUI edit doesn't write to filesystem**: data.updateNode() updates the DB but the filesystem file is not updated with the new content.

2. **Board doesn't re-render after save**: After inline edit save, the board view doesn't refresh to show updated text.

## Investigation findings

- Previous fix (@km/tui/save-rerender, closed 2026-02-07) fixed emitter.emit() not passing {db} in db-ops.ts. This may have regressed or the fix was incomplete.

- bidirectional-sync.slow.test.ts has a pre-existing failing test: 'TUI edit during filesystem sync doesn't cause data loss' — race condition where reconcileIfChanged overwrites TUI edits.

- The save path: repo.updateNode() → dataStore.updateNode() → emitter.emit() → fsSync.applyEventToFs() → handleNodeUpdated() → writeQueue.queue(). All wiring appears correct in code.

## Requested deliverables

- Round-trip integration tests:
  - TUI edit → DB update → filesystem write → verify file content
  - Filesystem edit → DB update → board refresh event
- Fix the pre-existing race condition test failure
- Verify save works in production km view