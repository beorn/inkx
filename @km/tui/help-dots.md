---
id: "@km/tui/help-dots"
aliases:
  - km-tui.help-dots
  - km-tui-help-dots
created_by: claude:3c24fe4a
created_at: 2026-03-17T22:38:49Z
closed_at: 2026-03-17T22:40:19Z
close_reason: "Fixed: Fill component needs flexDirection=column on fixed-width
  wrapper Box to propagate width constraint to inner flex row. Added
  flexDirection=column to column wrapper in buildContentLines."
owner: bjorn@stabell.org
assignee: claude:3c24fe4a
---

# [x] Help dialog: dot leaders missing in multi-column sections @km/tui #bug #P1 @claude:3c24fe4a

EntryLine dot leaders (Fill component) work in full-width sections (SYSTEM) but not in the 2-column layout (NAVIGATION, EDITING, etc.). The Fill box gets 0 width inside fixed-width column containers, so keys and descriptions run together without alignment.