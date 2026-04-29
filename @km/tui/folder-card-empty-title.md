---
id: "@km/tui/folder-card-empty-title"
aliases:
  - km-tui.folder-card-empty-title
  - km-tui-folder-card-empty-title
created_by: Bjørn Stabell
created_at: 2026-04-14T05:23:11Z
closed_at: 2026-04-14T06:48:17Z
close_reason: InlineMention no longer swallows single-sigil titles when the
  sigil matches column excludedSigils — see commit 0e6d8d545
---

# [x] Folders without _index.md show empty/dim title above first child @km/tui #bug #P2

blocks:: [[@km/tui]]

In ~vault/areas, folders like @home, @family, @office, @health (no _index.md) render as cards where the folder name is empty/dim, and the first child file's H1 is shown as a body row. User reported: 'many nodes that were recently renamed to @... seems to be missing a title/name'. Likely the folder card renders the folder name in a dim/muted style that's hard to read, OR something in the title resolution prefers child H1 over folder name. Check apps/@km/tui/src/views/TreeNode.tsx getDisplayContent for folder fstype handling.