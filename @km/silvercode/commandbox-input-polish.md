---
mentions:
  - km
  - claude
id: "@km/silvercode/commandbox-input-polish"
aliases:
  - km-silvercode.commandbox-input-polish
  - km-silvercode-commandbox-input-polish
created_by: claude:611e701e
created_at: 2026-04-26T06:19:05Z
started_at: 2026-04-26T06:19:29Z
owner: bjorn@stabell.org
assignee: claude:611e701e
dependencies:
  - issue_id: km-silvercode.commandbox-input-polish
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T23:19:28Z
    created_by: claude:611e701e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [/] silvercode CommandBox: soft-wrap input, free Ctrl-E for readline @km/silvercode #bug #P2 @claude:611e701e

blocks:: [[@km/silvercode]]

Two related polish bugs in silvercode command input:

1. **CommandBox content does not wrap.** `apps/silvercode/src/components/CommandBox.tsx:202` computes height from `inputValue.split('\\n').length` — only logical newlines, not visual rows. Long single-line input flows past the box edge instead of wrapping. silvery's TextArea has `wrap='soft'` (default) but the parent height clamps it to 1 row. Use `countVisualLines(text, wrapWidth)` with `useBoxRect()` to measure the available content width.
2. **Ctrl-E always toggles permission inbox**, even while typing. `apps/silvercode/src/App.tsx:514` intercepts Ctrl-E unconditionally via the global `useInput` handler, clobbering silvery TextArea's readline 'end-of-line' (a near-universal terminal expectation). Gate the inbox shortcut on `inputValue.length === 0` so Ctrl-E falls through to TextArea when there's text to navigate.

Cmd-A 'select all' in the text field is out of scope — that's a terminal-level interception (Ghostty's default Cmd+A → 'select all in scrollback'). Requires a Ghostty config change, not a silvercode code change.

