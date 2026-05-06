---
mentions:
  - km
  - claude
id: "@km/tui/dialog-shared-component"
aliases:
  - km-tui.dialog-shared-component
  - km-tui-dialog-shared-component
created_by: claude:d697f216
created_at: 2026-02-25T14:20:56Z
closed_at: 2026-02-25T17:18:55Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] Shared dialog component: title, help key, blank line, content, footer @km/tui #feature #P2 @claude:d697f216

All dialogs should use a shared styling/component:

- Title: top left
- Help key [F], [?], etc: top right
- Blank line separator
- Content area
- Footer: help text - centered

Audit all existing dialogs (Omnibox, SearchDialog, FilterDialog, SearchReplaceDialog, DatePromptDialog, NewItemDialog, HelpOverlay, ProjectPicker, ConfirmDialog) for consistency.

