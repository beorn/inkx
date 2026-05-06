---
mentions:
  - km
  - claude
id: "@km/tui/edit-context"
aliases:
  - km-tui.edit-context
  - km-tui-edit-context
created_by: claude:97217d5d
created_at: 2026-02-17T10:47:57Z
closed_at: 2026-02-17T11:24:46Z
owner: bjorn@stabell.org
assignee: claude:97217d5d
---

# [x] EditContext: unified text editing primitives in inkx @km/tui #feature #P2 @claude:97217d5d

Create a unified text editing system in inkx based on the W3C EditContext pattern. Factory function (createTermEditContext), not a class — per principles.md.

## What

1. **EditContextLike interface** — W3C-aligned subset: text, selectionStart, selectionEnd, updateText(), updateSelection(), events (textupdate, selectionchange) + term extensions (moveCursor, atBoundary, wrapWidth, stickyX)
2. **createTermEditContext()** factory — uses text-cursor.ts for visual line math, returns plain object implementing EditContextLike
3. **TextOp type** with invertOp() — {type:'insert', offset, text} ↔ {type:'delete', offset, text}. Foundation for ops-based undo.
4. **useEditContext() hook** — React hook wrapping createTermEditContext, manages lifecycle

## Where

All in vendor/beorn-inkx/ (alongside text-cursor.ts). Extract to beorn-editx later (Phase B of docs/future/universal-editor.md).

## Design Constraints (from principles.md)

- Factory function returning plain object, not class
- Explicit DI: createTermEditContext({ text, wrapWidth, ... })
- Symbol.dispose for cleanup
- No globals, no singletons
- Fail loud on invariant violations
- 50+ tests covering EditContext methods + events + text operations

## Replaces

- BlockEditTarget interface (ad-hoc version of EditContext)
- useSlateEdit internal Slate dependency (for text ops)
- useLineEdit separate implementation
- TextArea's independent cursor management

## References

- docs/future/universal-editor.md — Layer 3 (Edit Context)
- W3C EditContext API
- Current: apps/@km/tui/src/block-edit-target.ts (BlockEditTarget interface)
- Current: vendor/beorn-inkx/src/text-cursor.ts (Layer 0, stays)

