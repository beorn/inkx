---
id: "@km/storage/add-path-warn"
aliases:
  - km-storage.add-path-warn
  - km-storage-add-path-warn
created_by: claude:084f044c
created_at: 2026-02-12T13:13:15Z
closed_at: 2026-02-12T14:12:15Z
owner: bjorn@stabell.org
assignee: claude:586bad48
---

# [x] Warn when add= rule paths point outside the repo @km/storage #bug #P3 @claude:586bad48

When a column heading has an add= rule with a path pattern (e.g., add="./inbox/**" or add="../other-repo/**"), and the resolved path falls outside the repo root, the query silently returns no results. This is confusing — the user expects nodes to appear but nothing happens.

Add a warning (log + possibly toast in TUI) when:
1. An add= rule contains a path-like query (starts with ./ or ../ or /)
2. The resolved path is outside the repo root directory

Implementation: In evaluateAddRule() (packages/@km/storage/src/db-rules.ts), after resolving the query, check if path patterns resolve outside the repo. Emit a warning via the logger. The TUI can surface this via the console/toast system.