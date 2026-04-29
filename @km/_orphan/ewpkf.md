---
id: "@km/_orphan/ewpkf"
aliases:
  - km-ewpkf
created_by: claude:b92140a2
created_at: 2026-03-17T15:29:17Z
closed_at: 2026-03-17T17:16:17Z
close_reason: Index file hidden from folder card list via findIndexFile() in
  kNodeToColumnView. Verified in Asana vault TTY.
---

# [x] Bug: early-orbit.md shows as column instead of board on zoom-out @km/_orphan #bug #P1

When viewing a parent folder (e.g., stabell), child folders with same-name index files show the .md file as a visible card/column header ('early-orbit / .md'). The index file should be hidden when the folder is viewed from above — only shown when zoomed INTO the folder.

Repro: bun km view --repo imports/asana launch-academy, then Z Z Z (zoom out 3 times to stabell level).

Root cause: deriveColumnsFromRepo only does index file expansion when rootNode.fstype === 'folder'. When viewing from a parent, folder children are rendered as regular columns with their children as cards. The index file (early-orbit.md) appears as a card inside the early-orbit folder column.

Fix: In the card rendering path, when a folder's children include an index file, exclude the index file from the card list. The index file's body/sections content should be absorbed into the folder's representation.

Note: findIndexFile works correctly (verified with real Asana DB). The issue is purely in the TUI card rendering layer.