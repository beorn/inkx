# Omnibox Design

Unified picker + command palette + search, one component, sigil-dispatched.

> **Status (2026-04-17): v1 shipped.** The migration described by Phases 1–12 below is complete. Every legacy component named in "The problem" section (`Omnibox.tsx`, `ItemPicker.tsx`, `FavoritesDialog.tsx`), every legacy state field (`activePicker`, `showFavoritesDialog`, `favoritesSelectedKey`), every legacy op (`FAVORITES_*`), and every legacy command (`favorites.select_key`, `favorites.assign`, `favorites.clear`, `favorites.back`) has been deleted. Live code: `apps/km-tui/src/state/{omnibox,omnibox-parser,omnibox-ranker,omnibox-projection,recents-store}.ts` + `apps/km-tui/src/views/UnifiedOmnibox.tsx`. Closed beads: `km-tui.omnibox-dialog`, `km-tui.itempicker-unify`, `km-tui.omnibox-{row,ranker,query-syntax,recents,command-projection,when,default-command}`. Remaining beads: Phase 6–11 polish/feature work (`km-tui.omnibox-{cursor,interactions,pre-select,local-find,migration-cleanup,pop-out}` + extras).

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

One component: the **omnibox**. It handles every "find something, then do a thing with it" workflow. The v1 presentation form is a dialog overlay (floating, dismissable). A post-v1 affordance "pops it out" into a pane for persistent workflows.

One result list, one row renderer, one state machine, one set of keybindings.

> **Naming note:** "combobox" is a specific existing UI primitive (text input + dropdown). What we're building here is *not* a combobox — it's something more custom with sigil routing, sticky memory, default-command pivoting, pane-anchored lifecycle, and shared navigation with the rest of the board/pane system. We call it the **Omnibox**. Internally it may wrap a `Combobox` primitive (Silvery or otherwise) as one of its building blocks, but the feature, the top-level component, and the state shape are all "Omnibox". Variants are `DialogOmnibox` (center overlay), `FindOmnibox` (bottom-left inline), `PaneOmnibox` (docked, post-v1).

## The core realization — bidirectional action↔object omnibox

Every invocation of the omnibox resolves to **three parts**, and different users in different moments flow through them in different orders:

1. **A default command** — always set. `"default"` (a registered command that dispatches by argument type) is the universal fallback; verb-locking chords (`m +`, `c @`, `/`, etc.) override with a specific verb.
2. **An object** — a node from the tree. The primary interaction.
3. **A resolved action** — what runs on Enter. `defaultCommand`. Sticky: picking a command or an object persists across sigil switches.

The key insight: **the omnibox supports both directions — object→action AND action→object — in the same component**, with `defaultCommand` acting as the pivot and the buffer's leading sigil as the in-session mode switch.

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

km's chord keybindings are already verb–noun grammar, which is exactly how vim users think: `d` + motion, `y` + text-object, `c` + word. The action-first flows in the omnibox — `g @`, `m +`, `c @` — follow the same mental model: verb first, then the target is picked via search rather than via motion.

`cmd-k` (command-first) and `cmd-f` (object-first) are the modeless / discovery-friendly paths for users who think in either "I know the verb" or "I know the thing" terms. **Both mental models get their native flow**, in the same component, without forcing anyone to relearn. Power users get `Ctrl+{g,m,a,l,c}+Enter` modifier-chord shortcuts that skip the `:`-search round-trip entirely.

### How the single buffer works

the omnibox has **one working buffer**, whose leading sigil routes the search:

- `""` (empty) → universal search (everything ranked by type)
- `":xxx"` → command search, filtered by `when` against `selectedArgument`
- `"@xxx"` / `"#xxx"` / `"+xxx"` → type-scoped node search
- `"[xxx"` → node full-text (or `[<task-status>]` task filter)
- `"/xxx"` → local find (locks layout to bottom-left)

Typing a sigil character auto-replaces the current leading sigil while preserving the rest of the buffer — no Tab, no focus-switch, no separate command-field and argument-field. Sticky memory (`defaultCommand` + `selectedArgument`) survives mode switches, so bouncing between `:cr` and `@del` doesn't lose the picks from either side.

- `Enter` → runs `resolveEnter()` — `defaultCommand` against `selectedArgument`.
- `Shift+Enter` / `Ctrl+Enter` / `Ctrl+{g,m,a,l,c}+Enter` → direct-verb shortcuts that override `defaultCommand` for this single dispatch.
- `cmd-k` / `cmd-f` → mode toggle (while open — see § "Opening and toggling the omnibox").
- `Escape` → dismiss (dialog) or clear (pane).

The asymmetry matters: "two fields with Tab parity" undersells the intent. One buffer, one sigil-routed result list, sticky selections on both sides of the pivot. Most users never need the `:` override because the default command (or the chord's locked verb) already does the right thing.

### Dialog or pane — two presentation forms, one component

The component itself is a **omnibox**: single sigil-routed buffer + result list + state machine + sticky selections on both sides of the pivot. It has **two presentation forms**, both equally valid, that share the same state shape, reducer, row renderer, and keybindings:

| Form | Ownership | Lifecycle | Example |
|---|---|---|---|
| **Omnibox dialog** | Global overlay slot on the app shell | Ephemeral — opens on chord, closes on confirm/escape | Today's `cmd-k`, `g @`, `/`, `m +`, etc. |
| **omnibox pane** | Regular workspace pane, `viewMode: "omnibox"` | Persistent — lives as long as the pane exists | "Popped-out" dockable pane — a permanent triage / navigator surface |

**V1 ships only the dialog form.** It replaces the five existing dialog components (`Omnibox`, `ItemPicker`, `FavoritesDialog`, legacy `SearchDialog`, `CommandBox`) with one unified omnibox dialog. The pane form — "pop it out" — is a post-v1 affordance. Important but not as urgent.

**Dialog placement is a function of the default command:**

| defaultCommand | Dialog placement | Rationale |
|---|---|---|
| `local_find` | Bottom-left, inline status bar | Search-in-current-view feels like a status affordance, not a modal |
| everything else | Center modal | Standard omnibox UX |

Backspace through the `/` sigil in the buffer — which drops the default command back to the previous `goto` — also promotes the dialog from bottom-left back to center. The user never has to think about placement; it's derived.

**The pane form has no "placement" axis.** an omnibox pane is just a pane — the workspace manager decides where it renders (split, docked, resized) like any other pane. The "pop it out" action takes the dialog's current state and creates a pane initialized from that state, then dismisses the dialog.

### Why this unification is deep

- **Commands are already nodes.** (See [Result types](#result-types--everything-is-a-node).) The `:` sigil searches the `commands/` subtree via the same ranker and row renderer that searches every other subtree. One tree, one buffer, one ranker, one row component.
- **The command executor distinguishes subject from target.** When the omnibox dispatches a command, the executor builds `ctx` with *two* node identities: `ctx.currentNodeId` = the anchor pane's cursor (the *subject* of the action, snapshotted at open time) and `ctx.targetId` = the omnibox's `selectedArgumentId` (the *target* the user picked). Unary verbs (`goto`, `open_in_system`, `zoom_in`, `default` on a node) read `ctx.targetId` and ignore `ctx.currentNodeId`; binary verbs (`move`, `add`, `add_link`, `create_at`) read both. That's why `m +` → pick `+km` → Enter correctly moves the anchor-pane selection *into* `+km` — the subject stays the anchor pane's cursor even while the omnibox has keyboard focus.
- **`default` resolves type-dispatch inside the command system, not the reducer.** When there's no explicit `defaultCommand` and no chord-locked `defaultCommand`, the universal fallback is the `default` command, which inspects `currentNode.type` and does the right thing (command → run, else → goto). Future per-type customization (tags → filter, projects → zoom) is a one-function change in `default.execute()` — zero omnibox-UI work.
- **Global keybindings work inside the omnibox with no special scope.** There's no `dialog:omnibox` mode that shadows the app's keymap. The only keys the omnibox consumes are the ones any focused text input would consume — letters, arrows, Enter, Escape, Backspace. Everything else (`Ctrl+S`, `Cmd+Z`, `vm`, `z`/`Z`) falls through to the global layer exactly as it does when an inline card-title editor has focus in the cards view. `cmd-k` and `cmd-f` are special only in that they're bound at the global layer to also work *while* the omnibox is open, to toggle search mode.
- **The dialog form and the pane form share `OmniboxBaseState`.** The difference is only *where* the state lives — a global overlay slot vs. a pane. The reducer, keybindings, row renderer, command-tree projection, everything downstream of the state is identical. "Pop it out" is a single state transition: move `OmniboxBaseState` from overlay-slot to a new pane, dismiss the overlay.

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

The omnibox has **one working buffer** whose leading sigil determines what's being searched. One buffer, one result list, one keystroke to switch modes.

**Sigil routing.** The first character of `buffer` selects the search scope:

| Leading char | Mode | Searches |
|---|---|---|
| `:` | **Command** | Command tree, filtered by `when` against `selectedArgument` |
| `@` | **Context** | Person / assignee nodes |
| `#` | **Tag** | Tag nodes |
| `+` | **Project** | Project nodes |
| `~` | **Path / alias** | Reserved for path-like and alias lookups (not yet wired — `~` is in the FTS tokenchars set so it's ready to use) |
| `/` | **Local find** | Current view's visible tree (locks layout to bottom-left, defaultCommand to `local_find`) |
| `>` | *(reserved)* | Jump to heading in current doc |
| `?` | *(reserved)* | Help — "what does this key do?" inline docs |
| *(empty)* | **Universal** | Everything, ranked by type |

**Sigil auto-replace.** Typing a sigil character replaces the current leading sigil (if any), preserving the rest of the buffer. `@del` + `#` → `#del` (tag search for "del"). `:cr` + `@` → `@cr` (context search). Sticky memory ensures selections on both sides of the pivot persist across the switch.

**Entering command-search mode.** Three equivalent ways:
1. **Type `:` into the buffer** — the sigil auto-replace rule makes `:` the command-search prefix.
2. **Press `cmd-k`** (keyboard alias) — equivalent to setting `buffer = ":"`. Works whether the omnibox is open or closed.
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
    when?: (ctx: CommandContext) => boolean  // predicate function (see below)
    keybinding?: string        // default binding for display ("z")
    run: (ctx: CommandContext) => void | Promise<void>
  }
}
```

The `run` function lives on the in-memory node and is **not serialized**. Commands are registered at app startup into the synthetic `commands/` subtree — the `km-board/commands/*` files define and own them, and the omnibox just reads the tree.

### Availability via `when` predicate functions

Every command optionally carries a `when?: (ctx: CommandContext) => boolean` predicate. If `when(ctx)` returns false, the command is:
- **Hidden** in the omnibox result list (not matched by the ranker; `default` command falls through to the next valid candidate)
- **Inactive** as a keybinding (the key falls through to the next layer)

**No string DSL, no parser.** Just a predicate function. This maps 1:1 to TEA's signal-based `when(signal, bindings)` API — the predicate function is the signal. Existing km commands keep using their `modes?: CommandMode[]` field as the coarse gate; `when` is added only where `modes` is insufficient (view-mode guards, cursor-type guards, cross-field predicates).

**Context fields** (read-only, derived from store on every dispatch):

```ts
interface CommandContext {
  viewMode: "cards" | "columns" | "tabs" | "detail"
  hasSelection: boolean
  selectionCount: number
  isEditing: boolean
  anchorPane: Pane | null            // the omnibox's anchor (null if not invoked from omnibox)
  cursorType: KNode["type"] | null   // type of the cursored node
  activePaneType: "board" | "detail" | "empty" | "omnibox"
  // … extensible
}
```

Examples:
- `when: (ctx) => ctx.viewMode === "detail"` — only in detail pane
- `when: (ctx) => ctx.isEditing && ctx.cursorType === "p"` — only when editing a paragraph
- `when: (ctx) => !!ctx.anchorPane && ctx.cursorType !== "command"` — valid target for move/add/link commands
- `when: (ctx) => ctx.activePaneType === "board" && !ctx.isEditing` — normal board mode

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

Every omnibox instance has a **default command** (`defaultCommand` on `OmniboxBaseState`) set at creation from the opening chord. Open chords that don't commit to a verb (`cmd-k`, `cmd-f`, generic `g` chords) use `"default"` as the initial value; verb-locking chords override:

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
2. **Press `cmd-k`** (keyboard alias) — fires `OMNIBOX_SWITCH_TO_COMMANDS`, which is equivalent to setting `buffer = ":"`. Same effect, no typing.

User picks a command via the filtered list. `defaultCommand` is set. Switching back to argument search (via `cmd-f` or typing a non-`:` sigil or backspacing through the `:`) preserves `defaultCommand` — the pick is sticky.

**Enter resolution** follows the chain `defaultCommand`, so:
- If the user picked a command explicitly, it wins.
- Else the chord's default command runs.
- Else (`defaultCommand = "default"`) the `default` command handles type-dispatch internally (commands → run, else → goto).

One buffer, sticky memory, and the resolution chain — no Tab toggle, no field-focus flag, no parallel buffers.

### Global keybindings are automatic (no special scope)

There is **no `dialog:omnibox` scope** that needs special handling. When the omnibox dialog is open and focused, the only keys it consumes are the ones any focused text input would consume — letters, arrow keys, Enter, Escape, Tab, Backspace. Everything else (`Ctrl+S`, `Cmd+Z`, `z`/`Z`, `vm`, `[`/`]`) falls through to the global keybinding layer exactly as it does when an inline card-title editor has focus in the cards view.

This is not a new mechanism; it's the standard text-input-consumes-its-own-keys rule that the app already implements for inline editing. the omnibox's buffer is just a text input, and the keybinding layer already knows how to route keys around them.

**No pass-through rule, no separate scope, no "dialog overlay with exceptions".** the omnibox dialog inherits the app's keymap; its text fields hijack only what they need. Same pattern for the pane form: an omnibox pane's text fields hijack letters/arrows/Enter; everything else passes through to the pane's parent keybinding chain.

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

That's a different command: **`capture_inbox`** (already exists as a stub in `packages/km-commands/src/commands/edit.ts:255`). It creates a new node under a configured default parent (usually `+Inbox`). When invoked from the omnibox with a non-empty buffer that isn't a node selection, the command reads the buffer as the new node's title:

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

### the omnibox's cursor IS the cursor — because focus routes the cursor

This is the rule that makes both forms work identically. The app's `currentCursor()` function consults whichever surface has focus:

- Cards / columns / tabs pane focused → cursor is the pane's cursored node.
- Detail pane focused → cursor is the focused block.
- **Omnibox dialog open and focused → cursor is the dialog's selected argument row.**
- **omnibox pane focused (post-v1) → cursor is the pane's selected argument row.**

Commands read "the current cursor" and act. They don't know or care which surface supplies it:

1. **No omnibox-specific command dispatch.** Enter in the omnibox fires the same `commandExecutor` that Enter fires everywhere else. The command reads the cursor, runs, and the omnibox dialog dismisses as a side-effect (the pane form stays open and clears its buffers instead).
2. **Pre-selection ergonomic wins come for free.** When `cmd-k` opens a fresh omnibox dialog, the initial selected argument is the previously-focused pane's cursor — so the dialog opens with "cursor points to whatever you were looking at". Enter runs `goto` against it (no-op "re-focus"). Shift+Enter runs `create_at` against it (creates a child). No special-casing — just cursor propagation during dialog creation.
3. **Arrowing in the omnibox moves the cursor.** Because the selected argument row *is* the cursor while the omnibox has focus. In an omnibox pane, this turns the whole app into a keyboard-driven filtered view.
4. **Commands that don't need an argument** (`zoom_out`, `toggle_theme`, `save`) don't read the cursor. Their `execute` function ignores `ctx.currentNodeId`. Enter runs them directly regardless of the selectedArgument value.

### Command arguments — selected from the list, not typed

Commands that need an argument read it from the current cursor — which, as above, is the selectedArgument. **The user doesn't type arguments.** They search via the buffer and pick one.

For commands whose argument is an existing node (goto, move, link, create_at, add, zoom-to, open-in-pane, …) this is the default. For commands that need a *new* name (`capture_inbox`, future `new_project`, `new_file`), the title is the buffer itself — the command reads `ctx.buffer` directly instead of looking up a selected node. That's a per-command choice expressed in the command's `execute()` function. the omnibox doesn't need to know.

This gives a clean mental model: **selectedArgument is always "what node are you talking about?"** — either selected from the results, or (rarely, for create-new commands) taken as raw text.

## Opening and toggling the omnibox

Every invocation resolves to a `OmniboxBaseState` with `buffer`, `defaultCommand`, and (optionally) a pre-selected `selectedArgument`. The same keys work while the omnibox is already open — pressing them mid-session switches modes instead of re-opening.

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
| *(post-v1)* `omnibox.pop_out` | *(inherits from dialog)* | *(inherits)* | *(inherits)* |

### While open — mode-toggle keys (context-sensitive)

| Key | Action |
|---|---|
| `cmd-k` / `ctrl-k` | `OMNIBOX_SWITCH_TO_COMMANDS` — set `buffer = ":"`, **preserve `selectedArgument`**. The command list is filtered by `when` against the preserved argument. This IS the Embark/Raycast "action panel on selected candidate" pattern — no new mechanism needed. |
| `cmd-f` / `ctrl-f` | `OMNIBOX_SWITCH_TO_ARGUMENT` — set `buffer = ""`, **preserve `defaultCommand`**. Return to universal argument search, keeping any sticky command pick. |
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

**Command IDs in the tables above reference existing commands** in `packages/km-commands/src/commands/` — `move`, `add`, `add_link`, `capture_inbox`, `local_find`, `goto`, etc. the omnibox adds exactly two new commands: `default` (the type-dispatch fallback) and `omnibox.pop_out` (post-v1, transitions an open dialog into a pane).

## State machine — `OmniboxPane` + `OmniboxBaseState`

the omnibox is a **Pane**, like cards panes, detail panes, and columns panes. It's always **anchored to another pane** (just like the detail pane is anchored to a board pane). The anchor provides cursor pre-select, "current view" candidates for local find, and the return-focus target on dismiss.

```ts
interface Pane {
  id: string
  type: "cards" | "columns" | "tabs" | "detail" | "omnibox"
  rootId?: string         // cards/columns/tabs/detail
  anchorPaneId?: string   // detail + omnibox: the pane this one is tied to
}

interface OmniboxPane extends Pane {
  type: "omnibox"
  anchorPaneId: string          // source pane — never null for an omnibox
  state: OmniboxBaseState      // the 3-field base state (below)
  candidates: KNode[] | (() => KNode[])  // pre-scoped candidate set (from wrapper)
}
```

**Storage — two lifecycle slots, same pane shape:**
- **Dialog form (v1):** `workspace.overlayPane: OmniboxPane | null` (singleton). Ephemeral. Rendered above the normal pane layout. Dismisses on confirm or escape, returning focus to `anchorPaneId`.
- **Docked form (post-v1):** a regular entry in `workspace.panes`. Persistent. Participates in splits, resize, focus cycling. Cleared (buffer + sticky slots) on confirm but stays mounted.

Pop-out (post-v1) is a workspace mutation: move the `OmniboxPane` out of `overlayPane` and into `panes`, keep everything else the same.

Both forms share **one reducer, one component tree, one keybinding scope, one set of primitives**. The only differences are:
- Where the pane is stored (overlay slot vs `panes` map)
- Whether it dismisses on confirm or clears-and-stays
- Which wrapper component mounted it (which decides candidates + initial state)

**Everything else — the base state, the sigil routing, the sticky memory, the ghost completion, the row renderer, the ranker, the command projection — is shared.** Layout components reuse the same primitives heavily; a `CenterDialog` and a `BottomLeftBar` are each ~50 lines of framing around the same `ResultsList` / `BufferInput` / `Footer` sub-components.

**Single buffer, sticky other-half memory.** the omnibox has ONE working `buffer` — not two — whose leading sigil determines what's being searched:

| Leading char | Mode | Search scope |
|---|---|---|
| `:` | command | command tree, filtered by `when` against `selectedArgument` |
| `@` | context | person/assignee nodes |
| `#` | tag | tag nodes |
| `+` | project | project nodes |
| `~` | path/alias | reserved sigil — in the FTS tokenchars set, not yet wired to a mode |
| `/` | local find | current view's visible tree (locks layout to bottom-left) |
| *(none of the above)* | universal | everything — `[x]` / `[ ]` / `[]` anywhere in the buffer are parsed as task-status filters, not sigils |
| *(empty)* | universal | everything, ranked by type |

**Sigil auto-replace.** Typing a sigil character replaces the current leading sigil (if any) while keeping the search term:
- `@del` + typing `#` → `#del` (switch to tag search for "del")
- `:cr` + typing `@` → `@cr` (switch to context search)
- `@delei` + typing `:` → `:delei` (switch to command search — unlikely query but the mechanism is clean)

Sticky memory: when the buffer's sigil changes, the previously-focused half keeps its `selected*` pointer. User bounces back, selection is still there.

### Base state (normalized, stored)

```ts
interface OmniboxBaseState {
  /** Single working buffer — leading sigil determines what's being searched. */
  buffer: string

  /** The sticky default command. Always set; `"default"` is the universal initial value.
   *  Mutated by:
   *  - opening chord / initial prop ("move", "create_at", "default", …)
   *  - user arrowing over a command result while in `:`-mode
   *  When the user is NOT in `:`-mode, this stays unchanged (sticky).
   *  Note: the *effective* command at any moment is `resolveEffectiveCommand(buffer, defaultCommand)`
   *  — typing `/` derives `local_find` without touching `defaultCommand`, so backspace-through-`/`
   *  trivially restores the prior command. */
  defaultCommand: string

  /** Sticky argument — stored as an ID, not an object. The actual KNode is derived from the repo
   *  at render / command-execution time. This avoids stale object refs across reranks, deletes,
   *  and repo-query identity churn.
   *  Mutated by:
   *  - opening chord with a pre-seeded argument (cursor pre-select)
   *  - user arrowing over a non-command result while NOT in `:`-mode
   *  When the user IS in `:`-mode, this stays unchanged (sticky). */
  selectedArgumentId: string | null
}
```

**3 fields, fully normalized.** This is the canonical source of truth. The reducer only reads and writes these. The third field is an **ID**, not a `KNode` — resolving it through the repo at read-time keeps state serialisable, survives repo mutations, and eliminates object-identity bugs on rerank.

### Invocation spec (immutable per invocation)

The omnibox is opened via `openOmnibox(spec)` — a single entry point that takes an **invocation spec**, not a family of React wrapper components. The spec carries everything the session needs that isn't reducer-mutated:

```ts
interface OmniboxInvocationSpec {
  /** Initial buffer text: ":", "", "/", "@", etc. */
  initialBuffer: string

  /** Initial sticky defaultCommand: "default", "goto", "move", "local_find", ... */
  initialDefaultCommand: string

  /** Initial sticky argument (pre-select from anchor pane cursor). */
  initialArgumentId: string | null

  /** The pane the omnibox is anchored to. Used for (a) focus restore on dismiss and
   *  (b) supplying the *subject* node for binary verbs — see "Subject vs target" below. */
  anchorPaneId: string

  /** Snapshot of the anchor pane's selection/cursor at open time. Frozen — even if the
   *  anchor pane mutates during the session, the invocation's subject stays fixed. */
  subjectSelection: { cursorId: string | null; selectedIds: string[] }

  /** Pre-scoped candidate provider. The caller decides what's in scope; the omnibox never
   *  knows about "favorites" or "current-view" as string flags. */
  candidateProvider: () => KNode[]
}
```

**Subject vs target.** This is the most important contract in the design. Binary verbs (`move`, `add`, `add_link`, some `create_at` flows) need **two** node identities:

| Role | Source | `CommandContext` field |
|---|---|---|
| **Subject** (what is acted *on*) | Anchor pane cursor/selection, snapshotted at open time | `ctx.currentNodeId` / `ctx.selectedNodes` |
| **Target** (what is acted *with*) | The omnibox's `selectedArgumentId` | `ctx.targetId` |

`move` means "move the anchor-pane cursor **into** the omnibox's selection". If we conflated them, `m +` would try to move `+km` into itself. Unary verbs (`goto`, `open_in_system`, `zoom_in`, `default` on a node) read `ctx.targetId` and ignore `ctx.currentNodeId`. Commands that don't need either (`toggle_theme`) ignore both.

### What's NOT in the state

Everything else is either **derived** (a pure function of base state) or frozen in the invocation spec above:

**Derived (pure functions, recomputed on every render):**
- `mode(buffer)` — which search mode the leading sigil requests (`"command" | "context" | "tag" | "project" | "local_find" | "universal"`). Note: `[` is **not** a sigil — it's the task-filter bracket (`[x]`, `[ ]`, etc.) and the wikilink delimiter (`[[...]]`), so it can't also mean "node mode". Universal fuzzy over node names covers that use case.
- `effectiveCommand(state)` — `buffer.startsWith("/") ? "local_find" : defaultCommand`. Never stored; backspace through `/` restores the sticky command automatically.
- `Layout(state)` — which layout component to render. Derived from `effectiveCommand`/`mode`: `local_find` → bottom-left, else center. Backspacing through `/` re-derives → re-renders as `CenterDialog`.
- `results(state, candidates)` — pure function; the ranker applied to the candidates filtered by mode. Fed as a prop to the inner `SelectList`.
- `resolveEnter(state) → { cmd: effectiveCommand(state), argId: state.selectedArgumentId }` — always defined.

**Owned by child components, not the reducer:**
- Result list rendering + highlighted-row index → inner `SelectList` (Silvery, `vendor/silvery/packages/ag-react/src/ui/components/SelectList.tsx`). The reducer subscribes to `SelectList.onHighlight` to mutate its own sticky slots (`defaultCommand` in `:`-mode; `selectedArgument` in other modes).
- Ghost-text autocomplete → inner `TextInput`. Silvery already has `autocomplete: string[]` prop support.

### Layout is a component choice, not a state field

There is no `layout` field in state, no `layout` prop. The top-level `omnibox` component **derives which layout component to render** from the current state:

```tsx
function omnibox(props: OmniboxProps) {
  const [state, dispatch] = useOmniboxState(props)
  const Layout = pickLayout(state)  // pure function: state → Component
  return <Layout state={state} dispatch={dispatch} />
}

function pickLayout(state: OmniboxBaseState): ComponentType<LayoutProps> {
  if (state.buffer.startsWith("/")) return BottomLeftBar
  return CenterDialog
}
```

Layout components (`CenterDialog`, `BottomLeftBar`, `DockedPane`) each consume the same `state + dispatch` and render their own shell. They share as much or as little as they want — the result list, the row renderer, the ghost-completion logic are all extracted primitives they can reuse. Backspacing through `/` in the buffer automatically swaps from `BottomLeftBar` to `CenterDialog` because `pickLayout()` re-runs and returns a different Component.

**`ephemeral` is also not a state field.** It's a behavior of the enclosing layout component: `CenterDialog` dismisses on `CONFIRM`; `DockedPane` clears the buffer and stays mounted. The lifecycle is intrinsic to the component type, not a runtime flag.

### Three components, no per-scope wrappers

The entire omnibox is **three top-level React components**, each a thin shell around the shared primitives:

| Component | Layout | Lifecycle | Used by |
|---|---|---|---|
| `DialogOmnibox` | Center overlay | Ephemeral (dismisses on confirm/escape) | `cmd-k`, `cmd-f`, all `g`/`m`/`a`/`l`/`c` chords, `manage_favorites`, etc. |
| `FindOmnibox` | Bottom-left inline bar | Ephemeral | `/` chord; also rendered as a delegate from `DialogOmnibox` when `buffer.startsWith("/")` |
| `PaneOmnibox` | Docked pane | Persistent (clears on confirm, stays mounted) | Post-v1 pop-out |

`DialogOmnibox` delegates to `FindOmnibox` when the buffer's in find mode. Backspacing through `/` → buffer changes → delegation re-evaluates → automatically promotes back to the center dialog:

```tsx
function DialogOmnibox(props: OmniboxProps) {
  const [state, dispatch] = useOmniboxState(props)
  if (state.buffer.startsWith("/")) {
    return <FindOmnibox state={state} dispatch={dispatch} {...props} />
  }
  return <DialogLayout state={state} dispatch={dispatch} {...props} />
}
```

All three components share:
- `useOmniboxState(props)` — the hook + reducer + base state
- `OmniboxRow`, `SelectList`, `BufferInput`, `Footer` — primitive sub-components
- The ranker, the parser, the ghost-completion helper, the `highlightMatches()` helper
- The sigil-auto-replace logic, the sticky-memory rules, the modifier-chord shortcuts

What differs is just the framing shell (positioning, borders, result-list height) and the lifecycle (dismiss vs clear).

**No per-scope wrapper components.** Callers mount one of the three directly, passing the candidate set and initial state:

```tsx
// cmd-k:
openOverlay(<DialogOmnibox
  initialBuffer=":"
  candidates={allNodes}
  anchorPaneId={currentPane.id}
/>)

// cmd-f:
openOverlay(<DialogOmnibox
  initialBuffer=""
  candidates={allNodes}
  anchorPaneId={currentPane.id}
/>)

// `/`:
openOverlay(<FindOmnibox
  candidates={currentPane.visibleNodes}
  anchorPaneId={currentPane.id}
/>)

// m + chord:
openOverlay(<DialogOmnibox
  initialBuffer="+"
  initialDefaultCommand="move"
  candidates={allNodes}
  anchorPaneId={currentPane.id}
/>)

// manage_favorites chord:
openOverlay(<DialogOmnibox
  initialBuffer=""
  initialDefaultCommand="manage_favorites"
  candidates={favoritedNodes}
  anchorPaneId={currentPane.id}
/>)
```

The caller (the keybinding layer / chord dispatcher) knows which candidates apply to each invocation, passes them as a prop, and picks `DialogOmnibox` or `FindOmnibox` directly. The components themselves know nothing about "favorites" or "current view" as named concepts — they just get a list of nodes.

Adding a new scoped variant = one new case in the chord dispatcher. No new wrapper components, no reducer changes, no state-shape changes.

### Derived state (computed, not stored)

Everything else is a pure function of the base state + props (plus external data like the node repo):

```ts
// Which kind of search the buffer's leading sigil requests.
type Mode =
  | "universal"    // buffer = ""
  | "command"      // buffer starts with :
  | "context"      // @
  | "tag"          // #
  | "project"      // +
  | "node"         // [
  | "local_find"   // /

function modeOf(buffer: string): Mode { /* switch on buffer[0] */ }

// Which layout component to render, given state + props.
// Called at render time; re-runs on every state change.
function pickLayout(state: OmniboxBaseState, props: OmniboxProps): ComponentType<LayoutProps> {
  if (!props.ephemeral) return DockedPane          // post-v1 pane form
  if (state.buffer.startsWith("/")) return BottomLeftBar
  return CenterDialog
}

// Result list — runs the parser and ranker against the pre-scoped candidates prop.
// Fed to the inner SelectList as a prop on every render.
function resultsOf(state: OmniboxBaseState, candidates: KNode[], ctx: Ctx): KNode[] {
  const mode = modeOf(state.buffer)
  const parsed = parseQuery(state.buffer, ctx)
  const filtered = mode === "command"
    ? projectCommands().filter(n => commandIsAvailable(n, ctx))  // command search
    : candidates.filter(n => nodeMatchesMode(n, mode))           // content search
  return rankResults(parsed, filtered)
}

// Resolved command for Enter. Always defined.
function resolveEnter(state: OmniboxBaseState): { cmd: string; arg: KNode | null } {
  return { cmd: state.defaultCommand, arg: state.selectedArgument }
}
```

### Navigation, selection, and highlight ownership

The omnibox's result list uses the **same navigation primitives** as the board and detail panes. No bespoke key handler, no separate cursor model.

**Highlight ownership — explicit control loop:**
- The inner `SelectList` (Silvery) owns the highlighted-row index internally. This is a render-time concern that doesn't belong in `OmniboxBaseState`.
- When the highlighted row changes (via arrow keys, click, or any other means), `SelectList` fires `onHighlight(node | null)`.
- The omnibox reducer subscribes to that callback and mutates exactly one sticky slot based on the current buffer mode:
  - `mode === "command"` → reducer sets `defaultCommand = node.data.commandId`
  - `mode !== "command"` → reducer sets `selectedArgument = node`
- Switching sigils (typing `:` or pressing `cmd-k`/`cmd-f`) doesn't touch the other slot — sticky memory persists.

This is the entire control loop. There's no additional "selection mutation" action.

**Shared pane-nav primitives (work in the omnibox identically to board/detail):**
- **Arrow keys** (`↑`/`↓`) — navigate the result list. Standard for text-input-focused panes.
- **`Ctrl+N` / `Ctrl+P`** — vim-friendly aliases for arrow nav (letters go to the buffer; `Ctrl+` combos are free).
- **`j`/`k`** — navigate when the buffer has no focus (unlikely in practice — the buffer is always focused while the omnibox is open).
- **Click-select** — clicking a row sets `highlightedRowId` and fires `onHighlight` (reducer updates the sticky slot).
- **`Home`/`End`/`PgUp`/`PgDn`** — jump to first/last/up-page/down-page. Handled by `SelectList`.
- **Extend-select** (`Shift+↑`/`Shift+↓`, `Shift+click`) — builds a multi-selection. **V1 disables extend-select everywhere** (single-select only); post-v1 enables it for content mode (so you can "move all these tasks to +km" in one Enter).

**Commands that don't make sense in the omnibox get `when`-disabled:**
- Shift/reorder commands (`shift_up`, `shift_down`, `shift_left`, `shift_right`) — these mutate `parent_idx`, but the omnibox's display order is determined by the ranker, not `parent_idx`. Shift has no visible effect. `when: (ctx) => ctx.activePaneType !== "omnibox"` hides them from the result list.
- Extend-select commands — same treatment in v1 (no multi-select).

**Commands that DO work in the omnibox and are expected to:**
- All navigation (goto, zoom_in, zoom_outwards, follow_link, nav_back/forward, open_in_system/terminal).
- All mutations of the selected argument (move, reparent_picker, archive, delete_node, duplicate_node, indent_node, outdent, create_at, insert_above/below/child).
- Task/status operations (toggle_task_done, set_priority, cycle_task_status).
- Property setters (set_due_date, set_assignee, set_label).
- Clipboard (copy, cut, paste) — applied to the selected argument.
- Any view-level command that doesn't need a specific cursor (cycle_view_mode, save, undo, redo, toggle_show_hidden).

The omnibox is a full command surface, not a read-only picker. Anything a user could do to a node from the board pane they can do from the omnibox (minus shift/reorder which has no visible semantics here).

**Multiple `when`-style predicates per capability.** `when` is the mechanism; we reuse it for different capability gates by adding additional predicate fields with descriptive names. All of them are `(ctx) => boolean` — same shape, same evaluation, same API — they just answer different questions:

```ts
interface CommandDef {
  when?:          (ctx: CommandContext) => boolean  // "should this command appear at all?"
  whenMovable?:   (ctx: CommandContext) => boolean  // "can the selected argument be moved via this command?"
  whenMultiselectable?: (ctx: CommandContext) => boolean  // "can this command operate on a multi-selection?"
  whenShiftable?: (ctx: CommandContext) => boolean  // "can shift-reorder apply here?"
  // …new capability gates added on demand
}
```

For **v1**, only the base `when` is wired up — shift commands are globally disabled in the omnibox via `when: (ctx) => ctx.activePaneType !== "omnibox"`, and multi-select is globally disabled (single-select only). **Post-v1** adds `whenMovable` / `whenMultiselectable` etc. as the per-capability gates multiply (when multi-select lands for content mode). No new abstraction — just more named predicates on the same shape.

**Nothing in `OmniboxDerivedState` is stored or mutated directly.** Every keystroke recomputes `results` and `layout`. The inner `SelectList` (Silvery component at `vendor/silvery/packages/ag-react/src/ui/components/SelectList.tsx`) receives `results` as a prop and owns its own highlighted-row index — the omnibox doesn't duplicate it.

### Sticky memory via two-slot mutation

When the user arrows in the result list, the reducer updates exactly ONE of the two sticky slots:

- Arrowing in `:`-mode → `SelectList` highlights a command → reducer mutates `defaultCommand = highlightedNode.data.commandId`.
- Arrowing in any other mode → highlights a node → reducer mutates `selectedArgument = highlightedNode`.
- Switching modes (via sigil typing or `cmd-k`/`cmd-f`) preserves the other slot automatically — it's not touched unless the user arrows in that mode.

### Resolution chain for Enter

```ts
// Pure function of base state — always defined.
resolveEnter(state) → { cmd: state.defaultCommand, arg: state.selectedArgument }
```

No fallback chain. `defaultCommand` is always set; "user picked a command" is just "the reducer mutated `defaultCommand` to the user's pick". The `default` command (see below) handles type-based dispatch internally when `defaultCommand === "default"`.

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

This is the universal fallback. `defaultCommand = "default"` for cmd-k, cmd-f, and generic chord opens. Chords that lock a specific verb (`m +`, `a #`, `c @`, `l g`, `/`) override it with their own verb id. Extending per-type behavior later (tags → `filter_by`, projects → `zoom_in`) is a one-function change inside `default.execute()` — no reducer or omnibox-UI work.

Actions (dispatched by the omnibox's key handler):

```ts
type OmniboxOp =
  | { type: "OMNIBOX_INPUT"; buffer: string }       // single-buffer input; reducer handles sigil auto-replace
  | { type: "OMNIBOX_NAV_UP" | "OMNIBOX_NAV_DOWN" | "OMNIBOX_NAV_HOME" | "OMNIBOX_NAV_END" }
  | { type: "OMNIBOX_PICK" }                         // commit current selected* for the current sigil's mode
  | { type: "OMNIBOX_SWITCH_TO_COMMANDS" }           // cmd-k while open: set buffer=":" (command mode), sticky arg preserved
  | { type: "OMNIBOX_SWITCH_TO_ARGUMENT" }           // cmd-f while open: set buffer="", sticky command preserved
  | { type: "OMNIBOX_CONFIRM" }                      // enter — runs resolveEnter() via commandExecutor
  | { type: "OMNIBOX_CANCEL" }                       // escape — dismisses or clears
  | { type: "OMNIBOX_POP_OUT" }                      // post-v1: convert dialog to pane
```

Note: `OMNIBOX_INPUT` is the single-field input action. The reducer handles sigil auto-replace internally — if the new buffer's leading char is a different sigil and there's a search term after it, swap the leading char and preserve the rest.

The existing `commandExecutor` (from `@km/commands`) handles `OMNIBOX_CONFIRM` — it calls `resolveEnter()`, looks up the command by id, and runs `execute(ctx)` with **both** identities plumbed: `ctx.currentNodeId` / `ctx.selectedNodes` = the invocation spec's `subjectSelection` (the *subject*, frozen at open time from the anchor pane), and `ctx.targetId` = `selectedArgumentId` (the *target*, picked in the omnibox). Unary verbs (`goto`, `open_in_system`, `default` on a node) read `ctx.targetId` and ignore the subject. Binary verbs (`move`, `add`, `add_link`) read both.

**Invariants:**
- `highlightedRowId` is in `[0, results.length)` or `null` when `results` is empty.
- Sigil auto-replace is asymmetric: only `:` is slippery (typing any other sigil while `buffer.startsWith(":")` replaces the leading char and preserves the rest). Content sigils (`@ # + [`) are sticky literals — typing another character after `@del` appends it; typing `:` replaces only when the current leading char is `:`. Use `cmd-k` / `cmd-f` for explicit mode changes in any direction.
- Sticky memory: changing the buffer's sigil does NOT clear `defaultCommand` or `selectedArgumentId` — they only clear when the user explicitly picks a new value OR on `OMNIBOX_CANCEL`.
- `effectiveCommand` is always defined: `buffer.startsWith("/") ? "local_find" : defaultCommand`. Backspacing through `/` drops the derived override and restores `defaultCommand` with zero reducer work.
- `OMNIBOX_CONFIRM` with a resolved command that requires a target AND `selectedArgumentId == null` is a no-op + bell.
- `OMNIBOX_SWITCH_TO_COMMANDS` (cmd-k while open): set `buffer = ":"`, preserve `selectedArgumentId`. Commands list is filtered by `when` against the resolved argument node. This IS the Embark/Raycast "action panel on selected candidate" pattern.
- `OMNIBOX_SWITCH_TO_ARGUMENT` (cmd-f while open): set `buffer = ""`, preserve `defaultCommand`. Result list reverts to universal search.
- `OMNIBOX_CANCEL` on the dialog form dismisses it and restores focus to `anchorPaneId`. On the pane form it clears buffer + `selectedArgumentId` + refocuses argument mode.
- `OMNIBOX_POP_OUT` (post-v1) creates a new pane with `viewMode: "omnibox"`, copies the current base state + invocation spec into it, then dismisses the dialog.

## Migration

This is a refactor-then-feature, not a rewrite. The codebase already has most of the pieces: 172 registered commands (including `goto`, `move`, `add`, `add_link`, `local_find`, `capture_inbox`, `command_palette`, `item_picker`, `search`, `filter`, `manage_favorites`, `search_replace`), the `VerbOp` (`CURSOR_TO | REPARENT_TO | LINK_TO | CREATE_AT`) infrastructure that already dispatches to pickers, and Silvery's `TextInput` with autocomplete. The migration is mostly about collapsing 5 dialog components into one sigil-dispatched single-buffer surface.

### Phase 1 — shared row component
Create `OmniboxRow` (the node-based one). Migrate the existing `Omnibox.tsx`, `ItemPicker.tsx`, `FavoritesDialog.tsx` to use it — adapter layer converts today's result shapes to `KNode`-compatible rows. No behavior change. Catches divergence bugs.

### Phase 2 — shared ranker
Extract `rankResults(query, KNode[])` with the ranking rules above. Add `omnibox-ranking.test.ts` table. Migrate `ItemPicker.filterOptions` and `Omnibox`'s scorer to use it. Fixes **km-tui.picker-rank-subpath**. Also extract `highlightMatches(text, query)` as a shared helper used by Phase 9's local-find view.

### Phase 3 — command-tree projection (TEA shim)
Build a read-only projection function that returns the `@km/commands` registry as `KNode`-shaped rows. No schema change to `CommandDef` — the projection is pure adapter. The synthetic `commands/` view is computed on demand. When TEA lands, this projection retargets at `app.commands.*` without touching the row renderer. Tests: every registered `CommandDef` appears as a `KNode` with `type: "command"` and round-trips through the row renderer.

### Phase 4 — predicate-function availability
Add an optional `when?: (ctx: CommandContext) => boolean` field to `CommandDef`. No string DSL, no parser — just a predicate function. Maps 1:1 to TEA's signal-based `when()`. Start with **no migration of existing commands** — leave `modes?: CommandMode[]` as the current gating mechanism. Add `when` only where the existing `modes` field is insufficient (e.g., view-mode guards, cursor-type guards, cross-field predicates). Phase out `modes` gradually in a later pass. Tests: a command with `when: (ctx) => ctx.viewMode === "detail"` appears in the omnibox results only when a detail pane is active.

### Phase 5 — unified omnibox dialog (single buffer)
Build the `omnibox` pane + reducer. It lives in `workspace.overlayPane: OmniboxPane | null` (singleton, dialog form) with the 3-field `OmniboxBaseState` (`buffer`, `defaultCommand`, `selectedArgument`) as the canonical state; layout is derived from the buffer, candidates come from the wrapper. Component: one Silvery `TextInput` with `autocomplete` wired to sigil-routed results, a `SelectList` below, a footer showing the resolved action + sticky selections. Opened via `cmd-k` / `cmd-f` / chord. Add the `default` command to `@km/commands`. Route `command_palette`, `item_picker`, `search`, `manage_favorites` through wrapper components (`CommandPaletteOmnibox`, `FavoritesOmnibox`, …) that pre-scope `candidates`. Legacy `search_replace` and `filter` stay on their current dialogs (deferred). Old dialog components become thin delegators that call `openOmnibox(...)`. **This is the v1 ship** — it replaces five dialogs with one.

### Phase 6 — subject/target plumbing in the command executor
Teach the command executor to build `CommandContext` from the invocation spec when dispatched via the omnibox: `ctx.currentNodeId` and `ctx.selectedNodes` come from `subjectSelection` (the frozen anchor-pane snapshot), and `ctx.targetId` is resolved from `selectedArgumentId` at confirm time. **Do NOT globally redefine `currentCursor()` to return the omnibox selection** — that breaks binary verbs (`move`, `add`, `add_link`) which need both identities. Remove any `dialog:omnibox` scope guards in `when.ts`. Tests: (a) `cmd-k :move` → pick `+km` → Enter moves the anchor-pane cursor into `+km` (subject + target); (b) `cmd-f @del` → pick `@delei` → Enter runs `default` (goto) on `@delei` (target only, subject ignored); (c) unary and binary verbs coexist.

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
Wire `/` to open the omnibox dialog with `{ defaultCommand: "local_find" }`. Derive `layout: "bottom-left"` from that. Replace `apps/km-tui/src/views/FindBar.tsx` with the omnibox dialog in local-find mode. In-place board highlighting reads from the omnibox's argument buffer and uses `highlightMatches()`.

### Phase 10 — shelves
Delete legacy code (`Omnibox.tsx`, `ItemPicker.tsx`, `FavoritesDialog.tsx`, `FindBar.tsx`, `CommandBox.tsx`, the `dialog:omnibox` scope plumbing). Update `docs/ref/commands.md` with the new routing. Add integration tests for each chord path. Close **km-tui.palette-arrow-keys** — with the reframe, the bug class is gone because there's no dialog-scope layering for commands.

### Phase 11 (post-v1) — omnibox pane ("pop it out")
Add `viewMode: "omnibox"` to the board pane view-mode enum. Add the `omnibox.pop_out` command: takes the current dialog's `OmniboxBaseState`, creates a new pane with `viewMode: "omnibox"` seeded from that state, and dismisses the dialog. The pane form is persistent — `OMNIBOX_CONFIRM` clears the buffers but keeps the pane open. Workspace pane manager treats it like any other pane (split, resize, focus cycling). Users get a permanent triage / navigator surface — e.g., a docked `goto` omnibox for keyboard-driven browsing or a docked `move` omnibox for bulk organization. Not as urgent as v1.

**Ship sequencing:**
- Phase 1+2 ship together (pure refactors with test support).
- Phase 3+4 ship together (TEA shim + opt-in predicate `when`).
- Phase 5 is the v1 ship — it introduces the omnibox dialog and collapses the 5 existing dialog components onto it.
- Phase 6+7+8 ship as one release candidate (sigil-routed buffer + cursor unification + pre-select are coherent as a unit).
- Phase 9 is pure win once Phase 5 is merged.
- Phase 10 is cleanup.
- Phase 11 is post-v1 — the pane form and `omnibox.pop_out`.

## Out of scope

- **Autocompletion inside card titles**. That's the inline editor, not the omnibox.
- **Multi-select inside the omnibox**. Future. Today the omnibox picks one thing; multi-select for "add tag to all selected tasks" is the existing multi-selection flow before opening.
- **Graph / tree visualizations**. The omnibox is a flat result list.
- **Freeform argument strings**. All arguments come from the result list (or from the buffer for create-new commands that opt in). No shell-style "parse whitespace into positional args".

## Resolved questions

1. **Recent handling** — recents are a recency bonus on the ranker, filtered by prefix like every other result. No separate "recents list"; the empty-buffer state just happens to be sorted by recency.
2. **`create_at` with no match** — inactivatable. Users who want to create a brand-new thing with no target use `capture_inbox` (already exists as a stub in `edit.ts:255`) or future `new_project` / `new_file` commands that read the buffer as the title. This keeps `create_at` semantically clean — always operates on an existing target.
3. **Commands take arguments via the sticky `selectedArgument`** — not via typed strings. Commands whose argument is an existing node (`goto`, `move`, `add_link`, `create_at`, `reparent_picker`, …) read `ctx.currentNodeId` from the omnibox's `selectedArgument`. Create-new commands read `ctx.buffer` directly. Commands decide per-command; the omnibox doesn't care.
4. **Universal mode shows commands** — yes, with a tuneable type weight (start at 0.4; adjust against the canonical ranking test fixture).
5. **No separate override scope.** typing ":" (or pressing cmd-k) is the override; `Shift+Enter` / `Ctrl+Enter` are shortcuts. Global keybindings work with only the standard text-input-consumes-letters rule (same as any focused inline editor). No new scope.
6. **Layout — two lines.** The command chip (derived from defaultCommand) is the "title" of the action; the buffer below it searches for the "object". Center modal stacks them vertically (command line, argument line, results, footer). Bottom-left local-find keeps the compact single-line form (command is locked to `local_find`, so there's nothing to edit).
7. **Dialog vs pane.** the omnibox has two presentation forms. The dialog form (v1) is held in a global overlay slot; the pane form (post-v1) is held on a regular workspace pane. Both share the same `OmniboxBaseState` shape, reducer, keybindings, and row renderer. "Pop it out" is a single action that moves state from overlay to pane.
8. **Empty buffer content.** Recents (recently-run commands) plus — if the previously-focused pane had a cursor — that cursor surfaced as the "cursor target" suggestion in the argument side. "Here are the things you'd most likely want to do right now", not "here is a command reference".
9. **Tab completion — Silvery's `TextInput` autocomplete.** `vendor/silvery/packages/ag-react/src/ui/input/TextInput.tsx` already has `autocomplete: string[]` + ghost text + "accept the suggestion" semantics. Wire both fields to it. Tab priority: accept ghost if visible, else toggle focus. Space / Right-Arrow also accept when ghost visible. Only ghosted completions are ever committed — no separate "unambiguous top-match" heuristic.

## Open questions

*(none remaining — all prior questions resolved.)*

## Mapping to existing commands

The following commands already exist in `packages/km-commands/src/commands/` and will be rerouted to open the omnibox dialog instead of their current bespoke dialog/picker:

| Existing command | Current behavior | After migration |
|---|---|---|
| `command_palette` (`navigation.ts:262`) | Opens `Omnibox.tsx` | `CommandPaletteOmnibox` wrapper — `{ initialBuffer: ":", candidates: allNodes }` |
| `item_picker` (`tui.ts:55`) | Opens `ItemPicker.tsx` | `ItemPickerOmnibox` wrapper — `{ initialDefaultCommand: "goto", candidates: allNodes }` |
| `manage_favorites` (`navigation.ts:309`) | Opens `FavoritesDialog.tsx` | `FavoritesOmnibox` wrapper — `{ initialDefaultCommand: "goto", candidates: favorites }` |
| `local_find` (`tui.ts:203`) | Opens `FindBar.tsx` | `LocalFindOmnibox` wrapper — `{ initialBuffer: "/", candidates: currentViewNodes }` (layout derives to bottom-left from the `/` sigil) |
| `search` (`tui.ts:66`) | Opens search dialog | `GotoOmnibox` wrapper — `{ initialDefaultCommand: "goto", candidates: allNodes }` |
| `filter` (`navigation.ts:252`) | Opens filter dialog | **NOT routed in v1** — stays on current filter dialog; follow-up bead for filter-aware layout |
| `search_replace` (`tui.ts:241`) | Opens search/replace dialog | **NOT routed in v1** — stays on current search/replace dialog; needs replace-aware layout (follow-up) |
| `goto` (`navigation.ts:209`) | Takes `ctx.targetId`, emits `CURSOR_TO` | Unchanged — omnibox's cursor feeds `ctx.currentNodeId`; command still reads `targetId` when set by a chord |
| `move` (`edit.ts:194`) | Takes `ctx.targetId`, emits `REPARENT_TO` | Same pattern |
| `add` (`edit.ts:209`) | Takes `ctx.targetId`, emits `LINK_TO`/`SET_LABEL`/etc | Same pattern |
| `add_link` (`edit.ts:223`) | Emits `ADD_LINK` | Same |
| `capture_inbox` (`edit.ts:255`) | Emits `{ type: "CAPTURE", location: "inbox" }` (stub) | Finish wiring in Phase 7 |

No new command IDs are introduced for the omnibox's verbs. The new work is: (a) the omnibox dialog component (v1), (b) the `when` predicate field on `CommandDef`, (c) the command-tree projection adapter, (d) finishing the `CAPTURE` op handler, and (e) post-v1, `omnibox.pop_out` and the `viewMode: "omnibox"` pane form.

**v1 explicitly defers** the routing of `search_replace` and `filter` into the omnibox. Both need dedicated layout work (`search_replace` needs a replace-input row; `filter` needs category-grouped results). They stay on their current bespoke dialogs until follow-up beads land. Every other dialog (5 of them — `Omnibox`, `ItemPicker`, `FavoritesDialog`, legacy `SearchDialog`, `CommandBox`) is routed.

## TEA alignment

The omnibox is effectively the first concrete consumer of the km/silvery TEA framework (km-tui.tea, km-silvery.tea). Every piece of this design maps to TEA machinery. Design in TEA-shape from day one; ship pre-TEA via a thin shim that is trivial to retarget when the framework migration lands.

### Four direct mappings

1. **Commands-as-nodes → projection of the TEA command tree.**
   TEA already specifies a canonical command tree where every surface projects from `app.commands.*` ([commands.md § "One Command, Every Surface"](../../hub/silvery/design/v15-tea/commands.md)). The Phase 3 "synthetic `commands/` subtree" should NOT be a parallel data structure — it should be a read-only projection:
   - **Pre-TEA**: project the current `CommandDef` registry (`@km/commands`, 172 entries) into `KNode`-shaped rows.
   - **Post-TEA**: retarget the projection at `app.commands.*`. Row renderer unchanged; only the source changes.
   The omnibox row renderer doesn't see the difference.

2. **`when`-clause DSL → `when()` + `resolveInvocation()` with signal predicates.**
   TEA already has `when(signal, bindings)` for conditional keybindings and `resolveInvocation()` that rolls availability, arg defaults, and validation into one function. Don't invent a string DSL — **use predicate functions** that take a context object and return `boolean`. These map trivially to TEA's signal accessors:
   - **Pre-TEA**: `when: (ctx: CommandContext) => ctx.viewMode === "detail"`
   - **Post-TEA**: `when: () => viewMode() === "detail"` where `viewMode` is a signal accessor.
   `resolveInvocation()`'s four-state result (`ready` / `prompt` / `unavailable` / `invalid`) is exactly what the omnibox's result list needs for greyed/active/with-ghost/error rendering. Drop the string DSL from Phase 4.

3. **Cursor unification → TEA signal defaults on command args.**
   TEA's command-def pattern uses `.parse()` with signal-valued defaults: `z.string().default(() => cursor())`. the omnibox's `.cursor()` accessor returns its selected argument row. Every command that takes a `nodeId` declares it with a signal default that reads `currentCursor()` — and `currentCursor()` dispatches on focus (cards → cursored card, detail → focused block, omnibox focused → selected argument row, whether dialog or pane). This is the TEA-native phrasing of "the omnibox's selection IS the cursor while it has focus".
   - **Pre-TEA**: the `CommandContext` builder reads `activePane.cursor` and populates `currentNodeId` imperatively (same effect, pre-reactive).

4. **`withOmnibox()` domain plugin, parametrized by `defaultCommand`.**
   Every TEA domain plugin is model + commands + keybindings composed via `pipe()` ([commands.md § "Command-Centric Design"](../../hub/silvery/design/v15-tea/commands.md)). the omnibox becomes `withOmnibox()`:
   ```ts
   pipe(createApp(), withBoard(), withSelection(), withOmnibox(), withUndo(), ...)
   ```
   `withOmnibox()` contributes:
   - The `OmniboxBaseState` model and reducer.
   - omnibox-specific commands (`omnibox.open`, `omnibox.toggle_focus`, `omnibox.accept_ghost`, `omnibox.confirm`, `omnibox.cancel`, `omnibox.restore_default`, `omnibox.pop_out`).
   - Keybindings scoped via `when(omniboxModel.isActive, ...)` (with text-input-conflict handling for letter keys / arrows / Enter etc).
   - The `viewMode: "omnibox"` registration on `withBoard()` — but only for the pane form. The dialog form is hosted by whatever overlay system the app shell provides (pre-TEA: the global overlay slot; post-TEA: whatever `createApp()` and related plugins provide for dialogs).

   **Instance creation takes `defaultCommand` as the primary parameter**, exactly like detail panes take `rootId`. `omnibox.open({ defaultCommand: "move", argumentPrefill: "+", form: "dialog" })` opens a dialog; `omnibox.pop_out()` creates a pane instance from the current dialog's state.

### Interactions with other domain plugins

- **`withSelection()`** (km-tui.tea): the omnibox's "selected argument row" should be represented as a `NodeSelection` in the unified `Selection = TextSelection | NodeSelection | GapSelection` type — not as a separate `selectedArgument` field. Arrowing in the omnibox updates `sel` through the same dispatch path that arrowing in a cards pane uses. One selection system, one normalization pass after tree mutations, one set of commands that read it. The `selectedArgument` in `OmniboxBaseState` becomes a derived view over `sel`, not primary state.

- **`withTree()`** (km-tui.tea): structural ops from the omnibox (`move`, `create_at`, `add_link`, `reparent`) fire through the same atomic tree-op apply chain. No separate dispatch path; the omnibox is a normal command producer. Undo works through the shared middleware.

- **`withDialogs()`** (km-tui.tea): the current plan lists `open_omnibox` as a dialog command under `withDialogs()`. **Partially right.** The v1 omnibox IS a dialog, so hosting the omnibox dialog under `withDialogs()` is fine. What the km-tui.tea plan should be updated to reflect:
  - Rename `open_omnibox` → `omnibox.open` (and the command owner moves from `withDialogs()` to `withOmnibox()`, but `withDialogs()` still provides the overlay slot it renders into).
  - Post-v1, `withOmnibox()` also contributes a `viewMode: "omnibox"` to `withBoard()` for the pop-out pane form. `withDialogs()` doesn't own the pane form at all.
  - Keep `withDialogs()` for genuinely modal affordances (toast, delete-confirm, help overlay, console palette) in addition to hosting the omnibox dialog.

- **`withEditor()`** (km-tui.tea): the buffer uses Silvery's `TextInput` (already supports ghost-text autocomplete). Once `withEditor()` exists, both fields become consumers of `PlainText.apply()` and the ghost-text logic runs inside the shared editor model. No special case.

- **`withUndo()`** (km-tui.tea): opening/closing the omnibox is not itself undoable (like opening a cards view isn't). The commands the omnibox dispatches ARE undoable, through the normal middleware. `Escape → dismiss` restores focus to the previous pane but doesn't undo any work.

### What this changes in the migration phases

- **Phase 3**: retitle from "commands as nodes" to "**command-tree projection (TEA shim)**". Build the row renderer against a `KNode`-shaped projection of `@km/commands`. The projection function is the only thing that needs to change post-TEA.
- **Phase 4**: retitle from "when-clauses (string DSL)" to "**predicate-function availability**". Add an optional `when?: (ctx: CommandContext) => boolean` field to `CommandDef`. No parser needed. Maps 1:1 to TEA's signal `when()`.
- **Phase 5**: the `OmniboxDialog` component is the pre-TEA form of `withOmnibox()`'s UI contribution. Every piece of state it reads is eventually a signal; every action it dispatches is eventually a TEA op. Structure the code as if TEA were in place — factory function, explicit state shape, pure dispatch — so the framework migration is a rewiring exercise.
- **Phases 6-8**: the sigil-routed buffer + cursor unification + pre-select collapse into "wire the omnibox's cursor accessor into `currentCursor()`, wire the buffer autocomplete into the TEA command tree". Post-TEA, most of this is one-liner plumbing; pre-TEA, it's the imperative shim.

**Bottom line: the omnibox ships before TEA lands, but it's designed as a TEA plugin in advance.** When TEA migration happens, `withOmnibox()` becomes the canonical consumer that proves the framework works — instead of being painted into a corner, it becomes the framework's first win.

## Relationship to other work

- **km-tui.picker-rank-subpath** — absorbed into Phase 2.
- **km-tui.palette-arrow-keys** — absorbed into Phase 5+6 (the bug class goes away once the omnibox uses standard text-input scoping instead of a dialog overlay with its own scope stack).
- **km-silvery.focus** — the omnibox is a single focusable component (dialog or pane), not five near-duplicate dialogs, making the focus system's job simpler.
- **km-silvery.selection-focus-plateau** — 5 fewer components to keep in sync across selection/focus state.
- **km-tui.tea** — the `OmniboxBaseState` reducer is an obvious TEA machine candidate. **Build the design in the shape TEA wants from day one** (see § TEA alignment above). `open_omnibox` in `withDialogs()` should be renamed `omnibox.open` and moved to a new `withOmnibox()` plugin; `withDialogs()` still provides the overlay slot for the dialog form.
- **km-silvery.tea** — the omnibox is the first non-trivial consumer of `when()`, `resolveInvocation()`, signal-defaulted args, and the `app.commands.*` tree. Validating the omnibox validates those primitives.
- **km-tui.atomic-tree-ops** — the omnibox is the main producer of structural ops that aren't "edit current node" (goto, move, add, create_at, reparent).
- **km-tui.detail-unify-real** — same shape: unify `detail` pane as a board view-mode rather than a special pane class. The omnibox unification follows the same pattern.
- **km-all.unified-selection** — the omnibox's selected argument row IS a `NodeSelection`; this design assumes the unified selection type lands first (or is implemented alongside).

## References

- VS Code Quick Open (Ctrl+P) + Command Palette (Ctrl+Shift+P) — the sigil-routing precedent. VS Code uses `:` for line number, `@` for symbol, `#` for workspace symbol, `>` for command. The sigils mean different things in km but the same one-component-many-modes principle applies.
- Obsidian Quick Switcher — `file name`, `[[` for existing notes, `Ctrl+Enter` for new tab. One box, contextual sigils.
- Raycast — universal launcher with typed results and contextual actions (`Cmd+K` for action menu on selected result). The "verb override" idea comes from here.
- Emacs M-x + Helm/Ivy/Consult — one minibuffer, dynamic sources, action transformers per source. Closest spiritual ancestor.
