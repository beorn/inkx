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

All keybindings from `packages/km-commands/src/keybindings.ts`. Organized by functional group. Context-dependent bindings noted where applicable.

Source: `packages/km-commands/src/keybindings.ts` (defaultKeybindingLayers)

### Navigation

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `j` | `j` | cursor_down | Move cursor down visually |
| `k` | `k` | cursor_up | Move cursor up visually |
| `h` | `h` | cursor_left | Move cursor left (cross-column) |
| `l` | `l` | cursor_right | Move cursor right (cross-column) |
| `J` | `Shift+j` | block_nav_down | Jump down by block (auto-unfolds) |
| `K` | `Shift+k` | block_nav_up | Jump up by block (auto-unfolds) |
| `G` | `Shift+g` | cursor_last | Move to last item |
| `ArrowDown` | `ArrowDown` | cursor_down | Move cursor down visually |
| `ArrowUp` | `ArrowUp` | cursor_up | Move cursor up visually |
| `ArrowLeft` | `ArrowLeft` | cursor_left | Move cursor left (cross-column) |
| `ArrowRight` | `ArrowRight` | cursor_right | Move cursor right (cross-column) |
| `Ctrl+N` | `Control+n` | cursor_down | Move down (emacs-style, not in dialogs) |
| `Ctrl+P` | `Control+p` | cursor_up | Move up (emacs-style, not in dialogs) |
| `g` | `g` | cursor_first | Move to first item (also chord prefix, see below) |
| `Ctrl+D` | `Control+d` | page_down | Jump cursor down half a page |
| `Ctrl+U` | `Control+u` | page_up | Jump cursor up half a page |
| `{` | `Shift+[` | nav_back | Go back in navigation history |
| `}` | `Shift+]` | nav_forward | Go forward in navigation history |
| `Cmd+[` | `Meta+[` | nav_back | Go back (kitty protocol) |
| `Cmd+]` | `Meta+]` | nav_forward | Go forward (kitty protocol) |
| `Ctrl+J` | `Control+j` | sibling_board_next | Navigate to next sibling board |
| `Ctrl+K` | `Control+k` | sibling_board_prev | Navigate to previous sibling board |
| `z` | `z` | zoom_in | Zoom into cursor node as root |
| `Z` | `Shift+z` | zoom_outwards | Zoom out one level (parent of current root) |
| `i` | `i` | enter_inline_edit | Edit node title at start (normal mode) |
| `Enter` | `Enter` | enter_inline_edit | Edit node title at end (normal mode) |
| `D` | `Shift+d` | toggle_detail_pane | Smart detail pane toggle (open+focus / focus / close) |
| `Cmd+W` | `Meta+w` | close_detail_pane | Always close detail pane |
| `Cmd+P` | `Meta+p` | toggle_detail_pane | Toggle detail pane (kitty) |
| `Ctrl+Enter` | `Control+Enter` | follow_link | Go to embedded link target |
| `Ctrl+I` | `Control+i` | open_detail_pane | Open detail pane for current node |
| `Ctrl+L` | `Control+l` | add_link | Add link (not in text input) |
| `Ctrl+R` | `Control+r` | reparent_picker | Open reparent picker (not in text input) |
| `Ctrl+O` | `Control+o` | open_in_system | Open in system (not in text input) |
| `Cmd+H` | `Meta+h` | focus_board | Focus board (kitty) |
| `Cmd+L` | `Meta+l` | focus_detail | Focus detail pane (kitty) |
| `Cmd+O` | `Meta+o` | open_in_system | Open in system (kitty) |
| `Cmd+Shift+O` | `Meta+Shift+o` | open_in_terminal | Open terminal at closest folder (kitty) |

### Selection

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `Space` | ` ` | select_toggle | Toggle selection on current node |
| `A` | `Shift+a` | select_all_progressive | Select all in column, then all in board (progressive) |
| `Ctrl+A` | `Control+a` | select_all | Select all visible nodes (not in text input) |
| `Cmd+A` | `Meta+a` | select_all | Select all (kitty) |
| `Shift+ArrowUp` | `Shift+ArrowUp` | extend_select_up | Extend selection upward |
| `Shift+ArrowDown` | `Shift+ArrowDown` | extend_select_down | Extend selection downward |
| `Shift+ArrowLeft` | `Shift+ArrowLeft` | extend_select_left | Extend selection leftward |
| `Shift+ArrowRight` | `Shift+ArrowRight` | extend_select_right | Extend selection rightward |

### Visual Mode (vim-style range selection)

Enter with `v`, exit with `Escape`. In visual mode, hjkl extends selection instead of moving cursor.

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `v` | `v` | visual_mode_enter | Enter visual mode (not already in visual mode) |
| `Escape` | `Escape` | visual_mode_exit | Exit visual mode |
| `j` | `j` | extend_select_down | Extend selection downward |
| `k` | `k` | extend_select_up | Extend selection upward |
| `h` | `h` | extend_select_left | Extend selection leftward |
| `l` | `l` | extend_select_right | Extend selection rightward |
| `ArrowDown` | `ArrowDown` | extend_select_down | Extend selection downward |
| `ArrowUp` | `ArrowUp` | extend_select_up | Extend selection upward |
| `ArrowLeft` | `ArrowLeft` | extend_select_left | Extend selection leftward |
| `ArrowRight` | `ArrowRight` | extend_select_right | Extend selection rightward |

### Editing

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `d` | `d` | clipboard_cut | Cut node (forward, cursor moves to next) |
| `y` | `y` | clipboard_copy | Copy (yank) node |
| `p` | `p` | clipboard_paste | Paste node |
| `o` | `o` | insert_below | Insert sibling below and enter inline edit |
| `O` | `Shift+o` | insert_above | Insert sibling above and enter inline edit |
| `Cmd+Enter` | `Meta+Enter` | insert_below | Insert below (kitty) |
| `Cmd+Shift+Enter` | `Meta+Shift+Enter` | new_item | New item dialog (kitty) |
| `u` | `u` | undo | Undo last action (vim-style) |
| `U` | `Shift+u` | redo | Redo last undone action (vim-style) |
| `Backspace` | `Backspace` | delete_node | Delete current node (shows confirmation) |
| `Delete` | `Delete` | delete_node | Delete current node (shows confirmation) |
| `m` | `m` | enter_move_mode | Start move mode (also chord prefix, see below) |
| `Enter` (move mode) | `Enter` | confirm_move | Confirm node movement |
| `Escape` (move mode) | `Escape` | cancel_move | Cancel move operation |
| `Meta+ArrowUp` | `Meta+ArrowUp` | shift_up | Move node up among siblings |
| `Meta+ArrowDown` | `Meta+ArrowDown` | shift_down | Move node down among siblings |
| `Meta+ArrowLeft` | `Meta+ArrowLeft` | shift_left | Move node left between columns |
| `Meta+ArrowRight` | `Meta+ArrowRight` | shift_right | Move node right between columns |
| `Meta+k` | `Meta+k` | shift_up | Move node up (vim-style) |
| `Meta+j` | `Meta+j` | shift_down | Move node down (vim-style) |
| `Meta+h` | `Meta+h` | shift_left | Move node left (vim-style) |
| `Meta+l` | `Meta+l` | shift_right | Move node right (vim-style) |
| `Cmd+k` | `Meta+k` | shift_up | Move node up (kitty, Cmd) |
| `Cmd+j` | `Meta+j` | shift_down | Move node down (kitty, Cmd) |
| `Cmd+ArrowUp` | `Meta+ArrowUp` | shift_up | Move node up (kitty, Cmd) |
| `Cmd+ArrowDown` | `Meta+ArrowDown` | shift_down | Move node down (kitty, Cmd) |
| `Cmd+ArrowLeft` | `Meta+ArrowLeft` | shift_left | Move node left (kitty, Cmd) |
| `Cmd+ArrowRight` | `Meta+ArrowRight` | shift_right | Move node right (kitty, Cmd) |
| `Tab` | `Tab` | indent_node | Reparent under previous sibling |
| `Shift+Tab` | `Shift+Tab` | outdent | Move item to parent level |
| `Ctrl+C` | `Control+c` | clipboard_copy | Copy (not in text input) |
| `Ctrl+X` | `Control+x` | clipboard_cut | Cut (not in text input) |
| `Ctrl+V` | `Control+v` | clipboard_paste | Paste (not in text input) |
| `Cmd+C` | `Meta+c` | clipboard_copy | Copy (kitty, not in text input) |
| `Cmd+X` | `Meta+x` | clipboard_cut | Cut (kitty, not in text input) |
| `Cmd+V` | `Meta+v` | clipboard_paste | Paste (kitty, not in text input) |
| `Cmd+D` | `Meta+d` | duplicate_node | Duplicate node (kitty) |
| `Cmd+N` | `Meta+n` | capture_inbox | Capture new to inbox (kitty) |

### Task

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `x` | `x` | toggle_task_done | Toggle done/not-done (quick) |
| `X` | `Shift+x` | cycle_task_status | Cycle task status: todo -> wip -> done -> dropped |
| `e` | `e` | archive | Archive node (remove from view, still searchable) |
| `c` | `c` | capture_inbox | Capture to inbox |
| `C` | `Shift+c` | capture_dialog | Capture with dialog |

### Bare Symbol Shortcuts

These fire in node mode only (not text edit, not dialog).

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `@` | `Shift+2` | add (targetId: "@") | Add assignee |
| `#` | `Shift+3` | add (targetId: "#") | Add tag |
| `+` | `+` | add (targetId: "+") | Add project |
| `[` | `[` | add (targetId: "[") | Add backlink |

### Fold

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `H` | `Shift+h` | fold_node | Fold subtree at cursor |
| `L` | `Shift+l` | unfold_node | Unfold subtree at cursor |
| `<` | `Shift+,` | fold_all | Fold all nodes (board-wide) |
| `>` | `Shift+.` | unfold_all | Unfold all nodes (board-wide) |

### Chords: `g` prefix (go-to)

Chords require pressing the prefix key, then the second key within a timeout. If no second key arrives, the standalone command fires (`g` standalone = `cursor_first`).

| Key | TTY sequence | Command | Description |
|-----|--------------|---------|-------------|
| `gg` | `g` then `g` | cursor_first | Move to first item |
| `gG` | `g` then `Shift+g` | cursor_last | Move to last item |
| `go` | `g` then `o` | open_in_system | Open in system (Finder/default app) |
| `gO` | `g` then `Shift+o` | open_in_terminal | Open terminal at closest folder |
| `gj` | `g` then `j` | goto (targetId: "j") | Go to journal |
| `gh` | `g` then `h` | goto (targetId: "h") | Go to home |
| `ga` | `g` then `a` | goto (targetId: "a") | Go to archive |

### Chords: `m` prefix (move to)

`m` standalone = `enter_move_mode` (interactive move).

| Key | TTY sequence | Command | Description |
|-----|--------------|---------|-------------|
| `mm` | `m` then `m` | enter_move_mode | Enter interactive move mode |
| `mi` | `m` then `i` | move (targetId: "i") | Move to inbox |
| `mj` | `m` then `j` | move (targetId: "j") | Move to journal |
| `mh` | `m` then `h` | move (targetId: "h") | Move to home |
| `mp` | `m` then `p` | reparent_picker | Open reparent picker |
| `ma` | `m` then `a` | archive | Archive node |

### Chords: `a` prefix (add)

`a` standalone = noop (waits for chord suffix).

| Key | TTY sequence | Command | Description |
|-----|--------------|---------|-------------|
| `a#` | `a` then `#` | add (targetId: "#") | Add tag |
| `a@` | `a` then `@` | add (targetId: "@") | Add assignee |
| `a+` | `a` then `+` | add (targetId: "+") | Add project |
| `a[` | `a` then `[` | add (targetId: "[") | Add backlink |
| `ai` | `a` then `i` | insert_child | Insert child node |
| `aj` | `a` then `j` | add_sibling_below | Add sibling below |
| `ah` | `a` then `h` | insert_at_parent | Insert at parent level |

### Chords: `t` prefix (task properties)

`t` standalone = noop (waits for chord suffix).

| Key | TTY sequence | Command | Description |
|-----|--------------|---------|-------------|
| `tt` | `t` then `t` | task_dialog | Open task dialog |
| `td` | `t` then `d` | set_due_date | Set or edit due date |
| `ts` | `t` then `s` | set_start_date | Set or edit start date |
| `tr` | `t` then `r` | set_recurring | Set recurrence rule |
| `to` | `t` then `o` | set_assignee | Set task assignee |
| `t!` | `t` then `!` | set_priority | Set task priority |
| `tc` | `t` then `c` | toggle_hide_done | Toggle hiding done tasks |
| `tl` | `t` then `l` | set_label | Set or add label |

### View / Display

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `v` | `v` | visual_mode_enter | Enter visual mode (when not in visual mode) |
| `V` | `Shift+v` | cycle_icon_style | Cycle icon style (nerdfont, workflowy, bullet) |
| `?` | `?` | show_help | Toggle help overlay |
| `+` or `=` | `+` or `=` | increase_content_lines | Show more content preview lines |
| `-` or `_` | `-` or `_` | decrease_content_lines | Show fewer content preview lines |
| `,` | `,` | settings | Open settings |
| `Cmd+,` | `Meta+,` | settings | Open settings (kitty) |
| `:` | `:` | command_palette | Open command palette |

### Search / Find / Filter

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `/` | `/` | local_find | Open local find bar |
| `Cmd+F` | `super+f` | local_find | Open local find bar (kitty) |
| `F` | `Shift+f` | search_replace | Open search & replace (not in text input) |
| `Cmd+Shift+F` | `super+shift+f` | search_replace | Open search & replace (kitty) |
| `Ctrl+G` | `Control+g` | filter | Open filter dialog |
| `Cmd+G` | `Meta+g` | filter | Open filter dialog (kitty) |

### Favorites

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `1`-`9` | `1`-`9` | favorite_N | Jump to favorite board N |

### History (Undo/Redo)

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `u` | `u` | undo | Undo (vim-style, normal mode) |
| `U` | `Shift+u` | redo | Redo (vim-style, normal mode) |
| `Ctrl+Z` | `Control+z` | undo | Undo |
| `Cmd+Z` | `Meta+z` | undo | Undo (kitty) |
| `Ctrl+Shift+Z` | `Control+Shift+z` | redo | Redo |
| `Cmd+Shift+Z` | `Meta+Shift+z` | redo | Redo (kitty) |
| `Ctrl+Y` | `Control+y` | redo | Redo (not in text input) |
| `Ctrl+Y` (text input) | `Control+y` | text.yank | Paste killed text (emacs yank) |

### Global / System

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `Ctrl+C` | `Control+c` | quit | Exit the TUI (bare `q` is unbound — see km-tui.q-quits-no-confirm) |
| `Escape` | `Escape` | close_or_quit | Close current dialog/pane, or quit |
| `` ` `` | `` ` `` | console.toggle | Toggle console overlay |
| `Ctrl+T` | `Control+t` | task_dialog | Open task dialog |
| `Cmd+T` | `Meta+t` | task_dialog | Open task dialog (kitty) |
| `Ctrl+K` | `Control+k` | command_palette | Open command palette (not in text input) |
| `Cmd+K` | `Meta+k` | command_palette | Open command palette (kitty) |

### Dialog Navigation (when a dialog is open)

These keys only work when a dialog (search, item picker, new item) is open.

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
| `Ctrl+G` | `Control+g` | dialog.cancel | Close filter dialog (toggle binding) |
| `j` / `ArrowDown` | `j` or `ArrowDown` | dialog.nav_down | Move down in filter list |
| `k` / `ArrowUp` | `k` or `ArrowUp` | dialog.nav_up | Move up in filter list |
| `h` / `ArrowLeft` | `h` or `ArrowLeft` | filter.nav_left | Move to previous filter option |
| `l` / `ArrowRight` | `l` or `ArrowRight` | filter.nav_right | Move to next filter option |
| `Space` | ` ` | dialog.confirm | Toggle filter option |
| `Enter` | `Enter` | dialog.confirm | Toggle filter option |
| `X` | `Shift+x` | filter.clear_all | Clear all active filters |

### Search & Replace (when dialog is open)

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `Escape` | `Escape` | search_replace.close | Close search & replace |
| `Tab` | `Tab` | focus_next | Switch between search/replace fields |
| `Enter` | `Enter` | search_replace.next | Find next match |
| `Shift+Enter` | `Shift+Enter` | search_replace.prev | Find previous match |
| `Ctrl+R` | `Control+r` | search_replace.replace | Replace current match |
| `Cmd+R` | `Meta+r` | search_replace.replace | Replace current match (kitty) |
| `Ctrl+Shift+R` | `Control+Shift+r` | search_replace.replace_all | Replace all matches |
| `Cmd+Shift+R` | `Meta+Shift+r` | search_replace.replace_all | Replace all matches (kitty) |
| `Ctrl+X` | `Control+x` | search_replace.toggle_regex | Toggle regex mode |
| `Cmd+X` | `Meta+x` | search_replace.toggle_regex | Toggle regex mode (kitty) |

### Local Find (when find bar is active)

| Key | TTY press | Command | Description |
|-----|-----------|---------|-------------|
| `Escape` | `Escape` | find_close | Close find bar / clear matches |
| `Enter` (input focused) | `Enter` | find_confirm | Confirm find and close input |
| `n` (input closed) | `n` | find_next | Jump to next match |
| `N` (input closed) | `Shift+n` | find_prev | Jump to previous match |

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
| `Enter` | `Enter` | text.linebreak_* | Outliner split/insert (cursor-aware); confirm in dialogs |
| `Shift+Enter` | `shift+Enter` | text.child_block | Insert child node (inline edit only) |
| `Escape` | `Escape` | text.exit_edit | Save and exit text editing mode |
| `Ctrl+Z` / `Cmd+Z` | `Control+z` / `Meta+z` | undo | Undo (during inline edit) |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | `Control+Shift+z` / `Meta+Shift+z` | redo | Redo (during inline edit) |
| `Ctrl+Y` | `Control+y` | text.yank | Paste killed text (emacs yank, during inline edit) |
| `Cmd+B` | `Meta+b` | text.bold | Bold (kitty, inline edit only) |
| `Cmd+I` | `Meta+i` | text.italic | Italic (kitty, inline edit only) |

### Modal Overlays

| Context | Key | TTY press | Command | Description |
|---------|-----|-----------|---------|-------------|
| Help overlay | `?` / `Escape` / `q` | `?` / `Escape` / `q` | help.dismiss | Close help overlay |
| Help overlay | `j` / `ArrowDown` | `j` / `ArrowDown` | help.scroll_down | Scroll help down |
| Help overlay | `k` / `ArrowUp` | `k` / `ArrowUp` | help.scroll_up | Scroll help up |
| Help overlay | any other key | any | noop | All keys absorbed |
| Delete confirm | `Enter` | `Enter` | delete_confirm.confirm | Execute deletion |
| Delete confirm | any other key | any | delete_confirm.cancel | Cancel deletion |
| Console | `Escape` / `` ` `` / `q` | `Escape` / `` ` `` / `q` | console.close | Close console |
| Console | any other key | any | noop | All keys absorbed |
| Toast active | `Escape` | `Escape` | toast.dismiss | Dismiss toast (not during inline edit) |
| Detail pane focused | `Escape` | `Escape` | close_or_quit | Unfocus detail pane (returns to board) |

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
