---
mentions:
  - km
id: "@km/tui/duplicate-on-edit"
aliases:
  - km-tui.duplicate-on-edit
  - km-tui-duplicate-on-edit
created_by: claude:db326126
created_at: 2026-03-30T18:54:27Z
closed_at: 2026-03-30T19:55:10Z
close_reason: "Fixed: handleTitleSave in tree-node-edit.tsx only updated content
  but not name. For outline nodes (folders/sections), name drives filesystem
  ops. Fix: handleTitleSave now also updates name, matching
  handleInlineEditConfirm behavior."
owner: bjorn@stabell.org
---

# [x] [bug] Editing node name creates duplicate instead of renaming @km/tui #bug #P1

Root cause found: inline editor appends typed characters to folder/section names instead of replacing. User edited 'Views' title → created 'Viewsk' then 'Viewsff' folders. Git status shows deleted files from Viewsk/ and new untracked Viewsff/ directory. The original Views/ folder also still exists, resulting in duplicate cards. The inline edit save logic for heading/folder nodes is appending the edit character instead of using the full edited text.

