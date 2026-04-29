---
id: "@km/all/priority-string"
aliases:
  - km-all.priority-string
  - km-all-priority-string
created_by: claude:aee18a0e
created_at: 2026-02-27T13:16:21Z
closed_at: 2026-03-02T23:45:28Z
owner: bjorn@stabell.org
assignee: beorn-claude
---

# [x] Priority as free-form string: priority:: P0, A, high, etc. @km/all #task #P2 @beorn-claude

Change priority from integer (0-4) to free-form string. Field name: priority:: (not p::). Keybindings t 0-4 set P0-P4 as convenience. Sorting uses string compare. Users can use any system (P0-P4, A/B/C, high/med/low). Backwards compat: read p:: and priority::, write priority::. Emoji ⏫🔼🔽 map to P1/P2/P3. Asana import maps to P1/P2/P3.