# Interactive Exploration

**Philosophy**: Real exploration means using AI intelligence to interactively launch the TUI, look at it, navigate, and notice what feels off. Tests are a safety net, not the main event. Observe, hypothesize, investigate.

## TTY MCP Tools Quick Reference

```
mcp__tty__start({command, cols, rows, cwd})  → {sessionId}   # Launch TUI
mcp__tty__press({sessionId, key})                              # Press a key
mcp__tty__type({sessionId, text})                              # Type text
mcp__tty__text({sessionId})                                    # Get terminal text
mcp__tty__screenshot({sessionId, outputPath})                  # Save screenshot
mcp__tty__wait({sessionId, stable, for, timeout})              # Wait for stability
mcp__tty__stop({sessionId})                                    # Kill session
mcp__tty__list()                                               # List sessions
```

**Key format**: Single chars (`j`, `k`), named keys (`Enter`, `Escape`, `ArrowDown`), modifiers (`Shift+n`, `Control+c`).

**Modifier mapping for TTY tools**: `meta` in keybindings.ts = `Meta` (Cmd on macOS) in TTY press. `alt` = `Alt`. `ctrl` = `Control`. Example: `{ key: "j", meta: true }` = press `Meta+j`.

## Complete Keybinding Reference

All keybindings from `packages/km-commands/src/keybindings.ts`. Organized by layer priority (higher layers take precedence). Context-dependent bindings noted in the "Context" column.

Source: `packages/km-commands/src/keybindings.ts` (defaultKeybindingLayers)

### Navigation

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `j` | `j` | cursor_down | Move cursor down visually |
| `k` | `k` | cursor_up | Move cursor up visually |
| `h` | `h` | cursor_left | Move cursor left (cross-column) |
| `l` | `l` | cursor_right | Move cursor right (cross-column) |
| `ArrowDown` | `ArrowDown` | cursor_down | Move cursor down visually |
| `ArrowUp` | `ArrowUp` | cursor_up | Move cursor up visually |
| `ArrowLeft` | `ArrowLeft` | cursor_left | Move cursor left (cross-column) |
| `ArrowRight` | `ArrowRight` | cursor_right | Move cursor right (cross-column) |
| `Ctrl+N` | `Control+n` | cursor_down | Move down (emacs-style, not in dialogs) |
| `Ctrl+P` | `Control+p` | cursor_up | Move up (emacs-style, not in dialogs) |
| `g` | `g` | cursor_first | Move to first item (also chord prefix, see below) |
| `G` | `Shift+g` | cursor_last | Move to last item |
| `Ctrl+D` | `Control+d` | page_down | Jump cursor down half a page |
| `Ctrl+U` | `Control+u` | page_up | Jump cursor up half a page |
| `[` | `[` | nav_back | Go back in navigation history |
| `]` | `]` | nav_forward | Go forward in navigation history |
| `Ctrl+J` | `Control+j` | sibling_board_next | Navigate to next sibling board |
| `Ctrl+K` | `Control+k` | sibling_board_prev | Navigate to previous sibling board |
| `e` | `e` | zoom_in | Focus on current node as root |
| `i` | `i` | zoom_inwards | Zoom in one level closer to selected node |
| `u` | `u` | zoom_outwards | Zoom out one level (to parent of current root) |
| `Enter` | `Enter` | enter_inline_edit | Edit node title inline (normal mode) |
| `o` | `o` | open_in_system | Open file/folder in macOS (Finder/default app) |
| `O` | `Shift+o` | open_in_terminal | Open terminal at closest folder |
| `P` | `Shift+p` | follow_link | Go to embedded link target |
| `Ctrl+Enter` | `Control+Enter` | follow_link | Go to embedded link target (alt binding) |
| `Ctrl+I` | `Control+i` | open_detail_pane | Open detail pane for current node |
| `/` | `/` | search | Open search dialog |
| `Ctrl+/` | `Control+/` | filter | Open filter dialog |
| `\` | `\` | command_palette | Open command palette |

### Selection

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `A` | `Shift+a` | select_all_progressive | Select all in column, then all in board (progressive) |
| `Ctrl+A` | `Control+a` | select_all | Select all visible nodes (not in text input) |
| `K` | `Shift+k` | extend_select_up | Extend selection upward |
| `J` | `Shift+j` | extend_select_down | Extend selection downward |
| `H` | `Shift+h` | extend_select_left | Extend selection leftward |
| `L` | `Shift+l` | extend_select_right | Extend selection rightward |
| `Shift+ArrowUp` | `Shift+ArrowUp` | extend_select_up | Extend selection upward |
| `Shift+ArrowDown` | `Shift+ArrowDown` | extend_select_down | Extend selection downward |
| `Shift+ArrowLeft` | `Shift+ArrowLeft` | extend_select_left | Extend selection leftward |
| `Shift+ArrowRight` | `Shift+ArrowRight` | extend_select_right | Extend selection rightward |

### Editing

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `m` | `m` | enter_move_mode | Start moving selected nodes |
| `Enter` (move mode) | `Enter` | confirm_move | Confirm node movement |
| `Escape` (move mode) | `Escape` | cancel_move | Cancel move operation |
| `Backspace` | `Backspace` | delete_node | Delete current node (shows confirmation) |
| `Delete` | `Delete` | delete_node | Delete current node (shows confirmation) |
| `p` | `p` | insert_above | Insert sibling above and enter inline edit |
| `n` | `n` | insert_below | Insert sibling below and enter inline edit |
| `d` | `d` | duplicate_node | Duplicate current node |
| `Meta+ArrowUp` | `Meta+ArrowUp` | shift_up | Move node up among siblings |
| `Meta+ArrowDown` | `Meta+ArrowDown` | shift_down | Move node down among siblings |
| `Meta+ArrowLeft` | `Meta+ArrowLeft` | shift_left | Move node left between columns |
| `Meta+ArrowRight` | `Meta+ArrowRight` | shift_right | Move node right between columns |
| `Meta+k` | `Meta+k` | shift_up | Move node up (vim-style) |
| `Meta+j` | `Meta+j` | shift_down | Move node down (vim-style) |
| `Meta+h` | `Meta+h` | shift_left | Move node left (vim-style) |
| `Meta+l` | `Meta+l` | shift_right | Move node right (vim-style) |
| `Tab` | `Tab` | indent_node | Reparent under previous sibling |
| `Shift+Tab` | `Shift+Tab` | outdent | Move item to parent level |
| `Ctrl+C` | `Control+c` | clipboard_copy | Copy selected node(s) (not in text input) |
| `Ctrl+X` | `Control+x` | clipboard_cut | Cut selected node(s) (not in text input) |
| `Ctrl+V` | `Control+v` | clipboard_paste | Paste node(s) (not in text input) |

### Task Properties

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `x` | `x` | cycle_task_status | Cycle task status: todo -> wip -> done -> dropped |
| `Space` | ` ` | toggle_detail_pane | Toggle detail pane for current node |

### Chords: `t` prefix (time/date)

Chords require pressing the prefix key, then the second key within a timeout. If no second key, the standalone command fires.

| Key | TTY sequence | Command | Description |
|-----|--------------|---------|-------------|
| `t` (standalone) | `t` | set_due_date | Set due date (chord timeout fallback) |
| `td` | `t` then `d` | set_due_date | Set or edit due date |
| `tr` | `t` then `r` | set_recurring | Set recurrence rule |
| `ts` | `t` then `s` | set_start_date | Set or edit start date |

### Chords: `s` prefix (set property)

| Key | TTY sequence | Command | Description |
|-----|--------------|---------|-------------|
| `s` (standalone) | `s` | set_priority | Set priority (chord timeout fallback) |
| `sp` | `s` then `p` | set_priority | Set task priority |
| `sl` | `s` then `l` | set_label | Set or add label/tag |
| `sa` | `s` then `a` | set_assignee | Set task assignee |
| `sr` | `s` then `r` | rename_node | Rename current node (enters inline edit) |

### Fold / Collapse

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `z` (standalone) | `z` | fold_all | Fold all nodes at depth 1 (also chord prefix) |
| `Z` | `Shift+z` | unfold_all | Unfold all nodes |
| `c` | `c` | toggle_collapse | Collapse or expand top-level column |
| `C` | `Shift+c` | ignore_node | Hide/un-hide node from board (persisted) |

### Chords: `z` prefix (vim fold)

| Key | TTY sequence | Command | Description |
|-----|--------------|---------|-------------|
| `za` | `z` then `a` | toggle_fold | Toggle fold on current node |
| `zo` | `z` then `o` | unfold_node | Unfold just this node |
| `zc` | `z` then `c` | fold_node | Fold just this node |
| `zO` | `z` then `Shift+o` | unfold_recursive | Unfold node and all descendants |
| `zM` | `z` then `Shift+m` | fold_all | Fold all nodes at depth 1 |
| `zR` | `z` then `Shift+r` | unfold_all | Unfold all nodes |

### Chords: `g` prefix (go-to)

| Key | TTY sequence | Command | Description |
|-----|--------------|---------|-------------|
| `gg` | `g` then `g` | cursor_first | Move to first item |
| `gp` | `g` then `p` | project_picker | Open project picker |
| `gn` | `g` then `n` | new_item | Open new item dialog |
| `gC` | `g` then `Shift+c` | toggle_show_ignored | Reveal/hide ignored nodes (dimmed) |

### View / Display

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `v` | `v` | cycle_view_mode | Cycle view modes (columns, list, detail) |
| `V` | `Shift+v` | cycle_icon_style | Cycle icon style (nerdfont, workflowy, bullet) |
| `?` | `?` | show_help | Toggle help overlay |
| `<` | `Shift+,` | decrease_outline_depth | Show fewer nested levels |
| `>` | `Shift+.` | increase_outline_depth | Show more nested levels |
| `+` or `=` | `+` or `=` | increase_content_lines | Show more content preview lines |
| `-` or `_` | `-` or `_` | decrease_content_lines | Show fewer content preview lines |
| `D` | `Shift+d` | toggle_hide_done | Toggle hiding done/dropped tasks |

### Favorites / Column Jump

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `1`-`9` | `1`-`9` | favorite_N | Jump to favorite board N |
| `!` (Shift+1) | `!` | column_1 | Jump to column 1 |
| `@` (Shift+2) | `@` | column_2 | Jump to column 2 |
| `#` (Shift+3) | `#` | column_3 | Jump to column 3 |
| `$` (Shift+4) | `$` | column_4 | Jump to column 4 |
| `%` (Shift+5) | `%` | column_5 | Jump to column 5 |
| `^` (Shift+6) | `^` | column_6 | Jump to column 6 |
| `&` (Shift+7) | `&` | column_7 | Jump to column 7 |
| `*` (Shift+8) | `*` | column_8 | Jump to column 8 |
| `(` (Shift+9) | `(` | column_9 | Jump to column 9 |

### History (Undo/Redo)

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `Ctrl+Z` | `Control+z` | undo | Undo the last action |
| `Ctrl+Shift+Z` | `Control+Shift+z` | redo | Redo the last undone action |
| `Ctrl+Y` | `Control+y` | redo | Redo (not in text input) |
| `Ctrl+Y` (text input) | `Control+y` | text.yank | Paste killed text (emacs yank) |

### Global / System

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `q` | `q` | quit | Exit the TUI |
| `Escape` | `Escape` | close_or_quit | Close current dialog/pane, or quit |
| `` ` `` | `` ` `` | console.toggle | Toggle console overlay |
| `Ctrl+T` | `Control+t` | dev.test_toast | Fire a test toast (dev only) |

### Dialog Navigation (when a dialog is open)

These keys only work when a dialog (search, project picker, new item, filter) is open.

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `Escape` | `Escape` | dialog.cancel | Cancel and close dialog |
| `Enter` | `Enter` | dialog.confirm | Confirm dialog selection |
| `ArrowUp` | `ArrowUp` | dialog.nav_up | Move selection up in dialog |
| `ArrowDown` | `ArrowDown` | dialog.nav_down | Move selection down in dialog |
| `Ctrl+P` | `Control+p` | dialog.nav_up | Move up (emacs-style) |
| `Ctrl+N` | `Control+n` | dialog.nav_down | Move down (emacs-style) |
| `Tab` (search dialog) | `Tab` | dialog.toggle_search_scope | Toggle search scope (All/Selected) |

### Filter Dialog (when filter panel is open)

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `Escape` | `Escape` | dialog.cancel | Close filter dialog |
| `Ctrl+/` | `Control+/` | dialog.cancel | Close filter dialog (alt binding) |
| `j` / `ArrowDown` | `j` or `ArrowDown` | dialog.nav_down | Move down in filter list |
| `k` / `ArrowUp` | `k` or `ArrowUp` | dialog.nav_up | Move up in filter list |
| `h` / `ArrowLeft` | `h` or `ArrowLeft` | filter.nav_left | Move to previous filter option |
| `l` / `ArrowRight` | `l` or `ArrowRight` | filter.nav_right | Move to next filter option |
| `Space` | ` ` | dialog.confirm | Toggle filter option |
| `Enter` | `Enter` | dialog.confirm | Toggle filter option |
| `X` | `Shift+x` | filter.clear_all | Clear all active filters |

### Text Editing (when text input is focused)

These keys only work during inline editing or when a text input field is active.

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `Backspace` | `Backspace` | text.delete_backward | Delete character before cursor |
| `Delete` | `Delete` | text.delete_forward | Delete character after cursor |
| `ArrowLeft` | `ArrowLeft` | text.cursor_left | Move cursor left |
| `ArrowRight` | `ArrowRight` | text.cursor_right | Move cursor right |
| `ArrowUp` | `ArrowUp` | text.cursor_up | Move cursor up (visual line or prev block) |
| `ArrowDown` | `ArrowDown` | text.cursor_down | Move cursor down (visual line or next block) |
| `Ctrl+A` | `Control+a` | text.cursor_start | Move cursor to beginning of line |
| `Ctrl+E` | `Control+e` | text.cursor_end | Move cursor to end of line |
| `Ctrl+B` | `Control+b` | text.cursor_left | Move cursor left (emacs) |
| `Ctrl+F` | `Control+f` | text.cursor_right | Move cursor right (emacs) |
| `Ctrl+W` | `Control+w` | text.delete_word | Delete word backwards |
| `Ctrl+U` | `Control+u` | text.delete_to_start | Delete from cursor to start of line |
| `Ctrl+K` | `Control+k` | text.delete_to_end | Delete from cursor to end of line |
| `Enter` | `Enter` | text.confirm | Confirm text input (save and exit) |
| `Escape` | `Escape` | text.exit_edit | Save and exit text editing mode |

### Modal Overlays

| Context | Key | TTY press | Command | Description |
|---------|-----|-----------|---------|-------------|
| Help overlay | `?` / `Escape` / `q` | `?` / `Escape` / `q` | help.dismiss | Close help overlay |
| Help overlay | any other key | any | noop | All keys absorbed |
| Delete confirm | `Enter` | `Enter` | delete_confirm.confirm | Execute deletion |
| Delete confirm | any other key | any | delete_confirm.cancel | Cancel deletion |
| Console | `Escape` / `` ` `` | `Escape` / `` ` `` | console.close | Close console |
| Console | `q` | `q` | quit | Quit from console |
| Console | any other key | any | noop | All keys absorbed |
| Toast active | `Escape` | `Escape` | toast.dismiss | Dismiss toast (not during inline edit) |
| Detail pane | `Escape` | `Escape` | detail_pane.close | Close detail pane |

## Screenshot Naming

Save to `/tmp/explore-screenshots/` with descriptive names:

```
/tmp/explore-screenshots/01-startup.png
/tmp/explore-screenshots/02-navigation-deep.png
/tmp/explore-screenshots/03-fold-reflow.png
/tmp/explore-screenshots/04-narrow-80x24.png
/tmp/explore-screenshots/05-synthetic-empty-col.png
```

Prefix with sequence number. Name describes the state, not the action.

## What to Look For

**Layout & alignment:**
- Column widths balanced? Cards evenly spaced?
- Borders aligned? No stray characters?
- Cursor indicator visible and at expected position?

**Colors & styling:**
- Selected item clearly highlighted?
- Folded items visually distinct?
- Any raw ANSI codes showing through?

**Blank areas & artifacts:**
- Unexpected blank rows or columns?
- Residual content from previous state?
- Flickering (compare text output before/after same action)

**Async glitches:**
- Content appearing incrementally when it should be instant?
- Stale state after navigation?

**Truncation & overflow:**
- Long titles handled gracefully?
- Wide content pushing layout?
- Does layout degrade at 80x24?

**State consistency:**
- Does pressing `h` always go back?
- After fold/unfold, is cursor still on a valid item?
- After search, does cancel restore previous state?

## Vault Strategy

### Phase 1: Real vault
Use `--path` arg or `/tmp/vt` default. Real vaults catch layout issues with real-world data — varied title lengths, nesting depths, empty sections.

### Phase 2: Synthetic edge cases
Create a purpose-built directory structure:

```bash
mkdir -p /tmp/explore-synthetic/col-empty \
         /tmp/explore-synthetic/col-one \
         /tmp/explore-synthetic/col-deep/a/b/c/d/e

echo "# Single" > /tmp/explore-synthetic/col-one/task.md
echo "# Deep" > /tmp/explore-synthetic/col-deep/a/b/c/d/e/leaf.md

for i in $(seq 1 30); do
  echo "# Task $i" > "/tmp/explore-synthetic/col-one/task-$i.md"
done
```

Edge cases to test: empty columns, single-item columns, deep nesting (5+ levels), many items (scrolling required), mixed depths.

### Phase 3: Narrow terminal
Restart at 80x24 — the minimum practical size. Quick pass through key areas. Does the layout degrade gracefully or break?

## Visual Bug Report Format

When reporting an issue to the reproducer:

```
VISUAL BUG: [clear description of what's wrong]
Terminal size: 120x40
Key sequence from startup: j j l k z l
Expected: Folded item should collapse children
Actual: Children still visible, blank gap appears below
Text output: [relevant section of mcp__tty__text]
Screenshot: /tmp/explore-screenshots/NN-name.png
```

Include **every key pressed** from session start — the reproducer needs this to write a TUI test that recreates the exact state.

## Budgets

| Resource | Budget |
|----------|--------|
| Total actions | ~100 across all phases |
| Screenshots | 8-12 (quality over quantity) |
| Terminal sizes | 2+ (120x40 and 80x24 minimum) |
| Phases | 3 (real vault → synthetic → narrow) |

Don't screenshot mechanically after every N actions. Screenshot when something is interesting — startup state, discovered issue, unusual layout, before/after a problematic action.

## Anti-Patterns

- **Don't script blindly**: Think about what you're seeing. If something looks off, investigate — don't just move on.
- **Don't screenshot everything**: 8-12 meaningful screenshots > 50 routine ones.
- **Don't ignore gut feelings**: If a transition "felt weird" but you can't pinpoint why, take a screenshot and note it.
- **Don't skip phases**: Real vault and synthetic test different things. Narrow terminal catches responsive layout bugs.
