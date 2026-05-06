---
mentions:
  - km
  - claude
id: "@km/silvery/textarea-autosize"
aliases:
  - km-silvery.textarea-autosize
  - km-silvery-textarea-autosize
created_by: claude:611e701e
created_at: 2026-04-26T06:28:49Z
closed_at: 2026-04-26T07:24:45Z
close_reason: "Shipped: silvery d089c603 (CSS-aligned fieldSizing API, drops
  legacy height, defaults to content+minRows=1+maxRows=8 for chat-input shape) +
  km root 0a1452980 (silvercode CommandBox migration). Companion docs in same
  commit."
started_at: 2026-04-26T06:40:59Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.textarea-autosize
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-25T23:30:11Z
    created_by: claude:611e701e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] silvery TextArea: replace required `height` with `fieldSizing` + `rows` (CSS field-sizing model) @km/silvery #feature #P2 @claude:2405c72e

blocks:: [[@km/silvery]]

silvery TextArea currently requires a numeric `height` prop, forcing every consumer that wants chat-style auto-grow (silvercode CommandBox, @km/tui omnibox, edit fields, …) to recompute the wrap math the framework already runs internally.

Symptoms when consumers omit the math:

- `height={inputValue.split('\\n').length}` clamps to logical newlines; soft-wrapped rows clip under the box edge.
- Long single-line input visually disappears past the right edge instead of flowing onto a second row.

Symptoms when consumers DO the math (current silvercode workaround at `apps/silvercode/src/components/CommandBox.tsx` `CommandTextArea`):

- Wrap algorithm now runs twice (once in `useTextArea`, once via `countVisualLines`) — single source of truth violated.
- First-render `useBoxRect()` returns 0; consumers must invent a fallback wrap width.
- Each consumer reinvents the auto-grow logic — exactly the anti-pattern km CLAUDE.md warns about (~700 LOC duplicated in UnifiedOmnibox because PickerDialog/TextInput/useReadline already existed).

Once this lands, the silvercode CommandTextArea wrapper collapses to `<TextArea autoSize maxRows={8} />` and @km/tui can adopt the same prop wherever it has a chat/omnibox-style input.

