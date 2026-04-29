---
id: "@km/silvery/example-improvements"
aliases:
  - km-silvery.example-improvements
  - km-silvery-example-improvements
created_by: claude:55df8ef1
created_at: 2026-03-09T22:56:09Z
closed_at: 2026-03-10T19:20:50Z
close_reason: >-
  All 11 showcases migrated from custom event bus to silvery's RuntimeContext.


  - Keyboard input: useInput from @silvery/term/xterm (via RuntimeContext)
  replaces custom emitInput/useInput event bus

  - Mouse: SGR protocol via xterm-provider replaces manual DOM click handler

  - Focus: Provider onFocus callback replaces manual textarea event listener

  - shared.tsx slimmed: removed emitInput, custom useInput, parseKey. Kept
  useMouseClick, useTermFocused, KeyHints.

  - showcase-app.tsx and viewer-app.tsx updated to use renderToXterm input
  option
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Improve silvery.dev live demo showcases @km/silvery #task #P2 @claude:55df8ef1

Improve the interactive showcases on silvery.dev to be more polished and functional.

## Items

1. **All showcases**: Import from `silvery` instead of `@silvery/term`
2. **Coding agent**: Make it more like the CLI coding agent example — use scrollback, streaming output
3. **Kanban**: Make mouse-clicking work to select cards
4. **CLI wizard**: Cursoring doesn't work — make it look nicer
5. **Log viewer** (and others): Backspace/delete doesn't work
6. **Scroll list**: Make clicking on items work
7. **Layout feedback** (and others): Appears broken after window resize
8. **Focus panels**: Make it possible to click to focus
9. **Text input**: Backspace/delete doesn't work — focus ring should be more obvious (blue outline)
10. **Theme explorer**: Add a theme explorer example (link to full theme playground)

## Context
These are the xterm.js-rendered showcases in `examples/web/showcases.tsx` embedded on silvery.dev via iframes. They use `renderToXterm()` and the `emitInput()` event bus for keyboard input.

Key files:
- `vendor/silvery/examples/web/showcases.tsx` — all showcase components
- `vendor/silvery/examples/web/showcase-app.tsx` — xterm.js mounting
- `vendor/silvery/examples/web/viewer-app.tsx` — unified viewer chrome