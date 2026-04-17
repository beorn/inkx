# Keybindings v2 Design

Comprehensive keybinding redesign for km TUI. Three binding layers (vim/Ctrl/Cmd),
verb×location system (g/m/a), unified modal interface, smart pane toggle.

Bead: `km-all.keybindings-v2`.

## Design Principles

1. **Two modes everywhere**: Node mode + text edit mode. Same in board and detail pane.
2. **Verb×location composability**: g(goto), m(move), a(add) share location suffixes.
3. **Ctrl consistency**: Custom Ctrl keys work identically in both modes.
4. **Everything is a column**: Board columns and detail pane sections are the same abstraction.
5. **All operations are bulk**: Every action works on multi-selection.
6. **Auto-save on navigate**: Leaving text edit saves. No data loss.
7. **Invalid input = feedback**: Bell + cancel + bottom bar message.
8. **Emacs + Vim coexistence**: Emacs bindings in text edit mode, vim in node mode. For less important bindings, OK to sacrifice for high-value features if Kitty-protocol alternatives exist (e.g., Ctrl+F stays emacs in text mode; Cmd+F via Kitty is find).

## Binding Layers

| Layer | Modifier | Works in | Style |
|-------|----------|----------|-------|
| **Vim** | Bare keys + chords | All terminals | Vim/TUI native |
| **Ctrl** | Ctrl+key | All terminals | Consistent both modes |
| **Cmd** | Cmd+key | Kitty protocol (Ghostty, Kitty, WezTerm, foot) | macOS native |

## Three Verbs × Locations

```
suffix       GO TO (g)    MOVE (m)     ADD (a)
i  inbox     gi           mi           ai
j  today     gj           mj           aj
h  home      gh           mh           ah
+  project   g+           m+ (= +)     a+
[  node      g[           m[ (= [)     a[
#  tag       g#           m#           a# (= #)
@  person    —            —            a@ (= @)
p  parent    —            mp           —
g  first     gg           mg           —
G  last      —            mG           —
<fav>        g<k>         m<k>         a<k>

Ctrl         C-g (chord)  C-r          C-l
```

**Bare shortcuts**: `+` `[` = move (structural), `@` `#` = add (metadata).
In node mode = immediate action. In text edit = inline autocomplete (@, #, [[).

**g-only**: `go` (smart open), `gO` (alt open).
**Favorites**: any unassigned key. Manage via `M` (mnemonics/memory).

Inspired by Gmail's two-key navigation (`g then i` = inbox). The shared suffix set
means learning one location works across all three verbs — minimal memorization for
maximum reach. See [getinboxzero.com](https://www.getinboxzero.com/blog/post/gmail-shortcuts-cheat-sheet).

### Smart Open (go / gO)

| | go (regular) | gO (alt/dev) |
|---|-------------|----------|
| Folder | Finder | Terminal |
| File | Default app | Editor (nvim) |
| URL | Browser | — |
| Node link | Follow/navigate | — |
| Ctrl | Ctrl+o (node: smart open, text: open under cursor) | — |
| Cmd | Cmd+o | Cmd+S-o |

### Ctrl Keys (both modes)

All custom Ctrl bindings work identically in node mode and text edit mode,
whether focus is on the board or the detail pane.

| Key | Action |
|-----|--------|
| Ctrl+f | Local find (within current pane) |
| Ctrl+g | Goto chord prefix (= pressing `g`, waits for suffix) |
| Ctrl+k | Omnibox (universal search + commands) |
| Ctrl+l | Add / link picker |
| Ctrl+r | Re-parent / move picker |
| Ctrl+o | Smart open (node: Finder/browser, text: open under cursor) |
| Ctrl+t | Task dialog |

### Emacs Overrides

Three Ctrl keys override emacs readline in text edit mode. This follows modern
convention: Ctrl+f = find and Ctrl+k = command palette are standard in Superhuman,
Slack, VS Code, and most GUI apps. See [blog.superhuman.com](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/).

| Key | App function | Emacs function (lost) | Alternative |
|-----|-------------|----------------------|-------------|
| Ctrl+f | Local find | Forward char | Arrow right |
| Ctrl+g | Goto chord | Cancel/abort | Escape |
| Ctrl+k | Omnibox | Kill line | Select-to-end + delete |

Remaining emacs keys work normally in text edit:
Ctrl+a/b/d/e/h/n/p/u/w/y, Ctrl+_, Alt+b/d/f.

RSI note: Ctrl+f and Ctrl+r are same-hand (left Ctrl + left letter), slightly more
awkward than cross-hand combos like Ctrl+k. Users sensitive to "Emacs pinky" should
remap CapsLock → Ctrl. See [stackoverflow.com](https://stackoverflow.com/questions/52492/what-is-the-best-way-to-avoid-getting-emacs-pinky).

### Free Ctrl Keys

Ctrl+d, Ctrl+n, Ctrl+p, Ctrl+u, Ctrl+x (in node mode — emacs uses some in text edit)

## Omnibox

Universal search + commands + slash commands. One input, multiple modes.

| Key | Works in | Style |
|-----|----------|-------|
| : | Node mode only | Vim command mode |
| Ctrl+k | Both modes | Ctrl shortcut |
| Cmd+k | Both modes | macOS native (kitty) |

Supports: node search, go-to location, slash commands (/h1, /todo),
free-text commands. Arrow keys navigate results within the omnibox.

Pressing `:` or Ctrl+k when omnibox is already open toggles it closed
(Superhuman pattern — see [blog.superhuman.com](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)).

`:` is the right key for vim users — it maps directly to vim's command mode.
Having three paths (`:`, Ctrl+k, Cmd+k) covers traditionalists and modern GUI users.

## Local Find

Search within the currently focused pane (board or detail).

| Key | Works in | Style |
|-----|----------|-------|
| / | Node mode only | Vim search |
| Ctrl+f | Both modes | Standard shortcut |

Inline bar at bottom, highlights matches, n/N navigate, Escape clears.
**F / Cmd+f** opens search/replace dialog (floating, adds replace + regex).

## Dual Cursors

Board and detail pane each maintain their own cursor.

| State | Board Cursor | Pane Cursor |
|-------|-------------|-------------|
| Board focused | **Bright yellow** | Dim yellow |
| Pane focused | Dim yellow | **Bright yellow** |
| No pane open | **Bright yellow** | — |

Focus switching: Cmd+h/l (kitty) or mouse click. Escape from pane returns to board.

## Detail Pane

The detail pane IS a column — same abstraction as board columns. Node mode
and text edit mode work identically. All operations apply.

- **j/k** = up/down through sections (title, body blocks, properties, children, backlinks)
- **i / Enter** = edit focused item (title, body block, or property)
- **Space** = toggle select (same as board — it's a column)
- **Property rows** are inline-editable: cursor on "Due: Mar 5", press Enter to edit
- **g/m/a/t** prefixes all work (same mode, different context)
- **Escape** = unfocus pane (return to board), pane stays open

## Smart-D (Pane Toggle)

D is context-aware with three states:

| Current State | D does | Result |
|--------------|--------|--------|
| Pane closed | Open + focus pane | Pane focused |
| Pane open, board focused | Focus pane | Pane focused |
| Pane open, pane focused | Close pane | Board focused |

This eliminates the need for a separate "focus pane" key. One hiccup: pressing D from
board with pane open focuses instead of closing — user must press D twice to close.
The dim cursor indicator makes pane state visible. Pattern is: "D always gets you
the pane or gets rid of it, depending on where you are."

Cmd+w always closes the pane regardless of focus state.

## Escape / Focus Layering

Each Escape pops one layer (follows focus stack):
1. **Text edit** → node mode (cursor stays on node, edit saved)
2. **Pane focused** → focus board (**pane stays open**, pane cursor dims)
3. **Dialog open** → close topmost dialog (keep pressing to close all)
4. **Selection active** → clear selection
5. **Nothing** → no-op (visual bell)

Pane is closed explicitly via D (when focused) or Cmd+w. Escape never closes the pane.

## Navigation

| Key | Action |
|-----|--------|
| h / l | Move left / right (columns) |
| j / k | Move up / down (items) |
| J / K | Move block-by-block (auto-unfolds) |
| gg / G | First / last item |
| { / } | History back / forward |
| Cmd+[ / Cmd+] | History back / forward (kitty) |
| PgUp / PgDn | Page scroll |

## Folding

| Key | Action |
|-----|--------|
| H / L | Fold / unfold at cursor (subtree, progressive) |
| < / > | Fold / unfold all (board-wide) |

## View

| Key | Action |
|-----|--------|
| z | Zoom in (per press, repeatable — NOT a chord) |
| Z | Zoom out (per press, repeatable) |
| , | Settings (view modes, preferences) |

## Search

| Key | Type | UI |
|-----|------|-----|
| / / Ctrl+f | Local find | Inline bar at bottom |
| F / Cmd+f | Search / replace | Floating dialog |
| : / Ctrl+k / Cmd+k | Omnibox | Full overlay |

Local find scopes to whichever pane has focus. n/N navigate find matches.
Escape clears find highlights. Omnibox has its own result navigation (arrows).

## Dialogs & Pane (Shift+letter)

| Key | Cmd | Type | UI |
|-----|-----|------|-----|
| T | Cmd+t | Task properties | **Dialog** (floating) |
| F | Ctrl+g / Cmd+g | Filter / sort / group | **Dialog** (floating) |
| S | Shift+Cmd+f | Search & replace | **Dialog** (floating, macOS-style) |
| A | — | AI / agent | **Dialog** (floating) |
| D | Cmd+p | Preview / detail | **Pane** (embedded sidebar) |

Only D is a real pane (embedded, persistent, has its own cursor). T/F/S/A are floating dialogs.
Escape closes topmost dialog (keep pressing to close all). D uses smart toggle (see above).

### Local Find (inline, lightweight)
| Key | Mode | Action |
|-----|------|--------|
| / | node | Open local find bar (vim-style) |
| Ctrl+f | node | Open local find bar |
| Ctrl+/ | any | Open local find bar (works in text edit mode too) |
| Cmd+f | any (Kitty) | Open local find bar |
| n / N | find active | Next / previous match |

### Search & Replace Dialog (macOS-style)
| Key | Context | Action |
|-----|---------|--------|
| Tab | dialog | Switch find/replace fields |
| Enter / Shift+Enter | dialog | Find next / previous |
| Cmd+r / Ctrl+r | dialog | Replace current match |
| Cmd+Shift+r / Ctrl+Shift+r | dialog | Replace all |
| Cmd+x / Ctrl+x | dialog | Toggle regex |
| Escape | dialog | Close |

## Edit Entry

| Key | Action | Cursor |
|-----|--------|--------|
| i | Edit title | Start |
| Enter | Edit title | End |
| I | Edit body | Start |
| S-Enter | Edit body | End |

## Text Edit Mode

Bare keys type characters. Modifiers and special keys only.

**Emacs readline (still working):** Ctrl+a/e, Ctrl+b, Alt+b/f, Ctrl+d/h,
Ctrl+u/w, Alt+d, Ctrl+y, Ctrl+n/p, Ctrl+_ (undo).

**Emacs overridden:** Ctrl+f (find), Ctrl+g (goto), Ctrl+k (omnibox).

**Ctrl verbs (consistent):** Ctrl+f (find), Ctrl+g (goto chord), Ctrl+k (omnibox),
Ctrl+l (add/link), Ctrl+o (open under cursor), Ctrl+r (reparent), Ctrl+t (task).

**Inline autocomplete:** @ (person), # (tag), [[ (node link).

**Kitty:** Cmd+z/S-z, Cmd+c/x/v, Cmd+b/i (bold/italic), Cmd+f/k/n.

**Other:** Escape, Tab/S-Tab, Enter, slash commands (P4), markdown shortcuts.

## Editing (node mode)

| Key | Action |
|-----|--------|
| o / O | New item below / above |
| c / C | Capture new (quick-add to inbox) |
| Cmd+n | Capture new (kitty) |
| e | Archive (remove from view, still searchable) |
| d / S-Backspace | Cut forward (cursor → next) |
| Backspace | Cut backward (cursor → prev) |
| y | Copy (yank) |
| p | Paste |
| Cmd+d | Duplicate (kitty) |
| Tab / S-Tab | Indent / outdent |
| Alt+h/j/k/l | Shift node (also Alt+arrows) |
| u / U | Undo / redo |

All operations work on multi-selection: Space-select multiple, then d/y/e/Tab/x/c applies to all.
Verb chords (a#, m+, etc.) also apply to all selected items.

Archive (`e`) follows Superhuman's model — single-key archive is one of the most
important speed optimizations for triage workflows. See [simplehuman.email](https://www.simplehuman.email/post/which-email-client-has-better-keyboard-shortcuts-superhuman-or-others/).

## Organizational (bare symbols)

| Key | Action | Mode |
|-----|--------|------|
| @ | Assign person (= a@) | Node: immediate. Text: autocomplete |
| # | Add tag (= a#) | Node: immediate. Text: autocomplete |
| + | Move to project (= m+) | Node: immediate |
| [ | Move to node (= m[) | Node: immediate. Text: [[ = autocomplete |

All work on multi-selection.

## Task (t-prefix)

| Key | Action |
|-----|--------|
| tt / Ctrl+t | Task dialog |
| t- | Clear taskness (remove all task properties) |
| to | Set owner |
| td | Set date/due (natural language) |
| t! | Set priority |
| ts | Set status |
| tl | Set label/tag |

Consolidates what apps like Linear do with scattered single keys into one mnemonic
prefix. All work on multi-selection.

## Task Status

| Key | Action |
|-----|--------|
| x | Toggle done / not-done (quick) |
| X | Cycle through all statuses (full control) |

## Favorites

| Key | Action |
|-----|--------|
| 0-9 | Jump to favorite |
| M | Manage favorites (mnemonics/memory) |

Any unassigned key can be a favorite. Works with g/m/a: g<key>, m<key>, a<key>.

## Selection & Bulk

| Key | Action |
|-----|--------|
| Space | Toggle select (board AND pane) |
| S-arrows | Extend selection |
| Ctrl+a / Cmd+a | Select all |
| v | Visual mode (P4) |

All operations work on multi-selection: d, y, e, x, Tab, S-Tab, c,
and all verb chords (a#, a@, m+, m[, etc.).

## System

| Key | Action |
|-----|--------|
| Ctrl+c | Quit immediately |
| : | Omnibox (type `quit` to exit) |
| ? | Help |
| / | Local find |
| c / C | Capture new (quick-add to inbox) |
| Ctrl+k / Cmd+k | Omnibox |
| Ctrl+f | Local find |
| Cmd+n | Capture new (kitty) |
| , | Settings / view modes |
| \` | Debug console |

> Bare `q` is intentionally **unbound**. A single fat-finger keystroke must
> never destroy the session — especially after an incomplete chord like `vq`
> where the user meant `vs`. See bead km-tui.q-quits-no-confirm.

## Mouse

| Action | Effect |
|--------|--------|
| Click | Select node |
| Double-click | Edit node |
| Cmd+click | Toggle select (on URL: opens URL) |
| Ctrl+click | Smart open |
| Shift+click | Range select |
| Right-click | Context menu |
| Scroll | Scroll view |
| Cmd+scroll | Zoom in/out |

## Context-Sensitive Key Bar + Mode Indicator

```
── NODE ──── j/k↕  h/l↔  i edit  o new  d cut  x done  Space sel  ? more
── TEXT ──── Esc exit  C-a start  C-e end  C-o open  @ # [[ auto  ? more
── VISUAL ── j/k extend  d cut  y copy  e archive  Esc cancel
── PANE ──── j/k↕  Enter edit  Space sel  P close  t… task  ? more
── g… ────── i inbox  j today  h home  + proj  [ node  # tag  o open  O dev
── m… ────── i inbox  j today  h home  + proj  [ node  # tag  p parent
── a… ────── i inbox  j today  h home  + proj  [ node  # tag  @ person
── t… ────── t dialog  - clear  o owner  d date  ! pri  s status  l label
```

Note: PANE key bar is a contextual variant of NODE mode — all node-mode bindings work.

The key bar follows best-in-class: Superhuman shows shortcut hints when you use mouse
actions to train keyboard usage. Linear has a searchable shortcut list. km's persistent
hints + which-key popups are "better than what many mainstream apps do" per external review.

## Transient Prefix Menus

Chord prefixes (g, m, a, t) show which-key popup after ~300ms.
Resolution is instant on valid suffix — timeout is only for showing the menu UI.
Ctrl+g enters the same goto chord — shows the same which-key popup.
Invalid suffix → bell + cancel + bottom bar feedback.

This is comparable to lazygit's contextual menus and Emacs which-key — turning multi-key
chords into guided selections. See [lazygit keybindings](https://github.com/jesseduffield/lazygit/blob/master/docs/keybindings/Keybindings_en.md).

## Cmd Shortcuts (kitty only)

Cmd+c/x/v (clipboard), Cmd+z/S-z (undo/redo), Cmd+a (select all),
Cmd+f (search/replace dialog), Cmd+g (filter dialog), Cmd+k (omnibox),
Cmd+n (capture new), Cmd+d (duplicate), Cmd+o (smart open),
Cmd+S-o (alt open — terminal/editor), Cmd+t (task dialog),
Cmd+p (preview pane), Cmd+h/l (focus board/pane),
Cmd+w (close pane), Cmd+b/i (bold/italic in text edit),
Cmd+[/] (history), Cmd+, (settings)

Kitty protocol support is forward-looking — most TUI apps don't bother, but it
gives Mac users native-feel shortcuts. Requires km-infra.kitty-proto (bead).

## Quick Reference

```
═══════════════════════════════════════════════════════════════
MOVEMENT                              EDITING
  hjkl ......... item / columns         o / O ....... new below / above
  JK ........... block-by-block         c / C ....... capture new (inbox)
  gg / G ....... first / last           e ........... archive
  { / } ........ history back/fwd       d / Bksp .... cut fwd / bwd
  PgUp/PgDn .... page scroll            y ........... copy (yank)
                                        p ........... paste
FOLDING                                 x / X ....... done toggle / cycle
  H / L ........ fold / unfold          Tab / S-Tab . indent / outdent
  < / > ........ fold / unfold all      Alt+hjkl .... shift node
                                        Alt+arrows .. shift (alt)
VIEW                                    u / U ....... undo / redo
  z ............ zoom in (per press)
  Z ............ zoom out (per press) EDIT ENTRY
  , ............ settings / views       i ........... title at start
                                        Enter ....... title at end
SEARCH                                  I ........... body at start
  / C-f C-/ .... local find             S-Enter ..... body at end
  n / N ........ next / prev match
  : C-k Cmd-k .. omnibox             TASK (t-prefix)
  F Cmd-f ...... search / replace       tt / C-t .... task dialog
                                        t- .......... clear taskness
                                        to td t! ts tl  set properties
───────────────────────────────────────────────────────────────
VERBS × LOCATIONS       GO TO (g)    MOVE (m)     ADD (a)
  i  inbox              gi           mi           ai
  j  journal/today      gj           mj           aj
  h  home (@next)       gh           mh           ah
  +  project            g+           m+ (= bare +) a+
  [  node               g[           m[ (= bare [) a[
  #  tag                g#           m#           a# (= bare #)
  @  person             —            —            a@ (= bare @)
  p  parent             —            mp           —
  g  first              gg           mg           —
  G  last               —            mG           —
  <fav key>             g<k>         m<k>         a<k>

  Ctrl                  C-g (chord)  C-r          C-l

  Smart open: go (Finder/browser) / gO (terminal/editor)
  Bare: + [ = move (structural), @ # = add (metadata)
  All verb chords work on multi-selection
───────────────────────────────────────────────────────────────
DIALOGS & PANE (Shift+letter)        FAVORITES
  T / Cmd+t .... task (dialog)         0-9 ........ jump to favorite
  G / Cmd+g .... filter/sort (dialog)  M .......... manage (mnemonics)
  F / Cmd+f .... search/replace         Any key assignable
  A ............ AI / agent (dialog)   Works with g/m/a verbs
  P / Cmd+p .... preview (smart-P)
  Escape ....... close dialog(s)     FOCUS (board ↔ pane)
                   unfocus pane        P .......... smart toggle
  Cmd+w ........ close pane            Cmd+h/l .... switch (kitty)
                                       Click ...... in other pane
CTRL (both modes)
  C-f .......... local find           DUAL CURSORS
  C-g .......... goto chord             Active pane: bright yellow
  C-k .......... omnibox                Inactive:    dim yellow
  C-l .......... add / link
  C-r .......... move / reparent     SELECTION & BULK
  C-o .......... smart open            Space ....... toggle select
  C-t .......... task dialog            S-arrows .... extend selection
  C-a .......... select all*            C-a ......... select all*
  Emacs overrides: C-f C-g C-k         v ........... visual mode (P4)
                                      All ops work on multi-select
CMD (kitty only)                       *C-a = emacs BoL in text edit
  Cmd+c/x/v .... clipboard
  Cmd+z/S-z .... undo / redo         DETAIL PANE (= a column)
  Cmd+a ........ select all            j/k ......... navigate sections
  Cmd+d ........ duplicate             Enter/i ..... edit focused item
  Cmd+o ........ smart open            Space ....... toggle select
  Cmd+S-o ...... alt open (dev)        g/m/a/t ..... all work in pane
  Cmd+n ........ capture new           Esc ......... return to board
  Cmd+k ........ omnibox
  Cmd+f ........ search/replace      MOUSE
  Cmd+h/l ...... focus board/pane      Click ....... select
  Cmd+w ........ close pane            Dbl-click ... edit
  Cmd+[/] ...... history               Cmd+click ... toggle sel / open URL
  Cmd+b/i ...... bold/italic           Ctrl+click .. smart open
  Cmd+, ........ settings              S-click ..... range select
                                       Right-click . context menu
ESCAPE LAYERING                        Scroll ...... scroll
  text → node → unfocus pane →         Cmd+scroll .. zoom
  close dialog(s) → selection →
  no-op (pane stays open)            SYSTEM
  Edits auto-saved on navigate         q ? / : c ` ,
═══════════════════════════════════════════════════════════════
FREE: . b D f r s w % ; \ ' " ~ _ = -    Ctrl: d n p u x
```

## Free Keys

. (dot-repeat), b, D, f, r, s, w, %,
;, \, single-quote, double-quote, ~, _, =, -
Ctrl: d, n, p, u, x

Additional shifted symbols available: $, ^, &, *, (, ), ]

## Future (P4+)

- **Dot-repeat** (.): Repeat last edit action
- **Visual mode** (v): Range selection with hjkl
- **Slash commands**: /h1, /todo, /code via omnibox
- **[[ autocomplete**: Fuzzy-search for node links while editing
- **Linger preview**: Key bar shows node preview on hover ~500ms
- **Natural language dates**: "tomorrow", "next fri" in td picker
- **Registers**: Named clipboards if users need multiple paste buffers (plenty of free keys)
- **Macros**: Record/replay action sequences for batch editing

## Design Comparison

### vs Superhuman
- Both: `e` = archive, command palette (Cmd+k / :), single-key triage
- km adds: verb×location chords, detail pane, task management, text editing
- Superhuman uses nudges to teach shortcuts; km uses persistent key bar + which-key

### vs Linear
- Both: keyboard-first project management, status cycling, command palette
- km consolidates task actions under `t` prefix (vs Linear's scattered single keys)
- Linear has searchable shortcut help; km has contextual key bar

### vs lazygit
- Both: vim-like TUI, contextual menus, single-letter actions
- km's g/m/a system is "more systematic and predictable" than lazygit's ad-hoc menus
- lazygit uses capital vs lowercase for variants (P push, p pull); km uses Shift for dialogs

### vs Helix/Kakoune
- km uses vim's verb-then-target (g+i = goto inbox)
- Kakoune uses object-then-verb (select, then act)
- km avoids Helix's consistency issues by enforcing "two modes everywhere"

### vs Taskwarrior-TUI
- Both: terminal task management, vim navigation
- km is more scalable (verb×location handles many destinations)
- Taskwarrior-TUI overrides Ctrl+e/y for scrolling, similar to km's emacs overrides

## References

- [Gmail two-key navigation](https://www.getinboxzero.com/blog/post/gmail-shortcuts-cheat-sheet) — g+i = inbox pattern
- [Superhuman command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/) — Cmd+K as universal entry, teaches shortcuts
- [Superhuman vs others](https://www.simplehuman.email/post/which-email-client-has-better-keyboard-shortcuts-superhuman-or-others/) — keyboard triage speed
- [Emacs pinky RSI](https://stackoverflow.com/questions/52492/what-is-the-best-way-to-avoid-getting-emacs-pinky) — CapsLock→Ctrl mitigation
- [Helix keybinding consistency](https://github.com/helix-editor/helix/discussions/1511) — mode inconsistency problems
- [Helix vs vim efficiency](https://github.com/helix-editor/helix/discussions/1324) — mnemonic vs brevity trade-off
- [Taskwarrior-TUI keybindings](https://kdheepak.com/taskwarrior-tui/keybindings/) — vim-like task TUI reference
- [Lazygit keybindings](https://github.com/jesseduffield/lazygit/blob/master/docs/keybindings/Keybindings_en.md) — contextual menus
- [Linear keyboard shortcuts](https://linear.app/changelog/2021-03-25-keyboard-shortcuts-help) — searchable shortcut help
