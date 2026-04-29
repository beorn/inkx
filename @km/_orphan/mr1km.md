---
id: "@km/_orphan/mr1km"
aliases:
  - km-mr1km
created_at: 2026-02-02T15:25:21Z
closed_at: 2026-02-02T16:33:53Z
---

# [x] TUI: slow cursor navigation in list/columns views @km/_orphan #bug #P1 @claude:227cdc41

Cursoring around is reported as slow in most views, especially list view. Testing with ~150 items showed acceptable performance (13-35ms per keystroke). May only manifest with very large vaults (~29k nodes in /tmp/tstN). Needs profiling with real large vault.