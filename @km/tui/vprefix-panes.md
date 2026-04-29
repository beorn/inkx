---
id: "@km/tui/vprefix-panes"
aliases:
  - km-tui.vprefix-panes
  - km-tui-vprefix-panes
created_by: claude:b3bb3c86
created_at: 2026-02-24T16:16:46Z
closed_at: 2026-02-24T18:05:45Z
owner: bjorn@stabell.org
---

# [x] Unify view + pane keybindings under v prefix @km/tui #feature #P1

Reorganize keybindings: merge pane operations into v-prefix chords, remove Ctrl+W chord prefix (becomes text delete-word), add V=view settings bare key.

Changes:
- V (bare) = view settings (filter/group/view-mode/icon-mode)
- Ctrl+v = alternative v chord prefix
- v , = view settings
- v - = reset view (clear filters) [keep]
- v v = visual mode [keep]
- v m/i = cycle view/icons [keep]
- v c/C/d = collapse/ignored/done [keep]

PANES (under v prefix):
- v h/l = focus pane left/right
- v H/L = swap pane left/right
- v </>/= = grow/shrink/equalize pane
- v n/N = focus next/prev pane (remove bare n/N)
- v w = close pane
- v o = close other panes

Ctrl+W: delete word backward in text mode, noop in normal mode

Conflicts to resolve: v h was ignore_node (needs new binding)