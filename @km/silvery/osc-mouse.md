---
id: "@km/silvery/osc-mouse"
aliases:
  - km-silvery.osc-mouse
  - km-silvery-osc-mouse
created_by: claude:d697f216
created_at: 2026-02-25T14:21:04Z
closed_at: 2026-03-09T23:48:55Z
close_reason: "Already implemented: MouseCursorShape type,
  setMouseCursorShape(), resetMouseCursorShape() in packages/term/src/output.ts.
  Exported from term index. 3 tests pass."
owner: bjorn@stabell.org
---

# [x] OSC 22 mouse cursor: text cursor in textarea, pointer on clickable, default elsewhere @km/silvery #feature #P2

Implement OSC 22 mouse cursor shape changing for km TUI:
- Text insertion cursor (I-beam): hovering over textarea with focus outline
- Click/select cursor (pointer): hovering over clickable items (links, buttons, cards)
- Default cursor: everywhere else

Questions:
- Performance: does changing cursor on every mouse move cause flickering/lag?
- Terminal support: iTerm2, Kitty, WezTerm likely yes
- May need debouncing
- Must include hightea tests and docs

Note: @km/silvery-legacy/osc-mouse is the existing bead for the hightea layer. This bead tracks the km TUI integration.