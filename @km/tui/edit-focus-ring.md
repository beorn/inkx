---
id: "@km/tui/edit-focus-ring"
aliases:
  - km-tui.edit-focus-ring
  - km-tui-edit-focus-ring
created_by: claude:a5c7f7de
created_at: 2026-02-14T21:46:21Z
closed_at: 2026-02-16T11:54:02Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Light blue focus ring for text edit mode across all editable fields @km/tui #feature #P3 @claude:a5c7f7de

Cyan border = 'you are typing here.' Reserved exclusively for active text input focus. No other UI element uses cyan borders.

**Card inline edit**: Card border → cyan when editing. (done)

**Column header edit**: Cyan BORDER (not blueBright background). Change current backgroundColor approach to border-based.

**Body block edit**: Cyan border appears when editing — even if block was previously borderless.

**Dialog input fields**: Search, NewItem, DatePrompt, ProjectPicker — input field area inside dialog gets cyan border. Dialog OUTER border must NOT be cyan — use neutral color (white/gray).

**Cyan exclusivity**: No non-editable UI element uses cyan border. Change ModalDialog default from cyan to neutral. Change HelpOverlay, DetailPane cyan borders to neutral.