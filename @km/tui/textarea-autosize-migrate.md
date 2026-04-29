---
id: "@km/tui/textarea-autosize-migrate"
aliases:
  - km-tui.textarea-autosize-migrate
  - km-tui-textarea-autosize-migrate
created_by: claude:611e701e
created_at: 2026-04-26T06:33:18Z
closed_at: 2026-04-26T07:24:50Z
close_reason: "Reviewed: km-tui has no direct TextArea consumers (BodyEditField
  uses EditContextDisplay which doesn't expose height). No migration needed in
  km-tui — silvery defaults take effect automatically."
started_at: 2026-04-26T06:41:04Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-tui.textarea-autosize-migrate
    depends_on_id: km-silvery.textarea-autosize
    type: blocks
    created_at: 2026-04-25T23:33:26Z
    created_by: claude:611e701e
    metadata: "{}"
  - issue_id: km-tui.textarea-autosize-migrate
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-25T23:33:25Z
    created_by: claude:611e701e
    metadata: "{}"
---

# [x] km-tui: review EditContextDisplay/TextArea consumers for fieldSizing='content' adoption @km/tui #task #P3 @claude:2405c72e

blocks:: [[@km/silvery/textarea-autosize]], [[@km/tui]]

Once @km/silvery/textarea-autosize ships (and EditContextDisplay grows the same prop set or its own equivalent), audit @km/tui's BodyEditField (apps/@km/tui/src/views/BodyEditField.tsx — uses EditContextDisplay with explicit height) and any other text-edit surfaces to migrate where content-driven sizing improves UX. UnifiedOmnibox uses TextInput which is single-line and not affected.