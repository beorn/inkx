---
id: "@km/inkx/driver-migrate"
aliases:
  - km-inkx.driver-migrate
  - km-inkx-driver-migrate
created_at: 2026-02-04T15:25:21Z
closed_at: 2026-02-06T12:03:48Z
---

# [x] inkx: migrate km-tui to new patterns @km/inkx #task #P4

Migrate @km/tui to use new patterns consistently after all prior phases complete.

## Tasks
1. Replace processKeyWithContext usage with withKeybindings
2. Use app.cmd.* in all tests instead of manual dispatching
3. Add getState() for AI introspection

## Depends On
- @km/silvery-legacy/driver-spike (completed)
- @km/silvery-legacy/driver-docs (completed)
- @km/silvery-legacy/driver-split (evaluated)