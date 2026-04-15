# Omnibox Design

Unified picker + command palette + search, one component, sigil-dispatched.

Tracked by [km-tui.omnibox-unified](../../.beads/issues.jsonl). Design-first.

**Prerequisites**: [data-model.md](data-model.md) (nodes, sigils, contexts), [navigation-architecture.md](navigation-architecture.md) (goto/zoom/nav-history).

## The problem

Today km has ~five near-duplicate modal components:

| Component | File | Purpose |
|---|---|---|
| `Omnibox` | `apps/km-tui/src/views/Omnibox.tsx` | Command palette (`cmd-k`) |
| `ItemPicker` | `apps/km-tui/src/views/ItemPicker.tsx` | Verb-targeted picker (project / tag / assignee / item) |
| `FavoritesDialog` | `apps/km-tui/src/views/FavoritesDialog.tsx` | Quick-access bookmark selector |
| `SearchDialog` | *(legacy)* | Full-text search (absorbed into find-bar) |
| `CommandBox` | `apps/km-tui/src/views/CommandBox.tsx` | `:` shell-style commands (unused) |

Each owns its own input buffer, result list, row renderer, hover state, popover wiring, keybinding scope, dialog mode, and confirm/cancel callbacks. They share `NodeLine` (row) and `useDialogInput` (key plumbing) but diverge in every other respect. Every new "pick a thing" feature gets a new dialog.

Bugs this shape has caused, in the last month alone:
- **km-tui.palette-arrow-keys** — arrow keys fell through to `cursor_up` because dialog-guard wasn't installed in production; once one of five dialogs was visible, all should have worked but none did.
- **km-tui.picker-rank-subpath** — `ItemPicker`'s fuzzy scorer ranks `@office/Finance/Accounts/Delei/SPD` above `@delei` for query "Delei"; the shared `NodeLine` renders fine but the dialog-local ranking is broken.
- **Go-to verb fragmentation** — `goto @`, `goto #`, `goto +`, `goto [` each push a different picker type even though they're the same input with a different filter.
- **Command discovery** — `cmd-k` shows commands, but there is no way to search nodes from the same box. Users must remember to close the palette and open a different one.

The common cause is **dialog-per-verb instead of one dialog with verb modes**.

## Goal

One component: the **combobox**. It handles every "find something, then do a thing with it" workflow. The v1 presentation form is a dialog overlay (floating, dismissable). A post-v1 affordance "pops it out" into a pane for persistent workflows.

One result list, one row renderer, one state machine, one set of keybindings.

> **Naming note:** this doc uses "combobox" for the component and "omnibox" for the overall feature (the filename and the tracking bead `km-tui.omnibox-unified` still use "omnibox"). A combobox dialog and a combobox pane are the same component in two presentation forms.

## The core realization — bidirectional action↔object combobox

Every invocation of the combobox resolves to **three parts**, and different users in different moments flow through them in different orders:

1. **A default command** — always set. `"default"` (a registered command that dispatches by argument type) is the universal fallback; verb-locking chords (`m +`, `c @`, `/`, etc.) override with a specific verb.
2. **An object** — a node from the tree. The primary interaction.
3. **A resolved action** — what runs on Enter. `defaultCommand`. Sticky: picking a command or an object persists across sigil switches.

The key insight: **the combobox supports both directions — object→action AND action→object — in the same component**, with `defaultCommand` acting as the pivot and the buffer's leading sigil as the in-session mode switch.

### The two directions

| Direction | Entry | Flow | Example |
|---|---|---|---|
| **Command-first** (`action → object`) | `cmd-k` (buffer = `":"`) | Browse commands filtered by `when` against the sticky cursor. Pick a command. Enter → run against sticky cursor (or find a different target first by typing a non-`:` sigil). | `cmd-k` → `:cr` → pick `create_at` → Enter → create under sticky cursor |
| **Object-first** (`object → action`) | `cmd-f` (buffer = `""`), `g` chords, or any chord with a pre-selected sigil | Hunt the target; Enter fires the default command (or the sticky selected command) against it. | `cmd-f` → `@del` → pick `@delei` → Enter → `default` dispatches → goto @delei |
| **Action-first with locked verb** (`action → object`) | Verb-locking chords: `m +`, `a #`, `c @`, `l g`, `/` | Verb is locked by the chord; object search is step two. | `m +` → `km` → pick `+km` → Enter → move cursor into +km |
| **Flip direction mid-stream** | Any | Type a different sigil in the buffer — the leading sigil auto-replaces, preserving the rest. Or press `cmd-k`/`cmd-f` to toggle modes. Sticky memory means both halves stay. | `cmd-f` → `@delei` selected → `cmd-k` → buffer `:` + `@delei` sticky → pick `move` → Enter → move @delei |

**`defaultCommand` is the pivot:**
- In **command-first** (`cmd-k`) and **object-first** (`cmd-f`) flows it's `"default"` — the universal type-dispatch fallback.
- In **action-first** flows with verb-locking chords it's a specific verb (`"move"`, `"create_at"`, `"local_find"`).
- The user can override via `defaultCommand` at any time by typing `:<verb>` or pressing `cmd-k`.

| Opened via | `buffer` | `defaultCommand` | `selectedArgument` at open | Direction |
|---|---|---|---|---|
| `cmd-k` / `ctrl-k` | `":"` | `"default"` | prior pane's cursor | command-first |
| `cmd-f` / `ctrl-f` | `""` | `"default"` | prior pane's cursor | object-first |
| `g @` chord | `"@"` | `"default"` | *(empty)* | action-first |
| `g #` / `g +` / `g [` | `<sigil>` | `"default"` | *(empty)* | action-first |
| `g g` | `""` | `"default"` | prior pane's cursor | object-first on cursor |
| `g :` | `":"` | `"default"` | *(empty)* | command-first (empty) |
| `m @` / `m +` | `<sigil>` | `"move"` (locked) | *(empty)* | action-first |
| `a @` / `a #` | `<sigil>` | `"add"` (locked) | *(empty)* | action-first |
| `l g` | `""` | `"add_link"` (locked) | prior pane's cursor | action-first |
| `c @` | `"@"` | `"create_at"` (locked) | *(empty)* | action-first |
| `/` | `"/"` | `"local_find"` (locked) | *(empty)* | action-first (bottom-left) |

### Vim alignment is automatic

km's chord keybindings are already verb–noun grammar, which is exactly how vim users think: `d` + motion, `y` + text-object, `c` + word. The action-first flows in the combobox — `g @`, `m +`, `c @` — follow the same mental model: verb first, then the target is picked via search rather than via motion.

`cmd-k` (command-first) and `cmd-f` (object-first) are the modeless / discovery-friendly paths for users who think in either "I know the verb" or "I know the thing" terms. **Both mental models get their native flow**, in the same component, without forcing anyone to relearn. Power users get `Ctrl+{g,m,a,l,c}+Enter` modifier-chord shortcuts that skip the `:`-search round-trip entirely.

### How the single buffer works

The combobox has **one working buffer**, whose leading sigil routes the search:

- `""` (empty) → universal search (everything ranked by type)
- `":xxx"` → command search, filtered by `when` against `selectedArgument`
- `"@xxx"` / `"#xxx"` / `"+xxx"` → type-scoped node search
- `"[xxx"` → node full-text (or `[<task-status>]` task filter)
- `"/xxx"` → local find (locks layout to bottom-left)

Typing a sigil character auto-replaces the current leading sigil while preserving the rest of the buffer — no Tab, no focus-switch, no separate command-field and argument-field. Sticky memory (`defaultCommand` + `selectedArgument`) survives mode switches, so bouncing between `:cr` and `@del` doesn't lose the picks from either side.

- `Enter` → runs `resolveEnter()` — `defaultCommand` against `selectedArgument`.
- `Shift+Enter` / `Ctrl+Enter` / `Ctrl+{g,m,a,l,c}+Enter` → direct-verb shortcuts that override `defaultCommand` for this single dispatch.
- `cmd-k` / `cmd-f` → mode toggle (while open — see § "Opening and toggling the combobox").
- `Escape` → dismiss (dialog) or clear (pane).

The asymmetry matters: "two fields with Tab parity" undersells the intent. One buffer, one sigil-routed result list, sticky selections on both sides of the pivot. Most users never need the `:` override because the default command (or the chord's locked verb) already does the right thing.

### Dialog or pane — two presentation forms, one component

The component itself is a **combobox**: single sigil-routed buffer + result list + state machine + sticky selections on both sides of the pivot. It has **two presentation forms**, both equally valid, that share the same state shape, reducer, row renderer, and keybindings:

| Form | Ownership | Lifecycle | Example |
|---|---|---|---|
| **Combobox dialog** | Global overlay slot on the app shell | Ephemeral — opens on chord, closes on confirm/escape | Today's `cmd-k`, `g @`, `/`, `m +`, etc. |
| **Combobox pane** | Regular workspace pane, `viewMode: "combobox"` | Persistent — lives as long as the pane exists | "Popped-out" dockable pane — a permanent triage / navigator surface |

**V1 ships only the dialog form.** It replaces the five existing dialog components (`Omnibox`, `ItemPicker`, `FavoritesDialog`, legacy `SearchDialog`, `CommandBox`) with one unified combobox dialog. The pane form — "pop it out" — is a post-v1 affordance. Important but not as urgent.

**Dialog placement is a function of the default command:**

| defaultCommand | Dialog placement | Rationale |
|---|---|---|
| `local_find` | Bottom-left, inline status bar | Search-in-current-view feels like a status affordance, not a modal |
| everything else | Center modal | Standard combobox UX |

Backspace through the `/` sigil in the argument field — which drops the default command back to the previous `goto` — also promotes the dialog from bottom-left back to center. The user never has to think about placement; it's derived.

**The pane form has no "placement" axis.** A combobox pane is just a pane — the workspace manager decides where it renders (split, docked, resized) like any other pane. The "pop it out" action takes the dialog's current state and creates a pane initialized from that state, then dismisses the dialog.

### Why this unification is deep

- **Commands are already nodes.** (See [Result types](#result-types--everything-is-a-node).) The `:` sigil searches the `commands/` subtree via the same ranker and row renderer that searches every other subtree. One tree, one buffer, one ranker, one row component.
- **The combobox's `selectedArgument` IS the cursor while it has focus.** Commands read "the current cursor" and act. The cursor source follows focus:
  - Cards pane focused → cursor is the cursored card.
  - Detail pane focused → cursor is the focused block.
  - **Combobox dialog open and focused → cursor is `selectedArgument`.**
  - **Combobox pane focused (post-v1) → cursor is `selectedArgument`.**
  Commands don't know or care which surface supplies the cursor. `goto`, `move`, `create_at` just read `currentCursor()` and fire.
- **`default` resolves type-dispatch inside the command system, not the reducer.** When there's no explicit `defaultCommand` and no chord-locked `defaultCommand`, the universal fallback is the `default` command, which inspects `currentNode.type` and does the right thing (command → run, else → goto). Future per-type customization (tags → filter, projects → zoom) is a one-function change in `default.execute()` — zero combobox-UI work.
- **Global keybindings work inside the combobox with no special scope.** There's no `dialog:combobox` mode that shadows the app's keymap. The only keys the combobox consumes are the ones any focused text input would consume — letters, arrows, Enter, Escape, Backspace. Everything else (`Ctrl+S`, `Cmd+Z`, `vm`, `z`/`Z`) falls through to the global layer exactly as it does when an inline card-title editor has focus in the cards view. `cmd-k` and `cmd-f` are special only in that they're bound at the global layer to also work *while* the combobox is open, to toggle search mode.
- **The dialog form and the pane form share `ComboboxState`.** The difference is only *where* the state lives — a global overlay slot vs. a pane. The reducer, keybindings, row renderer, command-tree projection, everything downstream of the state is identical. "Pop it out" is a single state transition: move `ComboboxState` from overlay-slot to a new pane, dismiss the overlay.

## Mockups

All mockups below are the **same component** with different `placement` and initial field state. The layout is a presentation prop; the search, ranker, row renderer, and state machine are identical. These are semantic wireframes — not box-drawn ASCII — each element is a line annotated with what it is. `▸` prefix marks the currently-focused field; `←` marks the selected row in the result list.

### 1. `cmd-k` — command-first, sticky cursor pre-selected as argument

Opens with `buffer = ":"`. User is in command-search mode by default (VS Code convention). `selectedArgument` is pre-seeded from the prior pane's cursor so that any picked command has something to operate on. Commands are filtered by `when` against the sticky cursor.

```
state:        { buffer: ":", defaultCommand: "default", selectedArgument: <cursor> }

  chip        :   [ default ]   selected target: <cursor node>  (sticky)
  buffer      : ▸ :_

  results     : : goto                       g
              : : move <cursor> to…          m
              : : create_at …                c
              : : open_in_system             ⏎ (in detail)
              : : … (filtered by when(cursor))

  footer      : ↵ <picked cmd> <cursor>   ⌘f switch to finder   esc
```

User types `:cr`, picks `create_at`, Enter → runs `create_at` against the sticky cursor = create a child under the current node.

### 2. `cmd-f` — object-first, same cursor pre-selected

Opens with `buffer = ""` (empty, universal argument search). Same cursor pre-selected as `selectedArgument`. Top row is the cursor itself. Enter resolves via the `default` command: since the cursor is a node (not a command), it runs `goto` — a no-op refocus. Shift+Enter runs `create_at` against it instead.

```
state:        { buffer: "", defaultCommand: "default", selectedArgument: <cursor> }

  chip        :   [ default ]
  buffer      : ▸ _

  results     : @ omnibox.md                +km/docs/design         ←   (cursor node = selected arg)
              : + km-tui.omnibox-unified    beads              P0
              : @ delei                     context
              : # urgent                    47 uses
              : board.tsx                   +km/apps/km-tui/src

  footer      : ↵ goto (via default)   ⇧↵ create_at   ⌘k switch to commands   esc
```

User types `@del` → buffer becomes `@del`, results switch to context search, `@delei` bubbles to the top with match-highlighting:

```
state:        { buffer: "@del", defaultCommand: "default", selectedArgument: @delei }

  chip        :   [ default ]
  buffer      : ▸ @del_

  results     : @ [del]ei                                context       ←
              : @ [del]oitte                             work/context
              : @ @office/Finance/Accounts/[Del]ei/SPD   deep match

  footer      : ↵ goto (via default) @delei   ⇧↵ create_at @delei   ⌘k commands   esc
```

Square brackets in the mockup stand in for the highlighted match spans. Enter → `default` dispatches by type → `@delei` is a person → goto → navigate to @delei.

### 3. Switch to commands via `cmd-k` — action panel on the selected argument

From mockup 2 (user has `@delei` highlighted in the results), user presses `cmd-k`. The buffer switches to `:`, and the results list is now commands filtered by `when(@delei)` — only commands valid for a person node appear. This is the Embark/Raycast "action panel on selected candidate" pattern, achieved by the context-sensitive `cmd-k` toggle without any new mechanism.

```
state:        { buffer: ":", defaultCommand: "default", selectedArgument: @delei }

  chip        :   [ default ]  →  overridable
  buffer      : ▸ :_

  results     : : goto                    g                        ← top match
              : : move @delei to…         m
              : : add_tag to @delei       # (via add chord)
              : : open in detail pane     ⏎ (in detail view)
              : : … (filtered by when(@delei))

  footer      : selected target: @delei   ·   ↵ run picked cmd   ⌘f back to finder   esc
```

User types `mo`, `move` bubbles to the top, Enter runs `move @delei`. Alternatively, the user could have used the shortcut `Ctrl+m+Enter` from mockup 2 to skip this step entirely — both land at the same dispatch.

### 4. Sigil auto-replace — swap search mode mid-stream

From mockup 2 (`:cr` typed, user was command-searching), user realizes they actually want to find a person. They type `@`. The leading `:` is auto-replaced, the buffer becomes `@cr`, and the results switch to context search.

```
state:        { buffer: "@cr", defaultCommand: "create_at" (sticky), selectedArgument: null }

  chip        :   [ default ]
  buffer      : ▸ @cr_

  results     : @ crashel                   context          ← top match
              : @ craig                     work/context
              : @ @office/Finance/Accounts/Crdei  deep match

  footer      : ↵ default @crashel   ⌘k commands   esc
```

Typing sigils swaps modes in place. No Tab, no focus-switching. The search term after the sigil is preserved (`:cr` → `@cr`). Sticky memory keeps any previously-picked `defaultCommand` — bouncing back via `cmd-k` brings it back.

### 5. Bottom-left local find — `/` sigil

Same component, `placement="bottom-left"`. The command is locked to `find` and the result list is **in-place highlighting on the board**, not a dropdown. The search engine is identical — only the renderer is different (no row list, just in-place highlight spans). Same row-level match-highlight logic powers both — extracted from the row renderer into a shared `highlightMatches(text, query)` helper.

```
placement:    bottom-left
state:        { command: "find", arg: "omnibox", focus: arg }

  [board]     : Matches highlighted in-place on the rendered tree.
              : Current match has a stronger highlight; others subtle.

  bottom bar  : / omnibox_          2 / 37    ↵ next   ⇧↵ prev   esc
```

Backspace through `/` → promotes back to `placement="center"` with `command="goto"`, argument buffer preserved.

### 6. Omnibox as pane — `placement="pane"` (future, post-v1)

The same component, docked as a persistent pane like the detail pane. Argument-field selection continuously drives the cursor — wherever you arrow in the omnibox list, that node becomes the "current cursor" for the rest of the app. Power-user workflow surface; no new abstractions, just a third placement value.

```
placement:    pane   (sibling of board pane and detail pane)
state:        { command: "goto", arg: "", focus: arg, persistent: true }

  [the pane looks like mockups 1-4 but never dismisses on Enter — it
   re-focuses the result list and lets the user keep navigating]
```

## Model

### Single buffer + sigil routing

The combobox has **one working buffer** whose leading sigil determines what's being searched. There are no separate command/argument fields and no focus flag — one buffer, one result list, one keystroke to switch modes.

**Sigil routing.** The first character of `buffer` selects the search scope:

| Leading char | Mode | Searches |
|---|---|---|
| `:` | **Command** | Command tree, filtered by `when` against `selectedArgument` |
| `@` | **Context** | Person / assignee nodes |
| `#` | **Tag** | Tag nodes |
| `+` | **Project** | Project nodes |
| `[` | **Node** | Any node (full-text) — `[x]` / `[ ]` / `[]` are task-status filter prefixes; otherwise `[` + text is node-only full-text |
| `/` | **Local find** | Current view's visible tree (locks layout to bottom-left, defaultCommand to `local_find`) |
| `>` | *(reserved)* | Jump to heading in current doc |
| `?` | *(reserved)* | Help — "what does this key do?" inline docs |
| *(empty)* | **Universal** | Everything, ranked by type |

**Sigil auto-replace.** Typing a sigil character replaces the current leading sigil (if any), preserving the rest of the buffer. `@del` + `#` → `#del` (tag search for "del"). `:cr` + `@` → `@cr` (context search). Sticky memory ensures selections on both sides of the pivot persist across the switch.

**Entering command-search mode.** Three equivalent ways:
1. **Type `:` into the buffer** — the sigil auto-replace rule makes `:` the command-search prefix.
2. **Press `cmd-k`** (keyboard alias) — equivalent to setting `buffer = ":"`. Works whether the combobox is open or closed.
3. **Open via `g :` chord** — initial buffer is `":"`.

**Empty-buffer behavior.** When the buffer is empty (or just a bare sigil), the result list shows **recents filtered by prefix**. The prefix is whatever has been typed so far, including the leading sigil:

- `buffer = ""` → recent goto targets + the prior pane's cursor (pre-selected as `selectedArgument`).
- `buffer = ":"` → recently-run commands, filtered by `when` against the sticky cursor.
- `buffer = "@del"` → recent context picks matching "del", then other matches.

Recents are just "nodes ordered by `lastVisitedAt` desc"; the ranker combines recency with match score. "Filtered by prefix like everything else in the list" means the ranker applies the same match rules — recents are not a privileged separate list.

**`/` local find is the same component, different layout.** `/` sets `buffer = "/"`, which in turn derives `layout = "bottom-left"` and `defaultCommand = "local_find"`. The result list becomes in-place match highlighting on the board instead of a row list. Backspace through `/` → promotes back to `layout = "center"` with `defaultCommand = "default"`.

### Result types — everything is a node

**Big simplification: commands are nodes.** The command palette and the node picker don't have separate result types — they're both querying the same tree, just filtered differently. A command is a `KNode` with `type: "command"` living under a `commands/` root (an in-memory synthetic subtree, not on disk).

| KNode `type` | Sigil | Primary | Secondary | Default action |
|---|---|---|---|---|
| `command` | `:` | Command title | Keybinding hint + when-result | Run command |
| `person` | `@` | Name | Role / parent path | Goto / assign |
| `tag` | `#` | Tag name | Usage count | Goto / tag selection |
| `project` | `+` | Project name | Parent path + status | Goto / move-in |
| `file` / `folder` | *(type icon)* | Title | Parent path + modified date | Goto / zoom-in |
| `h` / `p` / `li` (block) | *(type icon)* | Title or content | Parent breadcrumbs + body preview | Goto / zoom-in |

**Why this matters:**

1. **Ranking is one function.** `rankResults(query, KNode[])` — no per-type branches, no "is this a command or a node" check. Commands rank by the same rules as everything else (with a type-weight bias in Universal mode).
2. **The row renderer is one component.** `<OmniboxRow node={n} query={q} />` — sigil, primary, secondary are derived from `n.type` and `n.data`. The command palette's one-liner view and the picker's one-liner view **are already the same thing** — they both render a node.
3. **Cross-type search "just works."** Typing `zoom` in Universal mode searches commands AND nodes in one pass — the same index, the same ranker, the same result list. The command `:zoom-out` and the node `Zoom Room Ideas` compete fairly.
4. **Recent / favorites become node queries.** "Recent goto targets" is `nodes where lastVisitedAt > T1`. "Recent commands" is `nodes where type=command AND lastRanAt > T2`. The MRU list is just another query on the tree.
5. **Keybindings → commands → nodes.** The keybinding layer already looks up commands by id. If commands are nodes, a keybinding is a `when` predicate + a pointer to a command node. Showing "what does this key do?" (the `?` sigil) becomes a reverse-lookup against the same tree.

**The command node shape:**

```ts
interface CommandNode extends KNode {
  type: "command"
  data: {
    commandId: string          // "board.zoom-in"
    title: string              // "Zoom In"
    description?: string       // for help / tooltip
    when?: string              // when-clause expression (see below)
    keybinding?: string        // default binding for display ("z")
    run: (ctx: CommandContext) => void | Promise<void>
  }
}
```

The `run` function lives on the in-memory node and is **not serialized**. Commands are registered at app startup into the synthetic `commands/` subtree — the `km-board/commands/*` files define and own them, and the omnibox just reads the tree.

### Availability via `when` clauses

Every command node carries an optional `when` expression — a small predicate DSL over the current app context. If `when` evaluates to false, the command is:
- **Hidden** in the omnibox result list (and not matched by the ranker)
- **Inactive** as a keybinding (the key falls through to the next layer)

This replaces the ad-hoc "is dialog open / is editing / is detail pane" checks sprinkled through `keybindings.ts` today. When-clauses are the unified gate.

**Context fields** (read-only, derived from store on every omnibox frame):

```ts
interface CommandContext {
  viewMode: "cards" | "columns" | "tabs" | "detail"
  hasSelection: boolean
  selectionCount: number
  isEditing: boolean
  inDialog: boolean
  dialogMode: string | null           // "dialog:omnibox" | "dialog:find" | null
  cursorType: KNode["type"] | null    // type of the cursored node
  cursorIsCommand: boolean
  activePaneType: "board" | "detail" | "empty"
  // … extensible
}
```

**When-clause grammar** (keep this dead simple — no AST, no parser generator):

```
expr  := term ("&&" term)* | term ("||" term)*
term  := "!" term | "(" expr ")" | atom
atom  := ident ("==" | "!=") literal | ident
```

Examples:
- `viewMode == "detail"` — only in detail pane
- `isEditing && cursorType == "p"` — only when editing a paragraph
- `!inDialog && hasSelection` — cursor has a selection, no dialog is open
- `activePaneType == "board" && !isEditing` — normal board mode

Parsing and evaluating this is ~60 lines. It's sufficient for the control we need — if we later want something richer, VS Code's [`when` clause reference](https://code.visualstudio.com/api/references/when-clause-contexts) is the precedent.

### Row component

All rows share the **same component** — a thin wrapper over `NodeLine` that already renders one-liner views of nodes elsewhere (the detail pane, breadcrumbs, the current command palette, the current pickers):

```ts
interface OmniboxRowProps {
  node: KNode                 // the result — command or content node
  query: string               // for match highlighting
  isSelected: boolean
  isCursor: boolean           // user's board cursor — highlighted differently
  verb: Verb                  // shapes the trailing affordance hint
}
```

The renderer derives sigil color, primary label, and secondary metadata from `node.type`. The existing command palette one-liner view and the picker one-liner view **collapse into this one component** — they were already rendering nodes, just through different code paths.

**Match highlighting is shared with `/` local find.** The row renderer calls a `highlightMatches(text, query)` helper that returns text spans tagged as matched vs unmatched. Matched spans render with an accent background (or the theme's search-hit color). The exact same helper powers in-place highlighting when `placement="bottom-left"` (local find on the board) — one highlighter, one look, one rule about which characters are matches.

### Ranking

**Per-match score** (applies within a single result list, before final sort):

1. **Exact full-buffer match** — bonus +100
2. **Exact sigil-body match** (buffer `@delei` → `@delei` result) — bonus +80
3. **Segment-prefix match** — bonus +40 per segment matched at position 0. Segments split on `/`, `.`, `-`, `_`, and sigils (`@`, `#`, `+`).
4. **Dense substring** — Pretext-style density score (fewer gaps = higher)
5. **Match offset penalty** — subtract `matchStart` (earlier matches rank higher)
6. **Length penalty** — subtract `log2(result.totalLength)` (shorter wins on ties)
7. **Subpath depth penalty** — subtract `segmentCount - 1` (deep paths rank last)

**Per-type weight** (cross-type ranking in Universal mode):

- Command: 1.0
- Person: 1.0
- Tag / Project: 0.9
- File: 0.8
- Block: 0.6

This fixes the reported bug: search `@delei` → `@delei` gets bonuses from #1 (exact), #2 (sigil-body), #3 (segment prefix), short length, depth=1. `@office/Finance/Accounts/Delei/SPD` gets only #4 (dense substring), loses #5 (offset >20), #6 (long), #7 (depth=5). `@delei` wins.

**Canonical test fixture**: `apps/km-tui/tests/omnibox-ranking.test.ts` — table of `(query, results)` where the expected order is hand-written. Every ranking tweak is validated against the table.

### Default command, override via `:` sigil or `cmd-k`, fallback via `default`

Every combobox instance has a **default command** (`defaultCommand` on `ComboboxState`) set at creation from the opening chord. Open chords that don't commit to a verb (`cmd-k`, `cmd-f`, generic `g` chords) use `"default"` as the initial value; verb-locking chords override:

| Open via | defaultCommand |
|---|---|
| `cmd-k`, `cmd-f`, `g` chords | `"default"` (universal fallback — dispatches by argument type) |
| `m` chord | `"move"` |
| `a` chord | `"add"` |
| `l` chord | `"add_link"` |
| `c` chord | `"create_at"` |
| `/` (direct) | `"local_find"` |

**Override = type `:` into the buffer (or press `cmd-k` while open).** There are two equivalent ways to enter command-search mode:

1. **Type `:`** into the buffer — the sigil auto-replace rule makes `:` the command-search prefix. `selectedArgument` is preserved. Commands are filtered by `when` against the preserved argument.
2. **Press `cmd-k`** (keyboard alias) — fires `COMBOBOX_SWITCH_TO_COMMANDS`, which is equivalent to setting `buffer = ":"`. Same effect, no typing.

User picks a command via the filtered list. `defaultCommand` is set. Switching back to argument search (via `cmd-f` or typing a non-`:` sigil or backspacing through the `:`) preserves `defaultCommand` — the pick is sticky.

**Enter resolution** follows the chain `defaultCommand`, so:
- If the user picked a command explicitly, it wins.
- Else the chord's default command runs.
- Else (`defaultCommand = "default"`) the `default` command handles type-dispatch internally (commands → run, else → goto).

This is strictly simpler than the old "Tab + command field" model: there's no Tab, no field-focus flag, no `commandBuffer`/`argumentBuffer` split. Just one buffer, sticky memory, and the resolution chain.

### Global keybindings are automatic (no special scope)

There is **no `dialog:combobox` scope** that needs special handling. When the combobox dialog is open and focused, the only keys it consumes are the ones any focused text input would consume — letters, arrow keys, Enter, Escape, Tab, Backspace. Everything else (`Ctrl+S`, `Cmd+Z`, `z`/`Z`, `vm`, `[`/`]`) falls through to the global keybinding layer exactly as it does when an inline card-title editor has focus in the cards view.

This is not a new mechanism; it's the standard text-input-consumes-its-own-keys rule that the app already implements for inline editing. The combobox's command and argument fields are just text inputs, and the keybinding layer already knows how to route keys around them.

**No pass-through rule, no separate scope, no "dialog overlay with exceptions".** The combobox dialog inherits the app's keymap; its text fields hijack only what they need. Same pattern for the pane form: a combobox pane's text fields hijack letters/arrows/Enter; everything else passes through to the pane's parent keybinding chain.

**Confirm keys:**

| Key | Action |
|---|---|
| `Enter` | Run `resolveEnter()` — `defaultCommand` against `selectedArgument`. |
| `Shift+Enter` | Shortcut override — run `create_at` against `selectedArgument`. Equivalent to typing `:create_at` then Enter. |
| `Ctrl+Enter` | Shortcut override — run `goto` against `selectedArgument`. Mirrors global `follow_link`. |
| `Ctrl+{g,m,a,l,c}` + `Enter` | Shortcut overrides — direct verb dispatch without typing in `:`. The vim-style modifier-chord family. |
| `cmd-k` | Switch to command-search mode (`buffer = ":"`, preserve `selectedArgument`). |
| `cmd-f` | Switch to argument-search mode (`buffer = ""`, preserve `defaultCommand`). |
| `Escape` | Cancel — dismiss the dialog (or clear the pane's buffers). |

The modifier-chord family (`Ctrl+{g,m,a,l,c}+Enter` + `Shift+Enter`) are direct-verb shortcuts that skip the `:search` round-trip. Each is equivalent to "type `:<verb>`, pick the top result, Enter" but in one keystroke. Power-user path for users who know the verb.

**Disabled state.** If the resolved command requires an argument but `selectedArgument == null`, Enter is inactivatable — the footer shows `↵ <command> (disabled — no target)` and a bell rings on Enter. The user's recourse:

1. Type `:` (or press `cmd-k`) and pick a zero-arg command like `:capture`.
2. Type a different argument query to get a new `selectedArgument`.
3. `Escape` to dismiss.

### `:capture` — the "I have nothing to act on" command

`create-in` requires a target. What if the user wants to **create a new node from scratch** — a fresh task, a new note, an inbox capture — without an existing parent in mind?

That's a different command: **`capture_inbox`** (already exists as a stub in `packages/km-commands/src/commands/edit.ts:255`). It creates a new node under a configured default parent (usually `+Inbox`). When invoked from the combobox with a non-empty buffer that isn't a node selection, the command reads the buffer as the new node's title:

- User opens with `cmd-f`, types `new task for tomorrow`, hits `cmd-k`, types `cap`, picks `capture_inbox`, Enter → creates a new node titled "new task for tomorrow" under `+Inbox`.
- Or: user opens via `c @` chord with no match, types `:cap` directly in the buffer, picks `capture_inbox`, Enter → same result.

`capture_inbox` is a normal command node with a `when` predicate that says "always available", a `run()` that creates in inbox, and a default keybinding. The principle: **no command is ever "create a new thing with no target" by default** — that's always the explicit `capture_inbox` command, which names where the node goes.

### Ghost completions drive autocompletion

The buffer shows **ghost-text completions** from Silvery's `TextInput` autocomplete. Rule:

**If the ghost is visible, an "accept" key commits it. If the ghost is not visible, nothing happens.** Accept keys are `Space`, `Tab`, and `Right-Arrow`. `Enter` also commits the ghost before firing confirm, so pressing Enter with a ghost visible completes the text then runs the command.

"Ghost visible" means: the `TextInput` has found a single unambiguous completion for the current buffer (Silvery's built-in `getAutocompleteSuggestion` logic). There is no "unambiguous top-2 ratio" heuristic — the ghost's presence is the sole signal. **Only ghosted completions are ever committed.** If the user is typing something ambiguous, no ghost → space is just a literal space.

**Example flow** — typing `:ne` with command-matching ghost `new-project`:

1. `buffer = ":ne"`, ghost shows `[w-project]` dimmed, rendered as `:ne[w-project]`.
2. User presses space (or Tab, or right-arrow). The ghost is accepted — `buffer` becomes `:new-project`.
3. Since `:new-project` is now an unambiguous command pick, `defaultCommand` is mutated to `"new-project"`.
4. The user types a new sigil (like `@`) to find a target, or Enter to run with the sticky `selectedArgument`.

If instead the user had typed `:zz` (no command matches), **there is no ghost, so space just inserts a space** — `buffer` becomes `:zz `. No special-casing, no heuristic.

### The combobox's cursor IS the cursor — because focus routes the cursor

This is the rule that makes both forms work identically. The app's `currentCursor()` function consults whichever surface has focus:

- Cards / columns / tabs pane focused → cursor is the pane's cursored node.
- Detail pane focused → cursor is the focused block.
- **Combobox dialog open and focused → cursor is the dialog's selected argument row.**
- **Combobox pane focused (post-v1) → cursor is the pane's selected argument row.**

Commands read "the current cursor" and act. They don't know or care which surface supplies it:

1. **No combobox-specific command dispatch.** Enter in the combobox fires the same `commandExecutor` that Enter fires everywhere else. The command reads the cursor, runs, and the combobox dialog dismisses as a side-effect (the pane form stays open and clears its buffers instead).
2. **Pre-selection ergonomic wins come for free.** When `cmd-k` opens a fresh combobox dialog, the initial selected argument is the previously-focused pane's cursor — so the dialog opens with "cursor points to whatever you were looking at". Enter runs `goto` against it (no-op "re-focus"). Shift+Enter runs `create_at` against it (creates a child). No special-casing — just cursor propagation during dialog creation.
3. **Arrowing in the combobox moves the cursor.** Because the selected argument row *is* the cursor while the combobox has focus. In a combobox pane, this turns the whole app into a keyboard-driven filtered view.
4. **Commands that don't need an argument** (`zoom_out`, `toggle_theme`, `save`) don't read the cursor. Their `execute` function ignores `ctx.currentNodeId`. Enter runs them directly regardless of the argument field's state.

### Command arguments — selected from the list, not typed

Commands that need an argument read it from the current cursor — which, as above, is the argument-field selection. **The user doesn't type arguments.** They search the argument field and pick one.

For commands whose argument is an existing node (goto, move, link, create_at, add, zoom-to, open-in-pane, …) this is the default. For commands that need a *new* name (`capture_inbox`, future `new_project`, `new_file`), the title is the buffer itself — the command reads `ctx.buffer` directly instead of looking up a selected node. That's a per-command choice expressed in the command's `execute()` function. The combobox doesn't need to know.

This gives a clean mental model: **the argument field is always "what node are you talking about?"** — either selected from the results, or (rarely, for create-new commands) taken as raw text.

## Opening and toggling the combobox

Every invocation resolves to a `ComboboxState` with `buffer`, `defaultCommand`, and (optionally) a pre-selected `selectedArgument`. The same keys work while the combobox is already open — pressing them mid-session switches modes instead of re-opening.

### While closed — opening keys

| Chord | `buffer` | `defaultCommand` | `selectedArgument` at open |
|---|---|---|---|
| `cmd-k` / `ctrl-k` | `":"` | `"default"` | prior pane's cursor |
| `cmd-f` / `ctrl-f` | `""` | `"default"` | prior pane's cursor |
| `g @` | `"@"` | `"default"` | *(empty)* |
| `g #` / `g +` / `g [` | `<sigil>` | `"default"` | *(empty)* |
| `g :` | `":"` | `"default"` | *(empty)* |
| `g g` | `""` | `"default"` | prior pane's cursor |
| `m @` / `m +` | `<sigil>` | `"move"` (locked) | *(empty)* |
| `a @` / `a #` | `<sigil>` | `"add"` (locked) | *(empty)* |
| `l g` | `""` | `"add_link"` (locked) | prior pane's cursor |
| `c @` | `"@"` | `"create_at"` (locked) | *(empty)* |
| `/` | `"/"` | `"local_find"` (locked) | *(empty)* |
| *(post-v1)* `combobox.pop_out` | *(inherits from dialog)* | *(inherits)* | *(inherits)* |

### While open — mode-toggle keys (context-sensitive)

| Key | Action |
|---|---|
| `cmd-k` / `ctrl-k` | `COMBOBOX_SWITCH_TO_COMMANDS` — set `buffer = ":"`, **preserve `selectedArgument`**. The command list is filtered by `when` against the preserved argument. This IS the Embark/Raycast "action panel on selected candidate" pattern — no new mechanism needed. |
| `cmd-f` / `ctrl-f` | `COMBOBOX_SWITCH_TO_ARGUMENT` — set `buffer = ""`, **preserve `defaultCommand`**. Return to universal argument search, keeping any sticky command pick. |
| Any sigil char in buffer | Auto-replaces the current leading sigil, preserving the search term. See § "Sigil auto-replace" below. |
| `Escape` | Dismiss (dialog) or clear buffer + selections (pane). |

### The defining invariants

1. **Single buffer, sigil-routed.** The leading sigil of `buffer` determines what's being searched. No separate command-field and argument-field — one buffer, one focus, one result list. Sigil characters swap modes in place.
2. **Sticky memory.** `defaultCommand` and `selectedArgument` persist across mode switches. Picking `:create_at` then switching to `@del` and picking `@delei` leaves both stored — Enter runs `create_at @delei`.
3. **Default command is always set.** `defaultCommand` is never null; `"default"` is the universal initial value, a registered command that dispatches by argument type (command → run, else → goto).
4. **All chords converge on the same component.** The difference between `cmd-k`, `cmd-f`, `g @`, `m +`, etc. is the triple `(buffer, defaultCommand, selectedArgument)`. Everything else is shared.

### Sigil auto-replace — asymmetric, `:` is the only "slippery" sigil

The rule is deliberately asymmetric: **only `:` (command-search mode) gets auto-replaced by a newly-typed sigil character.** All other sigils are "sticky" — typing another sigil while in `@`/`#`/`+`/`[`/`/` mode inserts the char literally into the search term, without mode switching.

Why asymmetric? Because users searching content (in any of `@`/`#`/`+`/`[` scopes) often want to type literal sigil characters inside their query — `@mention` or `#hashtag` or content containing `:`. Sticky content sigils preserve that. The `:` → content transition is the common need ("I typed `:` by accident; now I want to find a thing"), and the rule makes it a single keystroke.

| Before | Typed | After | Effect |
|---|---|---|---|
| `:cr` | `@` | `@cr` | `:` is slippery — non-a-z typed into `:` mode replaces → switch to context search |
| `:cr` | `#` | `#cr` | Same — `:` replaced by new sigil |
| `:cr` | `a` | `:cra` | Letter — normal text input, no replacement |
| `@del` | `#` | `@del#` | `@` is sticky — `#` is typed literally into the buffer |
| `@del` | `:` | `@del:` | `@` is sticky — `:` is typed literally |
| `@del` | `l` | `@dell` | Letter — normal text input |
| `` (empty) | `@` | `@` | Buffer empty — `@` becomes the leading sigil |
| `` (empty) | `:` | `:` | Buffer empty — `:` becomes the leading sigil |

**The content → command direction uses `cmd-k` instead.** To go from `@del` (content search) back to `:` (command search), the user presses `cmd-k`. This is the context-sensitive mode toggle — idempotent, preserves `selectedArgument`. Typing `:` alone would be literal.

This eliminates the need for an explicit "Tab between fields" binding — `cmd-k` handles the content→command direction, sigil auto-replace handles the command→content direction, and sticky memory means the previously-committed half (`defaultCommand` or `selectedArgument`) persists across the switch.

**Command IDs in the tables above reference existing commands** in `packages/km-commands/src/commands/` — `move`, `add`, `add_link`, `capture_inbox`, `local_find`, `goto`, etc. The combobox adds exactly two new commands: `default` (the type-dispatch fallback) and `combobox.pop_out` (post-v1, transitions an open dialog into a pane).

## State machine — `ComboboxState`

`ComboboxState` is stored on the workspace as a pane. There is no special `ui.combobox` slot. The pane manager owns it, the same way it owns cards panes and detail panes.

- **Dialog form (v1):** a **singleton overlay pane** held in `workspace.overlayPane: Pane | null`. Renders above the normal pane layout. `null` when no combobox dialog is open. Layout is `"center"` or `"bottom-left"` depending on `defaultCommand`.
- **Pane form (post-v1):** a **regular workspace pane** in `workspace.panes`, with `layout: "dock"`. Participates in the normal pane manager (splits, resize, focus cycling). Multiple docked combobox panes can coexist.

The pop-out action is trivial: move the state from `workspace.overlayPane` into a new entry in `workspace.panes`, change `layout` to `"dock"`, and null the overlay slot. Same state, same reducer, different storage slot.

Both forms use the same reducer, the same `Pane` shape (with a `type: "combobox"` tag), and the same keybindings. The only material difference is **lifecycle**: the overlay pane is ephemeral (dismisses on `COMBOBOX_CONFIRM` or `COMBOBOX_CANCEL`); the docked pane persists and just clears the buffer on confirm.

**Single buffer, sticky other-half memory.** The combobox has ONE working `buffer` — not two — whose leading sigil determines what's being searched:

| Leading char | Mode | Search scope |
|---|---|---|
| `:` | command | command tree, filtered by `when` against `selectedArgument` |
| `@` | context | person/assignee nodes |
| `#` | tag | tag nodes |
| `+` | project | project nodes |
| `[` | node | any node (full-text) — `[x]` / `[ ]` / `[]` are task-status filter prefixes |
| `/` | local find | current view's visible tree (locks layout to bottom-left) |
| *(empty)* | universal | everything, ranked by type |

**Sigil auto-replace.** Typing a sigil character replaces the current leading sigil (if any) while keeping the search term:
- `@del` + typing `#` → `#del` (switch to tag search for "del")
- `:cr` + typing `@` → `@cr` (switch to context search)
- `@delei` + typing `:` → `:delei` (switch to command search — unlikely query but the mechanism is clean)

Sticky memory: when the buffer's sigil changes, the previously-focused half keeps its `selected*` pointer. User bounces back, selection is still there.

```ts
interface ComboboxState {
  /** Single working buffer — leading sigil determines what's being searched. */
  buffer: string

  /** The resolved command. Always set. Mutated by:
   *  - opening chord (`m +` → "move", `c @` → "create_at", `cmd-k`/`cmd-f` → "default")
   *  - user arrowing over a result while in `:`-mode (picks a new command)
   *  When the user is not in `:`-mode, this stays unchanged (sticky).
   *  The universal fallback is "default" — a registered command that dispatches
   *  based on the argument's node type (see § "The `default` command"). */
  defaultCommand: string

  /** Sticky argument. Mutated by:
   *  - opening chord with a pre-seeded argument (cursor pre-select)
   *  - user arrowing over a result while NOT in `:`-mode
   *  When the user is in `:`-mode, this stays unchanged (sticky). */
  selectedArgument: KNode | null

  /** Scope constraint on the argument source — replaces the legacy "pick a dialog
   *  component per use case" pattern. favorites/item picker/local-find use this. */
  sourceScope: "all" | "favorites" | "commands" | "current-view"

  /** Optional per-invocation predicate for further narrowing. Non-serializable. */
  resultFilter: ((node: KNode) => boolean) | null

  /** Layout hint for the dialog form. Derived from defaultCommand at open time
   *  (`local_find` → bottom-left; else → center). Ignored by the pane form. */
  layout: "center" | "bottom-left"

  /** Dialog form dismisses on successful CONFIRM; pane form clears buffer and stays open. */
  ephemeral: boolean
}
```

**What's NOT in the state shape:** the result list and its highlighted-row index. Those are owned by the inner `SelectList` (Silvery component — see `vendor/silvery/packages/ag-react/src/ui/components/SelectList.tsx`). The combobox feeds `SelectList` the computed results (via the ranker over the current buffer + scope + filter), and listens to its `onSelect` / `onHighlight` callbacks to mutate `defaultCommand` or `selectedArgument` based on the buffer's current mode. No duplication.

**Sticky memory via two-slot mutation:**
- Arrowing in `:`-mode (buffer starts with `:`) → `SelectList` highlights a command node → reducer mutates `defaultCommand = highlightedNode.data.commandId`.
- Arrowing in any other mode → highlights a content node → reducer mutates `selectedArgument = highlightedNode`.
- Switching sigils (by typing `:` or by `cmd-k`/`cmd-f` toggle) preserves the other slot automatically — it's not touched unless the user arrows in that mode.

**Resolution chain for Enter** — which command runs against which argument:

```ts
function resolveEnter(state: ComboboxState): { cmd: string; arg: KNode | null } {
  // defaultCommand is always set — "default" is the universal fallback
  return { cmd: state.defaultCommand, arg: state.selectedArgument }
}
```

No `defaultCommand` field. The "user picked a command" case is just "`defaultCommand` was mutated by arrowing in `:`-mode". Simpler reducer, simpler tests, simpler mental model.

**The `default` command** (registered in `@km/commands` alongside the existing 172):

```ts
const defaultCommand: CommandDef = {
  id: "default",
  name: "Default action",
  description: "Dispatch the natural default action for the argument's node type",
  execute: (ctx) => {
    const node = ctx.currentNode
    if (!node) return null
    // Commands run themselves; everything else navigates.
    if (node.type === "command") {
      return { type: "EXECUTE_COMMAND", commandId: node.data.commandId }
    }
    return { type: "CURSOR_TO", locationKey: node.id }
  },
}
```

This is the universal fallback. `defaultCommand = "default"` for cmd-k, cmd-f, and generic chord opens. Chords that lock a specific verb (`m +`, `a #`, `c @`, `l g`, `/`) override it with their own verb id. Extending per-type behavior later (tags → `filter_by`, projects → `zoom_in`) is a one-function change inside `default.execute()` — no reducer or combobox-UI work.

Actions (dispatched by the combobox's key handler):

```ts
type ComboboxOp =
  | { type: "COMBOBOX_INPUT"; buffer: string }       // single-buffer input; reducer handles sigil auto-replace
  | { type: "COMBOBOX_NAV_UP" | "COMBOBOX_NAV_DOWN" | "COMBOBOX_NAV_HOME" | "COMBOBOX_NAV_END" }
  | { type: "COMBOBOX_PICK" }                         // commit current selected* for the current sigil's mode
  | { type: "COMBOBOX_SWITCH_TO_COMMANDS" }           // cmd-k while open: set buffer="." (command mode), sticky arg preserved
  | { type: "COMBOBOX_SWITCH_TO_ARGUMENT" }           // cmd-f while open: set buffer="", sticky command preserved
  | { type: "COMBOBOX_CONFIRM" }                      // enter — runs resolveEnter() via commandExecutor
  | { type: "COMBOBOX_CANCEL" }                       // escape — dismisses or clears
  | { type: "COMBOBOX_POP_OUT" }                      // post-v1: convert dialog to pane
```

Note: `COMBOBOX_INPUT` is the single-field input action. The reducer handles sigil auto-replace internally — if the new buffer's leading char is a different sigil and there's a search term after it, swap the leading char and preserve the rest.

The existing `commandExecutor` (from `@km/commands`) handles `COMBOBOX_CONFIRM` — it calls `resolveEnter()`, looks up the command by id, and runs the command's `execute(ctx)` with `ctx.currentNodeId` = `selectedArgument?.id`.

**Invariants:**
- `selectedResultIndex` is in `[0, results.length)` or `null` when `results` is empty.
- Sigil auto-replace: when `buffer` changes such that its leading char is a sigil and differs from the old leading char, the rest of the buffer is preserved.
- Sticky memory: changing the buffer's sigil does NOT clear `defaultCommand` or `selectedArgument` — the only thing that clears them is explicit picking of a new selection OR `COMBOBOX_CANCEL`.
- `resolvedCommand` is always defined: `defaultCommand` — both are string-or-null-but-at-least-one-is-set, and `defaultCommand` is always set.
- `COMBOBOX_CONFIRM` with a selected command that requires an argument AND `selectedArgument == null` is a no-op + bell.
- `COMBOBOX_SWITCH_TO_COMMANDS` (cmd-k while open): set `buffer = ":"`, preserve `selectedArgument`. Commands list is filtered by `when` against `selectedArgument`. This IS the Embark/Raycast "action panel on selected candidate" pattern.
- `COMBOBOX_SWITCH_TO_ARGUMENT` (cmd-f while open): set `buffer = ""`, preserve `defaultCommand`. Result list reverts to universal search.
- `COMBOBOX_CANCEL` on the dialog form dismisses it and restores the previously-focused pane. On the pane form it clears buffer + both selected* + refocuses argument mode.
- `COMBOBOX_POP_OUT` (post-v1) creates a new pane with `viewMode: "combobox"`, copies the current `ComboboxState` into it, then dismisses the dialog.

## Migration

This is a refactor-then-feature, not a rewrite. The codebase already has most of the pieces: 172 registered commands (including `goto`, `move`, `add`, `add_link`, `local_find`, `capture_inbox`, `command_palette`, `item_picker`, `search`, `filter`, `manage_favorites`, `search_replace`), the `VerbOp` (`CURSOR_TO | REPARENT_TO | LINK_TO | CREATE_AT`) infrastructure that already dispatches to pickers, and Silvery's `TextInput` with autocomplete. The migration is mostly about collapsing 5 dialog components into one view mode and adding the command/argument two-field UX.

### Phase 1 — shared row component
Create `OmniboxRow` (the node-based one). Migrate the existing `Omnibox.tsx`, `ItemPicker.tsx`, `FavoritesDialog.tsx` to use it — adapter layer converts today's result shapes to `KNode`-compatible rows. No behavior change. Catches divergence bugs.

### Phase 2 — shared ranker
Extract `rankResults(query, KNode[])` with the ranking rules above. Add `omnibox-ranking.test.ts` table. Migrate `ItemPicker.filterOptions` and `Omnibox`'s scorer to use it. Fixes **km-tui.picker-rank-subpath**. Also extract `highlightMatches(text, query)` as a shared helper used by Phase 9's local-find view.

### Phase 3 — command-tree projection (TEA shim)
Build a read-only projection function that returns the `@km/commands` registry as `KNode`-shaped rows. No schema change to `CommandDef` — the projection is pure adapter. The synthetic `commands/` view is computed on demand. When TEA lands, this projection retargets at `app.commands.*` without touching the row renderer. Tests: every registered `CommandDef` appears as a `KNode` with `type: "command"` and round-trips through the row renderer.

### Phase 4 — predicate-function availability
Add an optional `when?: (ctx: CommandContext) => boolean` field to `CommandDef`. No string DSL, no parser — just a predicate function. Maps 1:1 to TEA's signal-based `when()`. Start with **no migration of existing commands** — leave `modes?: CommandMode[]` as the current gating mechanism. Add `when` only where the existing `modes` field is insufficient (e.g., view-mode guards, cursor-type guards, cross-field predicates). Phase out `modes` gradually in a later pass. Tests: a command with `when: (ctx) => ctx.viewMode === "detail"` appears in the omnibox results only when a detail pane is active.

### Phase 5 — unified combobox dialog (single buffer)
Build the `Combobox` component + `ComboboxState` reducer as a **global overlay dialog** — not a pane. State lives in `app.combobox: ComboboxState | null`. Component has: one buffer (Silvery `TextInput` with `autocomplete` wired to sigil-routed results), result list below, footer showing the resolved action + sticky selections. Opened via `cmd-k` / `cmd-f` / chord; state is `{buffer, defaultCommand, selectedArgument, sourceScope, layout, ephemeral}`. Add the `default` command to `@km/commands`. Route `command_palette`, `item_picker`, `search`, `manage_favorites` to open the combobox with appropriate `sourceScope`. Legacy `search_replace` and `filter` stay on their current dialogs (deferred). Old components become thin delegators that call `openCombobox(...)`. **This is the v1 ship** — it replaces five dialogs with one.

### Phase 6 — cursor unification via focus
Teach the app's `currentCursor()` lookup to check the combobox overlay slot first: if a combobox has focus, its `selectedArgument` is the source; otherwise the focused pane's cursor wins. One-function change in the command executor. Remove any `dialog:omnibox` scope guards. Tests: arrow in the combobox → commands reading `ctx.currentNodeId` act on `selectedArgument`.

### Phase 7 — sigil auto-replace, sticky memory, ghost completion, modifier-chord shortcuts
Add the full UX polish over the Phase 5 single-buffer foundation:
- Sigil auto-replace: typing `@`/`#`/`+`/`[`/`/`/`:` replaces the leading sigil in the buffer, preserving the tail. No Tab, no focus-switch.
- Sticky memory: `defaultCommand` and `selectedArgument` persist across sigil switches until explicitly replaced or cleared.
- Ghost completion: Silvery `TextInput`'s autocomplete provides ghost text; Space/Tab/Right-Arrow accept.
- Modifier-chord shortcuts: `Ctrl+{g,m,a,l,c}+Enter` and `Shift+Enter` as direct-verb overrides that bypass `:search`.
- `cmd-k` / `cmd-f` context-toggle while open: switches between `buffer = ":"` and `buffer = ""`, preserving the sticky other-half.
- Finish wiring the `CAPTURE` op handler so `capture_inbox` does the right thing against the configured inbox, reading the buffer as the new node's title.

### Phase 8 — cursor pre-select
Ensure `cmd-k` / `cmd-f` / `g g` / `l g` / generic `g` chords propagate the previously-focused pane's cursor into `selectedArgument` at open time. Feature-flag behind a config option for the first release in case it's confusing. (Phase 6 handles the read side; this handles the write side.)

### Phase 9 — `/` local find, bottom-left layout
Wire `/` to open the combobox dialog with `{ defaultCommand: "local_find" }`. Derive `layout: "bottom-left"` from that. Replace `apps/km-tui/src/views/FindBar.tsx` with the combobox dialog in local-find mode. In-place board highlighting reads from the combobox's argument buffer and uses `highlightMatches()`.

### Phase 10 — shelves
Delete legacy code (`Omnibox.tsx`, `ItemPicker.tsx`, `FavoritesDialog.tsx`, `FindBar.tsx`, `CommandBox.tsx`, the `dialog:omnibox` scope plumbing). Update `docs/ref/commands.md` with the new routing. Add integration tests for each chord path. Close **km-tui.palette-arrow-keys** — with the reframe, the bug class is gone because there's no dialog-scope layering for commands.

### Phase 11 (post-v1) — combobox pane ("pop it out")
Add `viewMode: "combobox"` to the board pane view-mode enum. Add the `combobox.pop_out` command: takes the current dialog's `ComboboxState`, creates a new pane with `viewMode: "combobox"` seeded from that state, and dismisses the dialog. The pane form is persistent — `COMBOBOX_CONFIRM` clears the buffers but keeps the pane open. Workspace pane manager treats it like any other pane (split, resize, focus cycling). Users get a permanent triage / navigator surface — e.g., a docked `goto` combobox for keyboard-driven browsing or a docked `move` combobox for bulk organization. Not as urgent as v1.

**Ship sequencing:**
- Phase 1+2 ship together (pure refactors with test support).
- Phase 3+4 ship together (TEA shim + opt-in predicate `when`).
- Phase 5 is the v1 ship — it introduces the combobox dialog and collapses the 5 existing dialog components onto it.
- Phase 6+7+8 ship as one release candidate (two-field model + cursor unification + pre-select are coherent as a unit).
- Phase 9 is pure win once Phase 5 is merged.
- Phase 10 is cleanup.
- Phase 11 is post-v1 — the pane form and `combobox.pop_out`.

## Out of scope

- **Autocompletion inside card titles**. That's the inline editor, not the omnibox.
- **Multi-select inside the omnibox**. Future. Today the omnibox picks one thing; multi-select for "add tag to all selected tasks" is the existing multi-selection flow before opening.
- **Graph / tree visualizations**. The omnibox is a flat result list.
- **Freeform argument strings**. All arguments come from the result list (or from the buffer for create-new commands that opt in). No shell-style "parse whitespace into positional args".

## Resolved questions

1. **Recent handling** — recents are a recency bonus on the ranker, filtered by prefix like every other result. No separate "recents list"; the empty-buffer state just happens to be sorted by recency.
2. **`create_at` with no match** — inactivatable. Users who want to create a brand-new thing with no target use `capture_inbox` (already exists as a stub in `edit.ts:255`) or future `new_project` / `new_file` commands that read the buffer as the title. This keeps `create_at` semantically clean — always operates on an existing target.
3. **Commands take arguments via the sticky `selectedArgument`** — not via typed strings. Commands whose argument is an existing node (`goto`, `move`, `add_link`, `create_at`, `reparent_picker`, …) read `ctx.currentNodeId` from the combobox's `selectedArgument`. Create-new commands read `ctx.buffer` directly. Commands decide per-command; the combobox doesn't care.
4. **Universal mode shows commands** — yes, with a tuneable type weight (start at 0.4; adjust against the canonical ranking test fixture).
5. **No separate override scope.** Tab + typing in the command field is the override; `Shift+Enter` / `Ctrl+Enter` are shortcuts. Global keybindings work with only the standard text-input-consumes-letters rule (same as any focused inline editor). No new scope.
6. **Layout — two lines.** The command field is the "title" of the action, the argument is the "object". Center modal stacks them vertically (command line, argument line, results, footer). Bottom-left local-find keeps the compact single-line form (command is locked to `local_find`, so there's nothing to edit).
7. **Dialog vs pane.** The combobox has two presentation forms. The dialog form (v1) is held in a global overlay slot; the pane form (post-v1) is held on a regular workspace pane. Both share the same `ComboboxState` shape, reducer, keybindings, and row renderer. "Pop it out" is a single action that moves state from overlay to pane.
8. **Empty command field content.** Recents (recently-run commands) plus — if the previously-focused pane had a cursor — that cursor surfaced as the "cursor target" suggestion in the argument side. "Here are the things you'd most likely want to do right now", not "here is a command reference".
9. **Tab completion — Silvery's `TextInput` autocomplete.** `vendor/silvery/packages/ag-react/src/ui/input/TextInput.tsx` already has `autocomplete: string[]` + ghost text + "accept the suggestion" semantics. Wire both fields to it. Tab priority: accept ghost if visible, else toggle focus. Space / Right-Arrow also accept when ghost visible. Only ghosted completions are ever committed — no separate "unambiguous top-match" heuristic.

## Open questions

*(none remaining — all prior questions resolved.)*

## Mapping to existing commands

The following commands already exist in `packages/km-commands/src/commands/` and will be rerouted to open the combobox dialog instead of their current bespoke dialog/picker:

| Existing command | Current behavior | After migration |
|---|---|---|
| `command_palette` (`navigation.ts:262`) | Opens `Omnibox.tsx` | Combobox dialog, `{ buffer: ":", sourceScope: "all" }` |
| `item_picker` (`tui.ts:55`) | Opens `ItemPicker.tsx` | Combobox dialog, `{ defaultCommand: "goto", focus: "argument", sourceScope: "all" }` |
| `manage_favorites` (`navigation.ts:309`) | Opens `FavoritesDialog.tsx` | Combobox dialog, `{ defaultCommand: "goto", sourceScope: "favorites" }` |
| `local_find` (`tui.ts:203`) | Opens `FindBar.tsx` | Combobox dialog, `{ defaultCommand: "local_find", sourceScope: "current-view" }` (derives bottom-left layout) |
| `search` (`tui.ts:66`) | Opens search dialog | Combobox dialog, `{ defaultCommand: "goto", focus: "argument", sourceScope: "all" }` |
| `filter` (`navigation.ts:252`) | Opens filter dialog | **NOT routed in v1** — stays on current filter dialog; follow-up bead for filter-aware layout |
| `search_replace` (`tui.ts:241`) | Opens search/replace dialog | **NOT routed in v1** — stays on current search/replace dialog; needs replace-aware layout (follow-up) |
| `goto` (`navigation.ts:209`) | Takes `ctx.targetId`, emits `CURSOR_TO` | Unchanged — combobox's cursor feeds `ctx.currentNodeId`; command still reads `targetId` when set by a chord |
| `move` (`edit.ts:194`) | Takes `ctx.targetId`, emits `REPARENT_TO` | Same pattern |
| `add` (`edit.ts:209`) | Takes `ctx.targetId`, emits `LINK_TO`/`SET_LABEL`/etc | Same pattern |
| `add_link` (`edit.ts:223`) | Emits `ADD_LINK` | Same |
| `capture_inbox` (`edit.ts:255`) | Emits `{ type: "CAPTURE", location: "inbox" }` (stub) | Finish wiring in Phase 7 |

No new command IDs are introduced for the combobox's verbs. The new work is: (a) the combobox dialog component (v1), (b) the `when` predicate field on `CommandDef`, (c) the command-tree projection adapter, (d) finishing the `CAPTURE` op handler, and (e) post-v1, `combobox.pop_out` and the `viewMode: "combobox"` pane form.

**v1 explicitly defers** the routing of `search_replace` and `filter` into the combobox. Both need dedicated layout work (`search_replace` needs a replace-input row; `filter` needs category-grouped results). They stay on their current bespoke dialogs until follow-up beads land. Every other dialog (5 of them — `Omnibox`, `ItemPicker`, `FavoritesDialog`, legacy `SearchDialog`, `CommandBox`) is routed.

## TEA alignment

The omnibox is effectively the first concrete consumer of the km/silvery TEA framework (km-tui.tea, km-silvery.tea). Every piece of this design maps to TEA machinery. Design in TEA-shape from day one; ship pre-TEA via a thin shim that is trivial to retarget when the framework migration lands.

### Four direct mappings

1. **Commands-as-nodes → projection of the TEA command tree.**
   TEA already specifies a canonical command tree where every surface projects from `app.commands.*` ([commands.md § "One Command, Every Surface"](../../vendor/internal/silvery/design/v15-tea/commands.md)). The Phase 3 "synthetic `commands/` subtree" should NOT be a parallel data structure — it should be a read-only projection:
   - **Pre-TEA**: project the current `CommandDef` registry (`@km/commands`, 172 entries) into `KNode`-shaped rows.
   - **Post-TEA**: retarget the projection at `app.commands.*`. Row renderer unchanged; only the source changes.
   The omnibox row renderer doesn't see the difference.

2. **`when`-clause DSL → `when()` + `resolveInvocation()` with signal predicates.**
   TEA already has `when(signal, bindings)` for conditional keybindings and `resolveInvocation()` that rolls availability, arg defaults, and validation into one function. Don't invent a string DSL — **use predicate functions** that take a context object and return `boolean`. These map trivially to TEA's signal accessors:
   - **Pre-TEA**: `when: (ctx: CommandContext) => ctx.viewMode === "detail"`
   - **Post-TEA**: `when: () => viewMode() === "detail"` where `viewMode` is a signal accessor.
   `resolveInvocation()`'s four-state result (`ready` / `prompt` / `unavailable` / `invalid`) is exactly what the omnibox's result list needs for greyed/active/with-ghost/error rendering. Drop the string DSL from Phase 4.

3. **Cursor unification → TEA signal defaults on command args.**
   TEA's command-def pattern uses `.parse()` with signal-valued defaults: `z.string().default(() => cursor())`. The combobox's `.cursor()` accessor returns its selected argument row. Every command that takes a `nodeId` declares it with a signal default that reads `currentCursor()` — and `currentCursor()` dispatches on focus (cards → cursored card, detail → focused block, combobox focused → selected argument row, whether dialog or pane). This is the TEA-native phrasing of "the combobox's selection IS the cursor while it has focus".
   - **Pre-TEA**: the `CommandContext` builder reads `activePane.cursor` and populates `currentNodeId` imperatively (same effect, pre-reactive).

4. **`withCombobox()` domain plugin, parametrized by `defaultCommand`.**
   Every TEA domain plugin is model + commands + keybindings composed via `pipe()` ([commands.md § "Command-Centric Design"](../../vendor/internal/silvery/design/v15-tea/commands.md)). The combobox becomes `withCombobox()`:
   ```ts
   pipe(createApp(), withBoard(), withSelection(), withCombobox(), withUndo(), ...)
   ```
   `withCombobox()` contributes:
   - The `ComboboxState` model and reducer.
   - Combobox-specific commands (`combobox.open`, `combobox.toggle_focus`, `combobox.accept_ghost`, `combobox.confirm`, `combobox.cancel`, `combobox.restore_default`, `combobox.pop_out`).
   - Keybindings scoped via `when(comboboxModel.isActive, ...)` (with text-input-conflict handling for letter keys / arrows / Enter etc).
   - The `viewMode: "combobox"` registration on `withBoard()` — but only for the pane form. The dialog form is hosted by whatever overlay system the app shell provides (pre-TEA: the global overlay slot; post-TEA: whatever `createApp()` and related plugins provide for dialogs).

   **Instance creation takes `defaultCommand` as the primary parameter**, exactly like detail panes take `rootId`. `combobox.open({ defaultCommand: "move", argumentPrefill: "+", form: "dialog" })` opens a dialog; `combobox.pop_out()` creates a pane instance from the current dialog's state.

### Interactions with other domain plugins

- **`withSelection()`** (km-tui.tea): the combobox's "selected argument row" should be represented as a `NodeSelection` in the unified `Selection = TextSelection | NodeSelection | GapSelection` type — not as a separate `selectedArgumentIndex` field. Arrowing in the combobox updates `sel` through the same dispatch path that arrowing in a cards pane uses. One selection system, one normalization pass after tree mutations, one set of commands that read it. The `selectedArgumentIndex` in `ComboboxState` becomes a derived view over `sel`, not primary state.

- **`withTree()`** (km-tui.tea): structural ops from the combobox (`move`, `create_at`, `add_link`, `reparent`) fire through the same atomic tree-op apply chain. No separate dispatch path; the combobox is a normal command producer. Undo works through the shared middleware.

- **`withDialogs()`** (km-tui.tea): the current plan lists `open_omnibox` as a dialog command under `withDialogs()`. **Partially right.** The v1 combobox IS a dialog, so hosting the combobox dialog under `withDialogs()` is fine. What the km-tui.tea plan should be updated to reflect:
  - Rename `open_omnibox` → `combobox.open` (and the command owner moves from `withDialogs()` to `withCombobox()`, but `withDialogs()` still provides the overlay slot it renders into).
  - Post-v1, `withCombobox()` also contributes a `viewMode: "combobox"` to `withBoard()` for the pop-out pane form. `withDialogs()` doesn't own the pane form at all.
  - Keep `withDialogs()` for genuinely modal affordances (toast, delete-confirm, help overlay, console palette) in addition to hosting the combobox dialog.

- **`withEditor()`** (km-tui.tea): the command and argument fields use Silvery's `TextInput` (already supports ghost-text autocomplete). Once `withEditor()` exists, both fields become consumers of `PlainText.apply()` and the ghost-text logic runs inside the shared editor model. No special case.

- **`withUndo()`** (km-tui.tea): opening/closing the combobox is not itself undoable (like opening a cards view isn't). The commands the combobox dispatches ARE undoable, through the normal middleware. `Escape → dismiss` restores focus to the previous pane but doesn't undo any work.

### What this changes in the migration phases

- **Phase 3**: retitle from "commands as nodes" to "**command-tree projection (TEA shim)**". Build the row renderer against a `KNode`-shaped projection of `@km/commands`. The projection function is the only thing that needs to change post-TEA.
- **Phase 4**: retitle from "when-clauses (string DSL)" to "**predicate-function availability**". Add an optional `when?: (ctx: CommandContext) => boolean` field to `CommandDef`. No parser needed. Maps 1:1 to TEA's signal `when()`.
- **Phase 5**: the `ComboboxDialog` component is the pre-TEA form of `withCombobox()`'s UI contribution. Every piece of state it reads is eventually a signal; every action it dispatches is eventually a TEA op. Structure the code as if TEA were in place — factory function, explicit state shape, pure dispatch — so the framework migration is a rewiring exercise.
- **Phases 6-8**: the two-field model + cursor unification + pre-select collapse into "wire the combobox's cursor accessor into `currentCursor()`, wire the command field's autocomplete into the TEA command tree". Post-TEA, most of this is one-liner plumbing; pre-TEA, it's the imperative shim.

**Bottom line: the combobox ships before TEA lands, but it's designed as a TEA plugin in advance.** When TEA migration happens, `withCombobox()` becomes the canonical consumer that proves the framework works — instead of being painted into a corner, it becomes the framework's first win.

## Relationship to other work

- **km-tui.picker-rank-subpath** — absorbed into Phase 2.
- **km-tui.palette-arrow-keys** — absorbed into Phase 5+6 (the bug class goes away once the combobox uses standard text-input scoping instead of a dialog overlay with its own scope stack).
- **km-silvery.focus** — the combobox is a single focusable component (dialog or pane), not five near-duplicate dialogs, making the focus system's job simpler.
- **km-silvery.selection-focus-plateau** — 5 fewer components to keep in sync across selection/focus state.
- **km-tui.tea** — the `ComboboxState` reducer is an obvious TEA machine candidate. **Build the design in the shape TEA wants from day one** (see § TEA alignment above). `open_omnibox` in `withDialogs()` should be renamed `combobox.open` and moved to a new `withCombobox()` plugin; `withDialogs()` still provides the overlay slot for the dialog form.
- **km-silvery.tea** — the omnibox is the first non-trivial consumer of `when()`, `resolveInvocation()`, signal-defaulted args, and the `app.commands.*` tree. Validating the omnibox validates those primitives.
- **km-tui.atomic-tree-ops** — the combobox is the main producer of structural ops that aren't "edit current node" (goto, move, add, create_at, reparent).
- **km-tui.detail-unify-real** — same shape: unify `detail` pane as a board view-mode rather than a special pane class. The omnibox unification follows the same pattern.
- **km-all.unified-selection** — the combobox's selected argument row IS a `NodeSelection`; this design assumes the unified selection type lands first (or is implemented alongside).

## References

- VS Code Quick Open (Ctrl+P) + Command Palette (Ctrl+Shift+P) — the sigil-routing precedent. VS Code uses `:` for line number, `@` for symbol, `#` for workspace symbol, `>` for command. The sigils mean different things in km but the same one-component-many-modes principle applies.
- Obsidian Quick Switcher — `file name`, `[[` for existing notes, `Ctrl+Enter` for new tab. One box, contextual sigils.
- Raycast — universal launcher with typed results and contextual actions (`Cmd+K` for action menu on selected result). The "verb override" idea comes from here.
- Emacs M-x + Helm/Ivy/Consult — one minibuffer, dynamic sources, action transformers per source. Closest spiritual ancestor.
