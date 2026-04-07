# Keyboard Shortcut Reference Across Applications

Cross-application keyboard shortcut research for designing optimal km keybindings.
Covers ~20 TUI, web, and desktop applications. Focus: vim-like navigation, folding,
links, selection, editing, search.

## Legend

| Symbol | Meaning |
|--------|---------|
| `C-x` | Ctrl+x |
| `M-x` | Meta/Alt/Option+x |
| `S-x` | Shift+x |

---

## 1. TUI Applications

### Vim/Neovim

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | `j` / `k` | Universal vim movement |
| Move left/right | `h` / `l` | |
| Page down/up | `C-d` / `C-u` | Half-page scroll |
| Full page down/up | `C-f` / `C-b` | Full-page scroll |
| Go to top/bottom | `gg` / `G` | |
| Go to line N | `Ng` or `:N` | |
| Toggle fold | `za` | `zA` toggles all levels |
| Open fold | `zo` | `zO` opens all levels |
| Close fold | `zc` | `zC` closes all levels |
| Open all folds | `zR` | Decreases foldlevel to 0 |
| Close all folds | `zM` | Increases foldlevel to max |
| Reduce fold level | `zr` | Opens one more level |
| Increase fold level | `zm` | Closes one more level |
| Next/prev fold | `zj` / `zk` | |
| Follow link (tag) | `C-]` | Jump to tag definition |
| Go back | `C-o` | Jump list back |
| Go forward | `C-i` | Jump list forward |
| Search forward/back | `/` / `?` | |
| Next/prev match | `n` / `N` | |
| Visual select | `v` | `V` for line, `C-v` for block |
| Select all | `ggVG` | No single key |
| Yank/copy | `y` | |
| Delete/cut | `d` | `dd` for line |
| Paste | `p` / `P` | After/before cursor |
| Undo/redo | `u` / `C-r` | |
| Marks | `m{a-z}` / `'{a-z}` | Set/jump to mark |
| Quit | `:q` | |
| Help | `:help` or `K` | |

### Ranger (file manager)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | `j` / `k` | Vim-style |
| Enter directory | `l` or `Enter` | |
| Parent directory | `h` | |
| Go to top/bottom | `gg` / `G` | |
| Page down/up | `C-d` / `C-u` | |
| Select/toggle | `Space` | |
| Visual select | `v` / `V` | Toggle visual / invert |
| Rename | `cw` | Like vim change-word |
| Copy (yank) | `yy` | |
| Cut | `dd` | |
| Paste | `pp` | |
| Delete | `dD` | |
| Search | `/` | |
| Toggle hidden | `zh` or `M-h` | |
| Marks | `m{key}` / `'{key}` | Set/jump to bookmark |
| Console | `:` | |
| Quit | `q` | |
| Help | `?` | |

### Yazi (file manager)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | `j` / `k` | Vim-style |
| Enter directory | `l` or `Enter` | |
| Parent directory | `h` | |
| Go to top/bottom | `gg` / `G` | Double-g for top |
| Select/toggle | `Space` | |
| Visual select mode | `v` | `V` for unset mode |
| Select all | `C-a` | `C-r` inverts |
| Copy (yank) | `y` | |
| Cut | `x` | |
| Paste | `p` | `P` for overwrite |
| Delete (trash) | `d` | `D` permanent |
| Rename | `r` | |
| Create | `a` | New file/directory |
| Search find | `/` / `?` | Forward/backward |
| Filter | `f` | |
| Full search (fd) | `s` | `S` for content (rg) |
| Tab management | `t` / `1-9` | New tab / switch |
| Toggle hidden | `.` | |
| Quit | `q` | |
| Help | `~` or `F1` | |
| Sort | `, + {key}` | Comma prefix for sort modes |

### Lazygit

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | `j` / `k` | |
| Scroll left/right | `h` / `l` | |
| Go to top/bottom | `<` / `>` | Home/End |
| Page down/up | `PgDn` / `PgUp` | |
| Toggle tree/flat | `` ` `` | Backtick |
| Collapse all dirs | `-` | |
| Expand all dirs | `=` | |
| Select/toggle | `Space` | |
| Range select | `v` | Shift+arrows extend |
| Search | `/` | |
| Quit | `q` | |
| Help | `?` | |
| Switch panels | `Tab` / `1-5` | |

### Tig (git log viewer)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | `j` / `k` or arrows | |
| Enter/open | `Enter` | |
| Back | `q` | Also quits view |
| Page down/up | `Space` / `PgUp` | |
| Search forward/back | `/` / `?` | |
| Next/prev match | `n` / `N` | |
| Toggle views | `m` (main), `d` (diff), etc. | |
| Quit | `Q` | Capital Q quits all |
| Help | `h` | |

### htop/btop

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | `j` / `k` or arrows | |
| Page down/up | `PgDn` / `PgUp` | |
| Go to top/bottom | `Home` / `End` | |
| Search | `/` or `F3` | |
| Filter | `\` or `F4` | |
| Sort | `<` / `>` or `F6` | |
| Kill process | `k` or `F9` | |
| Tree view toggle | `t` or `F5` | |
| Help | `?` or `F1` | |
| Quit | `q` or `F10` | |

### Midnight Commander (mc)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | Arrows | Not vim-style by default |
| Enter directory | `Enter` | |
| Select/toggle | `Insert` | |
| Copy | `F5` | |
| Move/rename | `F6` | |
| Delete | `F8` | |
| Search | `M-?` or `C-s` | |
| View file | `F3` | |
| Edit file | `F4` | |
| Switch panels | `Tab` | |
| Quit | `F10` | |
| Help | `F1` | |

---

## 2. Desktop/Web Applications (Keyboard-First)

### Linear (issue tracking)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | `j` / `k` or arrows | Vim-style |
| Move left/right | `h` / `l` or arrows | |
| Open/enter | `Enter` or `o` | |
| Back | `Esc` | |
| Select | `x` | Click-based multi-select |
| New issue | `c` | |
| Edit | `e` | |
| Assign | `a` | Self-assign: `i` |
| Label | `l` | |
| Status | `s` | |
| Priority | `p` | |
| Rename | `r` | |
| Archive | `#` | |
| Filter | `f` | |
| Search | `/` | |
| Command palette | `C-k` | |
| Go-to sequences | `g + {key}` | `gi` inbox, `gm` my issues, `gb` backlog |
| Open sequences | `o + {key}` | `op` project, `oc` cycle |
| Toggle board/list | `C-b` | |
| Help/shortcuts | `?` | |
| Quit | — | Web app |

### Superhuman (email)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Next/prev conversation | `j` / `k` | Vim-style |
| Next/prev message | `n` / `p` | Within thread |
| Open conversation | `Enter` | |
| Back | `Esc` | |
| Select | `x` | Shift+j/k extends |
| Archive (done) | `e` | |
| Snooze | `h` | |
| Star | `s` | |
| Compose | `c` | |
| Reply / Reply all | `r` / `Enter` | |
| Forward | `f` | |
| Label | `l` | |
| Move | `v` | |
| Search | `/` | |
| Go-to sequences | `g + {key}` | `gi` inbox, `gs` starred, `gd` drafts |
| Expand message | `o` | `S-o` expand all |
| Scroll down/up | `Space` / `S-Space` | |
| Jump top/bottom | `C-Up` / `C-Down` | |
| Undo | `z` | |
| Help/shortcuts | `?` | |

### Notion (block editor)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move between blocks | Arrow keys | Not vim-style |
| Indent/outdent | `Tab` / `S-Tab` | |
| Move block up/down | `C-S-Arrow` | |
| Expand/collapse toggles | `C-M-t` | Toggle all |
| Follow link | `C-click` or `C-Enter` | |
| Select block | `Esc` | |
| Select all | `C-a` | |
| Extend selection | `S-arrows` | |
| Duplicate | `C-d` | |
| Delete block | `Backspace` / `Delete` | |
| Search | `C-p` or `C-k` | |
| Navigate back/forward | `C-[` / `C-]` | |
| Undo/redo | `C-z` / `C-S-z` | |
| Comment | `C-S-m` | |

### Obsidian (note-taking)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Toggle fold | No default | Must bind manually |
| Fold all / Unfold all | No default | Community plugins enhance this |
| Follow link | `C-click` or `M-Enter` | |
| Navigate back/forward | `C-M-Left` / `C-M-Right` | |
| Search | `C-S-f` (vault) / `C-f` (file) | |
| Command palette | `C-p` | |
| Quick switcher | `C-o` | |
| Move line up/down | `M-Up` / `M-Down` | |
| Indent/outdent | `C-]` / `C-[` | |
| Toggle checkbox | `C-Enter` | |
| Outline view | Community plugin | |

### Things 3 (task management)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | Arrows | Not vim-style |
| Select first/last | `M-Up` / `M-Down` | |
| Extend selection | `S-arrows` | |
| Move item up/down | `C-Up` / `C-Down` | |
| Move to top/bottom | `C-M-Up` / `C-M-Down` | |
| Open item | `Return` | |
| Save & close | `C-Return` | |
| New to-do | `C-n` or `Space` | Space adds below |
| Complete | `C-k` | |
| Duplicate | `C-d` | |
| Delete | `Delete` | |
| Move to list | `C-S-m` | |
| Search | `C-f` | |
| Navigate sections | `C-1` to `C-6` | Inbox, Today, etc. |
| Go to parent | `C-l` | Show in parent list |
| Enter project | `Return` or `C-Right` | |
| Go back | `C-Left` | |
| Show/hide later | `C-S-e` | |
| Indent | `C-]` | |
| Outdent | `C-[` | |
| Help | `?` in Help menu | |

### Todoist (task management)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | `j` / `k` or arrows | Vim-style! |
| Open task | `Enter` | |
| Complete task | `e` | |
| Edit | `C-e` | |
| New task (quick) | `q` | |
| Add to bottom/top | `a` / `S-a` | |
| Select | `x` | |
| Indent/outdent | `C-]` / `C-[` | |
| Show/hide sub-tasks | `S-e` | Fold/unfold |
| Move task | `v` | |
| Priority 1-4 | `1` / `2` / `3` / `4` | |
| Set date | `t` | |
| Label | `l` | |
| Search | `/` or `f` | |
| Command palette | `C-k` | |
| Go-to sequences | `g + {key}` | `gi` inbox, `gt` today |
| Change layout | `S-v` | |
| Add section | `s` | |
| Help/shortcuts | `?` | |
| Quit/close | `Esc` | |

### GitHub (web)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Move down/up | `j` / `k` | In issue/PR lists |
| Open issue | `o` or `Enter` | |
| Search | `s` or `/` | |
| Go-to sequences | `g + {key}` | `gc` code, `gi` issues, `gp` PRs |
| New issue | `c` | |
| Label | `l` | |
| Assign | `a` | |
| Milestone | `m` | |
| File finder | `t` | |
| Go to line | `l` | |
| Help/shortcuts | `?` | |
| Open in editor | `.` | github.dev |
| Permalink | `y` | |

### Trello (boards)

| Action | Shortcut | Notes |
|--------|----------|-------|
| Navigate cards | Arrow keys | |
| Open card | `Enter` | |
| Edit title | `e` | |
| Archive | `c` | |
| Label | `l` | |
| Members | `m` | |
| New card | `n` | |
| Search | `/` | |
| Filter | `f` | |
| Help/shortcuts | `?` | |

---

## 3. Patterns & Synthesis

### Universal Patterns (across 15+ apps)

| Action | Most Common | Vim-First Apps | Notes |
|--------|-------------|----------------|-------|
| **Move down/up** | `j` / `k` | `j` / `k` | Universal in keyboard-first apps |
| **Move left/right** | `h` / `l` | `h` / `l` | Also arrows everywhere |
| **Go to top** | `gg` or `Home` | `gg` | Single `g` in some apps |
| **Go to bottom** | `G` or `End` | `G` | |
| **Page down/up** | `C-d` / `C-u` | `C-d` / `C-u` | Vim half-page; Space/S-Space in readers |
| **Open/enter** | `Enter` or `l` | `Enter` | `o` in Linear/GitHub |
| **Back** | `Esc` or `h` | `Esc` | `q` closes views in TUI apps |
| **Search** | `/` | `/` | Nearly universal |
| **Help** | `?` | `?` | Universal across vim-like apps |
| **Quit** | `q` | `q` | |

### Folding Patterns

| Action | Vim | VS Code | Lazygit | Our Current |
|--------|-----|---------|---------|-------------|
| **Toggle fold** | `za` | `C-S-[`/`]` | — | `Tab` |
| **Fold all** | `zM` | `C-k C-0` | `-` | `z` |
| **Unfold all** | `zR` | `C-k C-j` | `=` | `Z` |
| **Fold one level** | `zm` | — | — | `<` (outline depth) |
| **Unfold one level** | `zr` | — | — | `>` (outline depth) |
| **Open fold** | `zo` | — | — | — |
| **Close fold** | `zc` | — | — | — |

**Key insight**: Vim's `z` prefix for fold operations is deeply ingrained. Our `z`/`Z` for fold all/unfold all aligns with `zM`/`zR`. `Tab` for toggle fold is unique to us but intuitive (disclosure triangles).

### Selection Patterns

| Action | Vim | Yazi | Linear | Superhuman | Our Current |
|--------|-----|------|--------|------------|-------------|
| **Toggle select** | `v` | `Space` | `x` | `x` | — (no toggle) |
| **Visual mode** | `v` / `V` | `v` | — | — | — |
| **Extend selection** | `S-arrows` in visual | `S-arrows` | `S-click` | `S-j`/`S-k` | `S-hjkl` / `S-arrows` |
| **Select all** | `ggVG` | `C-a` | `C-a` | — | `A` (progressive) |
| **Clear selection** | `Esc` | `Esc` | — | — | `Esc` |

### Move/Reorder Patterns

| Action | Notion | Obsidian | Things | Our Current |
|--------|--------|----------|--------|-------------|
| **Move up/down** | `C-S-arrows` | `M-Up`/`M-Down` | `C-Up`/`C-Down` | `M-hjkl` / `M-arrows` |
| **Indent/outdent** | `Tab`/`S-Tab` | `C-]`/`C-[` | `C-]`/`C-[` | `M-l`/`M-h` (shift left/right) |
| **Move mode** | — | — | — | `m` (our custom) |

### Go-to / Navigation Sequences

| Prefix | Linear | Superhuman | Todoist | GitHub |
|--------|--------|------------|---------|--------|
| `g + key` | Sections | Folders | Sections | Repo tabs |
| `o + key` | Open entities | Expand | — | — |

**Pattern**: `g + {key}` for "go to section" is common. `o + {key}` for "open entity" in Linear.

### Delete Patterns

| App | Shortcut | Confirmation |
|-----|----------|-------------|
| Vim | `dd` | None |
| Yazi | `d` (trash) / `D` (permanent) | Permanent asks |
| Things | `Delete` | None (has undo) |
| Linear | `Backspace` | None (has undo) |
| Our current | `D` / `Backspace` / `Delete` | Dialog if children |

### Undo/Redo Patterns

| App | Undo | Redo |
|-----|------|------|
| Vim | `u` | `C-r` |
| VS Code | `C-z` | `C-S-z` or `C-y` |
| Notion | `C-z` | `C-S-z` |
| Superhuman | `z` | — |
| Our current | `C-z` | `C-S-z` or `C-y` |

---

## 4. Current km Keybindings vs Conventions

### Well-Aligned (keep as-is)

| Action | Our Key | Convention | Verdict |
|--------|---------|------------|---------|
| Move down/up | `j` / `k` | `j` / `k` | Perfect |
| Move left/right | `h` / `l` | `h` / `l` | Perfect |
| Page down/up | `C-d` / `C-u` | `C-d` / `C-u` | Perfect |
| Go to first/last | `g` / `G` | `gg` / `G` | Good (single `g` is fine for "first") |
| Search | `/` | `/` | Perfect |
| Help | `?` | `?` | Perfect |
| Quit | `:q` / `Ctrl+C` | `q` | Diverge (bead km-tui.q-quits-no-confirm — bare `q` must not destroy the session) |
| Back/forward | `[` / `]` | Various | Good (unique but logical) |
| Extend selection | `S-hjkl` | `S-j`/`S-k` | Perfect |
| Move nodes | `M-hjkl` | `M-arrows` | Perfect (plus M-arrows) |
| Undo/redo | `C-z` / `C-S-z` | `C-z` / `C-S-z` | Perfect |
| Delete | `D` / `Backspace` | `d` / `Backspace` | Good (`D` avoids `dd` chord) |
| Tab/S-Tab | fold / outdent | fold / outdent | Good |

### Opportunities to Improve

| Action | Our Current | Convention | Recommendation |
|--------|-------------|------------|----------------|
| **Zoom in** (enter) | `e` | `Enter` or `l` | Consider `Enter` as primary (currently inline edit). See below. |
| **Toggle select** | None | `Space` (yazi) / `x` (Linear) | Add `x` for toggle-select (Space cycles task status) |
| **Fold toggle** | `Tab` | `za` (vim) | Keep `Tab` — more discoverable. Add `za` as alias? |
| **Fold all** | `z` | `zM` (vim) | Our `z` is simpler — keep. |
| **Unfold all** | `Z` | `zR` (vim) | Our `Z` is simpler — keep. |
| **Go-to prefix** | — | `g + {key}` (Linear/Superhuman/Todoist) | Consider for section jumping |
| **Open prefix** | — | `o + {key}` (Linear) | `o` is our open-in-system |
| **New item** | `n` | `c` (Linear), `a` (Todoist), `n` (Trello) | Keep `n` — common enough |
| **Follow embed link** | None | `C-]` (vim), `C-Enter` (Notion) | **Add P for "go to project"** (the new bead) |
| **Rename** | `Enter` (inline edit) | `r` (yazi), `e` (Linear), `F2` (OS) | `Enter` is fine for TUI |

### Enter Key Conflict

The `Enter` key has a tension across apps:
- **Vim-like file managers** (ranger, yazi): `Enter` = open/enter directory (same as `l`)
- **Editors** (VS Code, Notion): `Enter` = edit/insert line
- **List apps** (Linear, Superhuman): `Enter` = open item detail
- **Our current**: `Enter` = enter inline edit (normal mode), confirm (dialogs)

Our choice makes sense: `Enter` for inline edit, `e` for zoom-in. This follows the "editing" mental model rather than "opening."

### Proposed: Go-to Prefix (`g + key`)

Following Linear/Superhuman/Todoist patterns, `g + key` sequences would be powerful:

| Sequence | Action | Notes |
|----------|--------|-------|
| `g` (alone) | Go to first | Current behavior (keep) |
| `G` (alone) | Go to last | Current behavior (keep) |

We can't do `g + {key}` chords without implementing chord support. Current single-`g` for first-item is more immediately useful than chord navigation since we have number keys for favorites.

### Proposed: `P` for Follow Embedded Link ("go to Project")

| Key | Action | Rationale |
|-----|--------|-----------|
| `P` | Follow embedded link | Shift+p, mnemonic "Project". Zooms to grandparent, selects embed. Mirrors vim `C-]` (follow tag) but simpler. |

---

## 5. Recommended Ideal Keybinding Map

Based on cross-app research, our current keybindings are well-designed. Changes should be minimal:

### Keep (well-aligned with conventions)

Navigation: `hjkl`, arrows, `g`/`G`, `C-d`/`C-u`, `[`/`]`
Editing: `Enter` (inline edit), `D`/`Backspace`/`Delete`, `m` (move mode), `M-hjkl` (shift)
Selection: `S-hjkl`, `S-arrows`, `A` (select all)
Fold: `Tab` (toggle), `z`/`Z` (all), `<`/`>` (depth), `c` (collapse column)
View: `v` (cycle), `+`/`-` (content lines), `e` (zoom), `u` (zoom out), `i` (zoom in)
Task: `Space` (cycle status)
System: `q` (quit), `?` (help), `/` (search), `n` (new), `p` (item picker)
Numbers: `1-9` (favorites), `!-( ` (columns)
History: `C-z`/`C-S-z`/`C-y` (undo/redo)
Console: `` ` `` (toggle), `C-t` (dev toast)

### Add

| Key | Action | Rationale |
|-----|--------|-----------|
| `P` | Follow embedded link (go to project) | Mnemonic, complements `p` (item picker) |
| `x` | Toggle select current node | Standard in Linear/GitHub/Superhuman. Frees `Space` for task-only use. |

### Consider (future)

| Key | Action | Rationale |
|-----|--------|-----------|
| `za` chord | Toggle fold (alias for Tab) | Vim muscle memory. Requires chord support. |
| `g + {key}` | Go-to sections | Powerful but needs chord infra. |
| `y` | Yank/copy node | Standard vim. Currently unused. |
| `r` | Quick rename (alias for Enter) | Common in yazi/Linear. |
| `t` | Set date/tag | Common in Todoist/Things. |
| `s` | Change status | Common in Linear. |

---

## Sources

- [Vim folding cheatsheet](https://gist.github.com/lestoni/8c74da455cce3d36eb68)
- [Vim Cheat Sheet](https://vim.rtorr.com/)
- [Ranger keybindings](https://github.com/ranger/ranger/wiki/Keybindings)
- [Yazi quick start](https://yazi-rs.github.io/docs/quick-start/)
- [Lazygit keybindings](https://github.com/jesseduffield/lazygit/blob/master/docs/keybindings/Keybindings_en.md)
- [Tig manual](https://jonas.github.io/tig/doc/manual.html)
- [VS Code folding shortcuts](https://www.thedataschool.co.uk/myles-stevenson/mastering-code-folding-in-vs-code-with-shortcuts/)
- [Linear shortcuts (KeyCombiner)](https://keycombiner.com/collections/linear/)
- [Superhuman shortcuts (UseTheKeyboard)](https://usethekeyboard.com/superhuman/)
- [Notion shortcuts](https://www.notion.com/help/keyboard-shortcuts)
- [Obsidian folding](https://help.obsidian.md/Editing+and+formatting/Folding)
- [Things 3 shortcuts](https://culturedcode.com/things/support/articles/2785159/)
- [Todoist shortcuts](https://www.todoist.com/help/articles/use-keyboard-shortcuts-in-todoist-Wyovn2)
- [GitHub shortcuts](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts)
