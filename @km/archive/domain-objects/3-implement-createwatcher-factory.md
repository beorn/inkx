---
mentions:
  - km
id: "@km/domain-objects/3-implement-createwatcher-factory"
aliases:
  - km-domain-objects.3
  - km-domain-objects-3
  - "@km/domain-objects/3"
created_at: 2026-01-23T10:22:02Z
closed_at: 2026-01-23T11:25:55Z
---

# [x] Implement createWatcher factory @km/domain-objects #task #P2

Extract Watcher from SyncManager as domain object.

- Implements Service (AsyncDisposable)
- Returned by vault.watch()
- Event emitter pattern for changes

See plan for full interface.

