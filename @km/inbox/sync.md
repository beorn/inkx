---
id: "@km/inbox/sync"
aliases:
  - km-sync
  - "@km/_orphan/sync"
created_at: 2026-01-17T23:57:38Z
closed_at: 2026-01-19T21:01:12Z
---

# [x] Ensure full bidirectional sync in km view with e2e tests @km/_orphan #feature #P2

## Goal

Ensure km view has full bidirectional sync:
- TUI edit → Model → File (already works)
- File edit → Model → TUI re-render (needs verification/implementation)

## Requirements

1. File watcher detects external changes to markdown files
2. Model updates automatically when files change
3. TUI re-renders to reflect external edits
4. No data loss during concurrent edits

## Acceptance Criteria

- [ ] e2e test: Edit file externally while km view is running, TUI updates
- [ ] e2e test: Edit in TUI, verify file changes on disk
- [ ] e2e test: Rapid external edits don't cause race conditions
- [ ] Document sync behavior in docs/