---
id: "@km/tui/ui-chrome"
aliases:
  - km-tui.ui-chrome
  - km-tui-ui-chrome
created_by: claude:d3a7049b
created_at: 2026-02-22T00:24:46Z
closed_at: 2026-02-22T10:10:16Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] UI chrome redesign: status bar, command box, help @km/tui #feature #P2 @claude:d3a7049b

## Problem

Current bottom area has two bars (KeyBar + BottomBar) that duplicate info, waste vertical space, and don't scale to wide terminals. The KeyBar permanent cheat sheet is too intrusive. The BottomBar shows info that could live elsewhere.

## Design

### Remove
- **KeyBar** (permanent key hints) — replaced by `?` help overlay + WhichKey chord popup
- **BottomBar** (DISK/NODE/count/VIEW) — info moves to top bar + command box

### Top bar
- Left: breadcrumb path `~/vault › board` (scoped to the pane, see @km/tui/windowing)
- Right: node count, view type (`42 nodes · cards`)
- Title embedded in pane border (like Claude Code style)

### Command box
A compact widget inside/below the focused pane:
- **Mode pill**: oval (Nerd Font powerline glyphs `` for rounded ends) — NORMAL (green), INSERT (yellow), VISUAL (cyan), MOVE (magenta)
- **Prompt**: `❯` in normal, `:` in command mode, `/` in search
- **Active input**: command palette query, search pattern, chord sequence `g…`
- **Transient feedback**: `✓ Moved to Inbox` (green), `✗ Cannot move root` (red), auto-clears after 2s
- **Idle state**: just `NORMAL ❯` — clean and quiet

### Notifications
- Transient (action feedback) → command box, auto-clear
- Persistent (sync conflict, import complete) → badge/counter in top bar, key to expand

### Help
- WhichKey popup (chord hints) → floats above command box
- Full help overlay (`?`) → stays as modal dialog, centered
- No permanent key hints bar

### Wide terminal consideration
Don't spread info to edges. Keep everything left-clustered or in pane borders. Full-width background bars look empty at 150+ cols. Pills/breadcrumbs are self-contained units that scale to any width.

## Prototype
See `tmp-ui-screenshot.tsx` and `~/Desktop/km-ui-prototype.png` for visual mockups (styles A-G, layouts 1-3).

## Dependencies
- @km/tui/windowing (pane borders, per-pane breadcrumbs, command box placement)
- @km/silvery-legacy/tea (focus system for "focused pane" concept)