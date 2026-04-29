---
id: "@km/tui/folder-note-same-name"
aliases:
  - km-tui.folder-note-same-name
  - km-tui-folder-note-same-name
created_by: Bjørn Stabell
created_at: 2026-04-14T17:15:46Z
closed_at: 2026-04-14T17:37:32Z
close_reason: Fixed in 27db42fcf — computeColumnChildren now expands folder-note
  children into the column when the folder has an index file.
---

# [x] <folder>.md folder-note renders empty in column view @km/tui #bug #P2

blocks:: [[@km/tui]]

Already fixed in 27db42fcf. Creating bead retroactively for history. Folder containing same-name.md (folder-note convention) rendered as (empty) column because computeColumnChildren filtered the index file without hoisting its sections. Fix: unified with expandIndexFile by splicing index file's children into the column's cards.