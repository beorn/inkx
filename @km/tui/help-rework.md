---
mentions:
  - km
id: "@km/tui/help-rework"
aliases:
  - km-tui.help-rework
  - km-tui-help-rework
created_by: claude:d3a7049b
created_at: 2026-02-20T16:28:27Z
closed_at: 2026-02-20T18:18:38Z
owner: bjorn@stabell.org
---

# [x] Rework Help dialog for systematic keybindings (chord groups, consistency) @km/tui #feature #P2

The Help dialog (? key) needs a structural rework now that keybindings are systematic with chord prefixes.

## Current state

- Flat list of key-action pairs grouped loosely by category
- Does not highlight the g/m/a/t chord system or the consistency across prefixes
- Does not show that g/m/a all share the same location suffixes (i=inbox, j=journal, h=home, etc.)

## Target state

Organized around the systematic structure:

1. **Chord prefixes** as a first-class section showing the verb x location matrix:
- g: go-to (gi=inbox, gj=journal, gh=home, ge=archive)
- m: move-to (mi=inbox, mj=journal, mh=home, mp=parent)
- a: add/link (a#=tag, a@=assign, a+=project, a[=backlink)
- t: task props (td=due, ts=status, t!=priority, to=owner)
- Shared suffixes highlighted to show the pattern
8. **Navigation** (hjkl, gg/G, z/Z zoom, J/K block nav, {/} history)
9. **Actions** (o/O new, d cut, y copy, p paste, e archive, x done, u/U undo/redo)
10. **Selection** (Space toggle, v visual, Shift+arrows extend)
11. **Modes** (i/Enter edit, Escape layering, P smart pane)
12. **Ctrl layer** (Ctrl+F find, Ctrl+K omnibox)

Should feel like a cheat sheet you actually want to reference. Possibly scrollable or multi-page.

