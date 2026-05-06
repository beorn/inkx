---
mentions:
  - km
  - claude
id: "@km/tui/input-leverage"
aliases:
  - km-tui.input-leverage
  - km-tui-input-leverage
created_by: claude:d3a7049b
created_at: 2026-02-20T14:11:46Z
closed_at: 2026-02-20T14:49:58Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Leverage full Kitty + mouse input in km TUI @km/tui #feature #P2 @claude:d3a7049b

With inkx now supporting full Kitty protocol and SGR mouse, wire these into km TUI for a dramatically better input experience.

## Keyboard (Kitty protocol)

- **Cmd+hjkl** for node shifting — DONE (@km/infra/kitty-proto), works on Ghostty
- **Cmd+Z/Cmd+Shift+Z** — native undo/redo (currently Alt+u/Alt+r workaround)
- **Cmd+S** — save/sync (currently no shortcut)
- **Cmd+F** — search/filter (currently /)
- **Cmd+Enter** — create sibling, **Cmd+Shift+Enter** — create child
- **Key repeat events** — smooth continuous scroll when holding j/k (currently discrete)
- **Key release events** — hold Space to peek detail pane, release to dismiss
- **Option aliases** — keybindings accept opt/cmd as aliases for meta/super
- **Auto-detection** — Kitty protocol enabled automatically, graceful fallback on legacy terminals

## Mouse

- **Click** on card/node → select (move cursor to that item)
- **Click** on fold toggle (▸/▾) → expand/collapse
- **Click** on column header → focus column
- **Ctrl+Click** → multi-select nodes
- **Cmd+Click** on URL → open in browser
- **Scroll wheel** in columns → scroll the column
- **Scroll wheel** in detail pane → scroll detail content
- **Drag** (future) → reorder nodes

## Hit Registry Integration

Wire the existing HitRegistry into km TUI components:

- TreeNode registers click regions for each node
- CardColumn registers scroll areas and headers
- DetailPane registers its scroll area
- Dialog/modal components register at higher z-index

## Implementation Notes

Depends on inkx Kitty + mouse runtime wiring being complete (@km/silvery-legacy/kitty-auto, @km/silvery-legacy/mouse-runtime).
The command system already supports super modifier — this is about wiring mouse events and adding new Cmd+ shortcuts.

