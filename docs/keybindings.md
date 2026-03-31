# Keybinding Design Guide

> Self-contained guide for choosing keybindings in km. Follow these principles to
> assign a binding for a new action and have it feel native.

## 1. Modes

km has two input modes. The mode determines which modifier tiers are available:

| Mode | When active | Available tiers |
|------|-------------|-----------------|
| **Node mode** | Navigating the board | Bare, Shift, Ctrl, Cmd, Option, Chords |
| **Text edit mode** | Editing inline text | Ctrl, Cmd, Option only (bare keys are text) |

A binding that uses a bare key or Shift only works in node mode.
Ctrl, Cmd, and Cmd+Shift work in both modes.

## 2. Modifier Tiers

| Tier | Convention owner | Scope | Purpose |
|------|-----------------|-------|---------|
| Bare key | **Vim** | Node only | Movement, operators, mode switches |
| Shift+key (capitals) | **km app** | Node only | Open dialogs, panels, toggles |
| Ctrl+key | **App / Emacs** | Both modes | App commands; emacs text editing where no conflict |
| Cmd+key | **Browser / macOS** | Both modes | Standard app shortcuts (requires Kitty) |
| Cmd+Shift+key | **Extended** | Both modes | Variant of Cmd action (requires Kitty) |
| Option+arrows | **macOS** | Both modes | Shift/reorder nodes |
| Chord (prefix+key) | **km app** | Node only | Verb namespaces (g=goto, v=view, etc.) |

Ctrl is a full app-command tier that works in both modes. It can override emacs
bindings when necessary — Ctrl is the only reliable modifier in terminals without
Kitty, so it must carry app commands. Where there's no conflict, Ctrl can also
serve emacs text-editing shortcuts.

**Rule**: Pick the tier that matches your convention source. Don't put a
vim-inspired binding in the Cmd tier or a browser convention on a bare key.

## 3. Convention Sources

km borrows from five convention families. When they conflict, the tier owner wins.

### Vim (owns bare keys)

Sacred for bare lowercase keys in node mode:

| Bare key | Action | Vim origin |
|----------|--------|-----------|
| `h/j/k/l` | Cursor movement | Core |
| `d` | Delete/cut operator | Core |
| `y` | Yank/copy | Core |
| `p/P` | Paste after/before | Core |
| `u` | Undo | Core |
| `o/O` | Open line below/above | Core |
| `/` | Search | Core |
| `n/N` | Next/prev match | Core |
| `i` | Enter edit mode | Core |
| `gg/G` | Top/bottom | Core |
| `Ctrl+D/U` | Half-page down/up | Core (sacred) |

**Don't reassign these.** If you need a bare key and it conflicts with vim,
pick a different letter.

### Emacs (Ctrl in text mode — secondary to app commands)

App commands on Ctrl take priority. Emacs fills the gaps:

```
Ctrl+A/E  = beginning/end of line
Ctrl+B/F  = back/forward char
Ctrl+D    = delete forward
Ctrl+K    = kill to end of line
Ctrl+W    = delete word backward
Ctrl+U    = kill to beginning of line (but Ctrl+U = half-page up in node mode)
Ctrl+Y    = yank (paste from kill ring)
Ctrl+N/P  = next/previous line
```

### Browser / macOS (owns Cmd tier)

Must feel like a standard macOS app:

| Cmd+key | Action | Source |
|---------|--------|--------|
| `Cmd+C/X/V` | Copy/cut/paste | Universal |
| `Cmd+Z` | Undo | Universal |
| `Cmd+Shift+Z` | Redo | Universal |
| `Cmd+F` | Find | Browser |
| `Cmd+Shift+F` | Search/replace | VS Code |
| `Cmd+K` | Command palette | VS Code, Chrome |
| `Cmd+N` | New item | macOS |
| `Cmd+W` | Close view/pane | Browser |
| `Cmd+T` | Task properties | Browser (new tab) |
| `Cmd+,` | Settings | macOS |
| `Cmd+Q` | Quit | macOS |
| `Cmd+D` | Duplicate | iWork, Figma |
| `Cmd+Enter` | Confirm/submit | Common |

**Don't invent novel Cmd bindings.** If there's no established convention for
Cmd+key, leave it unbound or find a matching convention.

### iWork / Creative tools (object manipulation)

- `Cmd+D` = duplicate in-place
- `Tab/Shift+Tab` = indent/outdent
- Arrow keys with Option = nudge/reorder
- `Enter` = begin editing; `Escape` = stop editing

### macOS system (immutable reservations)

| Key | System meaning | Status |
|-----|---------------|--------|
| `Cmd+C` | Copy | Immutable |
| `Cmd+V` | Paste | Immutable |
| `Cmd+X` | Cut | Immutable |
| `Cmd+Q` | Quit | Immutable |
| `Cmd+H` | Hide application | Immutable (don't bind) |
| `Cmd+Tab` | App switcher | Immutable |
| `Cmd+Space` | Spotlight | Immutable |

## 4. Choosing a Letter

### Principle 1: Mnemonic first

Every binding should be explainable in one word: "F for Find", "D for Detail".

### Principle 2: App tiers share meaning

Within **app-owned tiers** (Capital, Cmd, Cmd+Shift, Chord), the same letter
should mean the same concept:

```
S (capital)   = open Search dialog
T (capital)   = cycle task status
t-chord       = task sub-actions (td=due, to=owner, ts=status)
```

The vim bare-key meaning (`d`=delete, `t`=till) is a separate namespace.

### Principle 3: One action, multiple access paths

Important actions should be reachable via multiple tiers:

| Access path | Convention | Example: Find |
|-------------|-----------|---------------|
| Bare key (node) | Vim | `/` |
| Capital (node) | App | `S` (Search dialog) |
| Cmd (both modes) | Browser | `Cmd+F` (needs Kitty) |
| Cmd+Shift (both modes) | Extended | `Cmd+Shift+F` (search & replace) |

Not every action needs all four paths.

### Principle 4: Frequency determines tier

| Frequency | Tier | Example |
|-----------|------|---------|
| Constant (every few seconds) | Bare key | `j/k` movement |
| Frequent (every few minutes) | Capital or Cmd | `D` detail, `Cmd+Z` undo |
| Occasional | Chord or Cmd+Shift | `td` set due date |
| Rare | Command palette only | Settings, advanced features |

### Principle 5: Chords = verb + noun

| Prefix | Verb | Example suffixes |
|--------|------|------------------|
| `g` | **Go to** | `i`=inbox, `h`=home, `j`=journal, `/`=root |
| `v` | **View** | `m`=mode, `c`=collapse, `d`=done, `i`=icons |
| `t` | **Task** | `d`=due, `o`=owner, `s`=status, `t`=dialog |
| `m` | **Move** | `i`=inbox, `h`=home, `a`=archive, `p`=parent |
| `c` | **Create** | `c`=capture dialog, `h`=home, `i`=inbox |
| `a` | **Add** | `[`=link, `#`=tag, `@`=assignee, `+`=project |

### Principle 6: Don't bind what you can't explain

If an action doesn't have a natural mnemonic letter, consider the command
palette instead.

## 5. Edit Mode Access

Important actions must be reachable while editing text.

### With Kitty protocol

Cmd handles app commands. Ctrl is free for emacs.

These Cmd shortcuts work in **both** node mode and text edit mode (they punch
through the inline-edit-barrier):

```
Cmd+Z       = undo
Cmd+Shift+Z = redo
Cmd+B       = bold (text edit only)
Cmd+I       = italic (text edit only)
Cmd+F       = local find
Cmd+Shift+F = search & replace
Cmd+K       = command palette
Cmd+D       = duplicate node
Cmd+N       = capture dialog
Cmd+Enter   = insert below
Cmd+Shift+Enter = new item dialog
Ctrl+F      = emacs forward-char (text editing, with Kitty)
```

### Without Kitty protocol

Ctrl is the only modifier that reaches edit mode. Find is accessed via `/` in
node mode (no Ctrl binding needed since Cmd+F covers both modes with Kitty):

```
/      = local find (node mode only)
Ctrl+N = find next (when find bar active + text input)
Ctrl+P = find prev (when find bar active + text input)
```

### Sacred bindings (always keep)

| Key | Node mode | Text mode |
|-----|-----------|-----------|
| `Ctrl+D` | Half-page down (vim) | Delete forward (emacs) |
| `Ctrl+U` | Half-page up (vim) | Kill to beginning (emacs) |
| `Ctrl+N` | Next item (vim) | Next line (emacs) |
| `Ctrl+P` | Previous item (vim) | Previous line (emacs) |

## 6. Modifier Naming (Code)

In km-commands, modifiers use macOS user-facing names:

| km-commands field | Key | silvery field |
|-------------------|-----|------------|
| `cmd` | Cmd (⌘) | `super` |
| `opt` | Option (⌥) | `meta` |
| `ctrl` | Control (⌃) | `ctrl` |
| `shift` | Shift (⇧) | `shift` |

The key adapter (`keyToModifiers`) translates between the two naming schemes.

## 7. Help Dialog Rendering

### Grouping actions

Related actions shown on one line, separated by faint `/`:

```
y/d/p  Cmd+c/Cmd+x/Cmd+v ···· copy/cut/paste
```

### Rendering conventions

| Element | Style |
|---------|-------|
| Key text | yellow, bold |
| Chord dot (`g·i`) | yellow, dimmed |
| Filler dots | `#444444` (very dim) |
| `/` separators (keys and descriptions) | `#444444` (faint) |
| Dialog titles | Include hotkey hint: `Help [?]`, `Filter [F]` |

## 8. Verb x Location System

### Architecture

The keybinding system uses a composable verb x location pattern to generate chord keybindings from a cross-product of verbs and locations. This replaces manually-defined chord entries with a functional vocabulary.

### Location Registry

`getSystemLocs()` maps chord suffix keys to `{ key, label }` pairs. Values come from `<vault>/.km/config.json` (with defaults):

| Suffix | locationKey (default) | Description |
|--------|-------------|-------------|
| `h` | `@next` | Home board |
| `i` | `@inbox` | Inbox board |
| `j` | `journals/{YYYY}/{YYYY-MM-DD}.md` | Today's journal (date template) |
| `a` | `@archive` | Archive board |
| `p` | `{parent}` | Parent of current node |
| `g` | `{first}` | First sibling |
| `G` | `{last}` | Last sibling |
| `0-9` | `fav:${n}` | Favorite by number |

`PICKER_LOCS` maps to deferred locations: `#`→`pick:#`, `@`→`pick:@`, `+`→`pick:+`, `[`→`pick:[`.

### Verb Constructors

Functions `(locationKey: string) => Execute` that create VerbActions:

| Verb | Action Type | Description |
|------|-------------|-------------|
| `goTo` | CURSOR_TO | Navigate to target |
| `moveTo` | REPARENT_TO | Move node(s) to target |
| `addTo` | LINK_TO | Add link/property to target |
| `createIn` | CREATE_AT | Create item at target |

### Grid Helper

`verbLocationGrid()` generates chord keybindings from the cross-product of verbs and locations. For example:
- `g i` -> goTo("@inbox") -> CURSOR_TO { locationKey: "@inbox" }
- `m j` -> moveTo("@journal") -> REPARENT_TO { locationKey: "@journal" }
- `a #` -> addTo("pick:#") -> LINK_TO { locationKey: "pick:#" }

Nonsensical combinations are skipped (e.g., `a g`, `c j`).

### Keybinding Resolution

1. Key event -> `processKey()` in key-adapter
2. Chord processing (pending prefix detection, timeout)
3. Keybinding resolution against layers (first match wins)
4. If binding has `execute`, call it directly
5. Otherwise, look up command in registry via `commandId`

### Adding a New Verb

1. Add verb constructor in `verb-locations.ts`
2. Add to `VERBS` registry
3. Grid automatically generates all chord combinations
4. Add skip rules in `verbLocationGrid()` for nonsensical combinations

### Adding a New Location

1. Add a default entry to `DEFAULT_SYSTEM_LOCATIONS` in `favorites.ts`, or add to `<vault>/.km/config.json`
2. Add handler logic for the new locationKey in the verb handlers (`handleCursorTo`, etc.)
3. Grid automatically generates all verb combinations
