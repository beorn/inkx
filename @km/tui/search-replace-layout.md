---
mentions:
  - km
  - claude
id: "@km/tui/search-replace-layout"
aliases:
  - km-tui.search-replace-layout
  - km-tui-search-replace-layout
created_by: claude:d697f216
created_at: 2026-02-25T14:51:51Z
closed_at: 2026-02-25T17:18:54Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] Find & Replace dialog: broken layout after ModalDialog migration @km/tui #bug #P1 @claude:d697f216

The dialog agent migrated SearchReplaceDialog from raw Box to ModalDialog, which added double borders, paddingX=2, paddingY=1, title bar, and footer structure. This made the dialog too large/padded and broke the compact layout.

Need to either:

1. Revert to raw Box layout with targeted styling fixes (focus outline, regex checkmark)
2. Or adjust ModalDialog props to work for compact dialogs (less padding)

