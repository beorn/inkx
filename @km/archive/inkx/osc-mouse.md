---
mentions:
  - km
id: "@km/inkx/osc-mouse"
aliases:
  - km-inkx.osc-mouse
  - km-inkx-osc-mouse
created_by: claude:d697f216
created_at: 2026-02-25T13:21:55Z
closed_at: 2026-03-04T12:44:41Z
owner: bjorn@stabell.org
---

# [x] OSC 22: set mouse cursor shape (pointer on links) @km/inkx #feature #P2

OSC 22: set mouse cursor shape based on context.

Use cases for km TUI:

- **Text insertion cursor** (I-beam): when hovering over a textarea with focus outline (editing mode)
- **Click/select cursor** (pointer): when hovering over any clickable item (links, buttons, cards)
- **Default cursor**: everywhere else

Feasibility questions:

- Performance: does changing cursor shape on every mouse move cause flickering or lag?
- Terminal support: which terminals support OSC 22? (iTerm2, Kitty, WezTerm likely yes)
- Debouncing: may need to debounce cursor changes to avoid excessive OSC writes

Implementation:

1. Add setMouseCursor(shape) to inkx (OSC 22 sequence)
2. Add cursor shape to hit-test metadata (each node can declare its cursor style)
3. On mouse move, resolve cursor shape from hit-test and send OSC 22 if changed
4. Must include tests and docs update in inkx

