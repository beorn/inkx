---
mentions:
  - km
  - claude
id: "@km/tui/sync-pane"
aliases:
  - km-tui.sync-pane
  - km-tui-sync-pane
created_by: claude:703e68be
created_at: 2026-02-11T14:58:36Z
closed_at: 2026-02-18T08:09:31Z
owner: bjorn@stabell.org
assignee: claude:5f0aee02
---

# [x] Sync activity pane: toggleable panel showing per-file sync operations @km/tui #feature #P3 @claude:5f0aee02

Persistent, minimizable pane showing individual file sync events (synced, renamed, errors). Like Dropbox/OneDrive sync activity view. Requires: (1) per-file events from sync worker → TUI, (2) new SyncPane component, (3) keyboard toggle. Current infra only exposes aggregate WatcherStatus (state + counts) — no per-file data reaches the TUI yet.

