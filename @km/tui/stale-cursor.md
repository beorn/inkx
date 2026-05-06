---
mentions:
  - km
  - claude
id: "@km/tui/stale-cursor"
aliases:
  - km-tui.stale-cursor
  - km-tui-stale-cursor
created_by: claude:9b6678d0
created_at: 2026-02-11T20:47:04Z
closed_at: 2026-02-12T09:58:47Z
owner: bjorn@stabell.org
assignee: claude:9b6678d0
---

# [x] Cursor node not in repo after column shift + file sync @km/tui #bug #P2 @claude:9b6678d0

After shifting a column left multiple times (Meta+h), the file watcher writes the column's .md file. If echo detection fails, the watcher re-parses the file and potentially reassigns child node IDs, making the cursorNodeId invalid.

Repro: km view -v /tmp/vt → navigate to @next column → shift left repeatedly → navigate or zoom

Symptom: Error: [nav] cursor node not in repo: <ULID>. Previously this threw and killed the event loop (app freeze). Now navigation falls back to root gracefully (see fix in view-navigation.ts).

Root cause investigation needed: why does the file watcher echo detection fail during rapid column shifts?

