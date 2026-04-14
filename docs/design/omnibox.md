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

One modal: the *omnibox*. It handles every "find something, then do a thing with it" workflow.

One result list, one row renderer, one keybinding scope (`dialog:omnibox`), one state machine.

## The core realization — the combobox is two searchable fields

Every invocation of the omnibox resolves to **exactly two things**:

1. **A command** — the verb to run (goto, move, add, link, create-in, run, find, …)
2. **An argument** — a node the command operates on (or nothing, for zero-arg commands)

Both are **searchable**. Both have a **result list**. Both are **pre-populated differently depending on how the omnibox was opened**. Neither is ever typed as a freeform argument string — the argument is always selected from the node tree.

| Opened via | Command field | Argument field | Focus starts in |
|---|---|---|---|
| `cmd-k` | *(auto — default is `goto`)* | Current board cursor | Argument |
| `g @` chord | `goto` (locked) | `@` sigil prefilled | Argument |
| `m +` chord | `move` (locked) | `+` sigil prefilled | Argument |
| `a #` chord | `add` (locked) | `#` sigil prefilled | Argument |
| `l g` chord | `link` (locked) | Current cursor prefilled | Argument |
| `c @` chord | `create-in` (locked) | `@` sigil prefilled | Argument |
| `:` from cmd-k | Auto-focus command field | Empty | Command |
| `/` from cmd-k | `find` (locked) | Empty | Argument (bottom-left placement) |

**Tab** swaps focus between the command field and the argument field. The user can always re-pick either half of the tuple. `Ctrl+g/m/a/l + Enter` becomes a shortcut for "tab to command, type the command, tab back, confirm".

This replaces the old "default verb + modifier-key override" model with something simpler: **two searchable fields, always visible, always editable**. The verb is not an invisible attribute of the session — it's a visible chip the user can click, tab to, or type over.

### Why this unification is deep

- **Commands are already nodes.** (See [Result types](#result-types--everything-is-a-node).) So the command field is a node search over the `commands/` subtree, and the argument field is a node search over the rest of the tree. Two fields, one tree, one ranker.
- **The omnibox is a board view, not a dialog.** This is the biggest reframe. The omnibox is a **new view mode** for panes — `viewMode: "search"` (alongside the existing `cards | columns | tabs | detail`). It's not an overlay, not a modal, not a separate component hierarchy — it's a pane that happens to render a filtered, ranked, live-updated list of nodes with two linked query fields. Every board mechanism — cursor, selection, keybindings, the focus manager, pane layout — applies unchanged.
- **The pane's cursor IS the selected argument row.** Every pane has a cursor; in a search-view pane, the cursor is whichever row is currently selected in the argument-field result list. Commands don't know or care — they read the active pane's cursor and act. `goto`, `move`, `create-in` don't ask "am I in a dialog?" — they read the current cursor and fire.
- **Global board keybindings work inside the omnibox, because the omnibox IS a board view.** There's no `dialog:omnibox` scope to shadow anything — the omnibox just inherits the board's keybinding layer. Text-input fields (command, argument) hijack letter keys while they have focus, but everything else falls through naturally: `Ctrl+S` saves, `Cmd+Z` undoes, `vm` cycles view modes, `z`/`Z` zoom, all exactly as they do in the cards view.
- **A future omnibox-as-pane** (docked persistent view) falls out of this for free. It's the same view mode — just with a different pane lifecycle. A centered modal is an *ephemeral overlay pane with `viewMode: "search"`*; a docked persistent omnibox is a *regular workspace pane with `viewMode: "search"`*. Same renderer, same state shape, same keybindings.

**Scope tree:**

| View mode | Renders | Cursor is | Example use |
|---|---|---|---|
| `cards` | Kanban columns, cards, subitems | Cursored card/subitem | Default work view |
| `columns` | Outline list | Cursored row | Deep outline mode |
| `tabs` | Tabbed per-column outline | Cursored row | Single-column focus |
| `detail` | Pretext rendering of one node | Focused block | Reading/editing a single doc |
| **`search`** | **Two query fields + ranked result list** | **Selected argument row** | **Omnibox, goto, command palette, all pickers, `/` local find** |

Placement (center modal, bottom-left mini-bar, docked pane) is a *layout* of the search view, not a separate view mode. The search view always has the same state shape; the layout just decides where the pane renders and whether it's ephemeral or persistent.

## Mockups

All mockups below are the **same component** with different `placement` and initial field state. The layout is a presentation prop; the search, ranker, row renderer, and state machine are identical. These are semantic wireframes — not box-drawn ASCII — each element is a line annotated with what it is. `▸` prefix marks the currently-focused field; `←` marks the selected row in the result list.

### 1. `cmd-k` — Universal, cursor pre-selected

Empty argument buffer. The board cursor node is the top result (and therefore the argument). Enter runs the default command (`goto`) against the cursor = "re-focus". Shift+Enter runs `create-in` against the cursor = "create child under current node".

```
placement:    center
state:        { command: "goto", arg: "", focus: arg }

  command     :   [ goto ]                                              (locked/default — tab to edit)
  argument    : ▸ _                                                     (empty — argument slot has focus)

  results     : @ omnibox.md                +km/docs/design         ←   (cursor node = selected arg)
              : + km-tui.omnibox-unified    beads              P0
              : @ delei                     context
              : # urgent                    47 uses
              : board.tsx                   +km/apps/km-tui/src

  footer      : ↵ goto   ⇧↵ create-in   ⇥ edit command   esc
```

### 2. `cmd-k`, then user typed `@del` — argument search with match highlighting

Filtered to context nodes starting with "del". Match characters are **highlighted inside each row** (same treatment as `/` local find — highlights live in the row renderer, not a separate overlay). Ranker puts `@delei` first, deep subpath last.

```
placement:    center
state:        { command: "goto", arg: "@del", focus: arg }

  command     :   [ goto ]
  argument    : ▸ @del_

  results     : @ [del]ei                                context       ←
              : @ [del]oitte                             work/context
              : @ @office/Finance/Accounts/[Del]ei/SPD   deep match

  footer      : ↵ goto   ⇧↵ create-in   ⇥ edit command   esc
```

Square brackets in the mockup stand in for the highlighted match spans.

### 3. Override via Tab — user tabbed to the command field

From mockup 2, user presses Tab. Focus moves to the command field; results now search commands. User types `mo` → `move` bubbles to the top. Argument field stays locked at `@del` with its selected result. Enter now runs `move` against `@delei`.

```
placement:    center
state:        { command: "mo", arg: "@del", focus: command }

  command     : ▸ mo_
  argument    :   @del                                  @delei  ← (selected arg stays)

  results     : : [mo]ve                  m (chord)        ←  (command results — filtered by "mo")
              : : [mo]ve-up                shift-k
              : : toggle-[mo]noscreen      (no binding)

  footer      : ↵ move @delei   ⇥ edit argument   esc
```

The footer re-renders to show the resolved action: **"↵ move @delei"**. Tab again returns focus to the argument field.

### 4. `create-in` has no matching argument — inactivatable

User opened via `c +` chord. Typed `+newproject`. No match. `create-in` requires an existing target node, so it's **not activatable** — Enter bells, the footer greys the action out, the user can Tab to pick a different command (or type a new search).

```
placement:    center
state:        { command: "create-in", arg: "+newproject", focus: arg }

  command     :   [ create-in ]
  argument    : ▸ +newproject_

  results     :   (no matches)

  footer      : ↵ create-in (disabled — no target)   ⇥ edit command   esc
```

Creating a new `+newproject` node is a different command (e.g. `:new-project <title>`) — not the default action of `create-in`. This keeps `create-in` semantically clean: it always takes a target.

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

### Two fields

The omnibox has two text fields — `commandBuffer` and `argumentBuffer` — and a single `focus: "command" | "argument"` flag. Both fields drive node searches (against `commands/` and everything else, respectively). Only the focused field's search populates the result list. The unfocused field is rendered as a chip/label showing its current state.

**Sigil routing inside the argument field.** The first character of `argumentBuffer` selects the search scope within the tree. This is identical to the old "single buffer" design — the change is that sigils now route within the argument field, not across the whole buffer.

| Argument first-char | Scope | Matches |
|---|---|---|
| `@` | **Context** | Person / assignee nodes |
| `#` | **Tag** | Tag nodes |
| `+` | **Project** | Project nodes |
| `[` | **Node** | Any node by title/content (full-text) |
| `/` | **Local find** | Same component, but forces `placement="bottom-left"` and locks command to `find` |
| `>` | *(reserved)* | Jump to heading in current doc |
| `?` | *(reserved)* | Help — "what does this key do?" inline docs |
| *(empty)* | **Universal** | Everything, ranked by type |

Backspace through the sigil → empty → mode becomes Universal. Type a different sigil → mode switches. No separate components, no re-open.

**Entering the command field.** Three ways:
1. **`Tab`** — toggle focus between the two fields. Preserves both buffers.
2. **`:` at empty argument buffer** — shortcut. Pops focus to the command field, clears the `:` so the command field starts empty.
3. **Opening via `cmd-k` with no chord** — focus defaults to argument, but the user can immediately Tab or `:`-shortcut.

**Empty-buffer behavior.** When either field is empty, its result list shows **recents filtered by prefix** (prefix being whatever has been typed so far, even if empty):

- Empty argument field → recent goto targets (and the current board cursor, pre-selected first).
- Empty command field → recently-run commands.
- Partially-typed argument `@del` → recents that match `@del`, then other matches.

Recents are just "nodes ordered by `lastVisitedAt` desc"; the ranker combines recency with match score. "Filtered by prefix like everything else in the list" means the ranker applies the same match rules — recents are not a privileged separate list.

**`/` local find is the same component, different placement.** `/` sets `placement="bottom-left"` and locks the command field to `find`. The argument field owns the query. The result list becomes in-place match highlighting on the board instead of a row list. Backspace through `/` → promotes back to `placement="center"`, command returns to `goto` (or whatever the chord set).

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

### Default command, override via Tab, restore via Escape

Every search pane has a **permanent default command** (`defaultCommand` on `SearchPaneState`) set at creation from the opening chord:

| Open via | defaultCommand |
|---|---|
| `cmd-k` | `goto` |
| `g` chord | `goto` |
| `m` chord | `move` |
| `a` chord | `add` |
| `l` chord | `add_link` |
| `c` chord | `create_at` |
| `/` (direct) | `local_find` |

**Override = Tab to the command field and type.** There are no `Ctrl+g/m/a/l` chord overrides — the command field *is* the override surface. It's always visible as the top line of the modal (mockups 1, 2, 4) and becomes a text input the moment you Tab to it or press `:` on an empty argument field. The `commandBuffer` diverges from `defaultCommand` while the user edits. Once the user picks a different command, Tab back to the argument field and confirm.

**Escape on the command field restores the default.** The first Escape — with `commandBuffer !== defaultCommand` — resets `commandBuffer = defaultCommand` and switches focus back to the argument field. Only a second Escape (or Escape with the command field already matching the default) dismisses the pane. This gives a painless "I meant to search, not override" undo.

This is strictly simpler than the old "default verb + modifier override" model: the user doesn't have to learn a second key system. Tab is the universal "edit the other half of the tuple" affordance; Escape is the universal "undo that override" affordance.

### Global keybindings are automatic (no special scope)

Because the omnibox is a board view — not a dialog — there is **no `dialog:omnibox` scope** that needs special handling. The keybinding layer sees a pane in `viewMode: "search"` exactly like it sees a pane in `viewMode: "cards"`: as a regular pane. Every board keybinding (`Ctrl+S` save, `Cmd+Z` undo, `z`/`Z` zoom, `vm` cycle, …) applies without change.

The only thing that *does* change when focus is in a text field (command or argument) is that single-character letter keys and arrow keys are consumed by the text input rather than routed to the command dispatcher. This is standard text-input behavior — it's how the current inline editor and inline title renamer already work inside `viewMode: "cards"`. The board keybinding layer already handles it.

In short: **there is no pass-through rule, because there is no separate scope**. The omnibox just inherits the board's keymap, and text fields hijack what they need. This is strictly simpler than the old "dialog overlay with pass-through exceptions" design, and it's a natural consequence of the view-mode reframe.

**Confirm keys:**

| Key | Action |
|---|---|
| `Enter` | Run the currently-shown command against the selected argument |
| `Shift+Enter` | Run `create-in` against the selected argument (shortcut — no Tab needed) |
| `Ctrl+Enter` | Run `goto` against the selected argument (shortcut — mirrors global `follow_link`) |
| `Escape` | Cancel, restore prior cursor |
| `Tab` | Toggle focus between command and argument fields |

`Shift+Enter` and `Ctrl+Enter` are **shortcuts** for common overrides, not a separate "verb override" mechanism. They're equivalent to `Tab → type "create-in" → Tab → Enter` / `Tab → type "goto" → Tab → Enter` but without the round trip. Any other verb goes through Tab.

**Disabled state.** If the current command requires an argument (`goto`, `move`, `create-in`, `link`, `add`) but the argument field has no selected result, Enter is inactivatable — the footer shows `↵ <command> (disabled — no target)` and a bell rings on Enter. Mockup 4 shows this case with `create-in` on an empty result list. The user's recourse is one of:

1. Tab to the command field and pick a different command (e.g., `:capture` — see below).
2. Type a different argument query.
3. Escape.

### `:capture` — the "I have nothing to act on" command

`create-in` requires a target. What if the user wants to **create a new node from scratch** — a fresh task, a new note, an inbox capture — without an existing parent in mind?

That's a different command: **`:capture`**. It creates a new node under a configured default parent (usually `+Inbox` or the user's `inbox/` folder). The command reads `argumentBuffer` as the new node's title:

- User opens omnibox, types `new task for tomorrow`, Tab, types `cap`, Enter → creates a new node titled "new task for tomorrow" under `+Inbox`.
- Or: user opens via `c ` chord with no argument, types a title, Enter → since `create-in` has no target, the user Tabs and picks `:capture` → same result.

`:capture` is a normal command node with `when: !isEditing`, a `run()` that creates-in-inbox-with-title, and a default keybinding. It's how "quick capture" works in the omnibox without special-casing the empty-result state. The principle: **no command is ever "create a new thing with no target" by default** — that's always the explicit `:capture` command, which is explicit about where the node goes.

### Ghost completions drive auto-promotion

Both fields show **ghost-text completions** from Silvery's `TextInput` autocomplete. The rule is simple and symmetric across both fields:

**If the ghost is visible, an "accept" key commits it. If the ghost is not visible, nothing happens.** Accept keys are `Tab`, `Space`, and `Right-Arrow`. `Enter` also commits the ghost before firing confirm, so pressing Enter with a ghost visible completes the text then runs the command.

"Ghost visible" means: the `TextInput` has found a single unambiguous completion for the current buffer (Silvery's built-in `getAutocompleteSuggestion` logic). There is no "unambiguous top-2 ratio" heuristic — we use the ghost's presence as the sole signal. **Only ghosted completions are ever committed.** If the user is typing something ambiguous, no ghost → space is just a space.

**Promotion happens on ghost-accept, not on space generally.** Concretely:

1. User types in the argument field: `:ne`
2. The argument field's scope is command-search (the `:` sigil). Ghost text appears: `w-project`, rendered as `:ne[w-project]` with the bracketed part dim.
3. User presses space (or Tab, or right-arrow). The reducer fires a `PROMOTE` action because the accepted ghost starts with `:`:
   - `commandBuffer ← "new-project"`
   - `argumentBuffer ← ""`
   - `focus ← "argument"`
4. The user now types the argument for `:new-project` — a title, a target node, whatever that command takes.

If instead the user had typed `:zz` (no command matches), **there is no ghost, so space just inserts a space** and the argument buffer becomes `:zz `. No special-casing, no promotion heuristic.

If the ghost is an argument-field node match (not a command), accepting it just completes the text in place — no promotion, because the accepted completion doesn't start with `:`.

**Backspace undoes one promotion step.** The reducer stores a pre-promotion snapshot so backspace-after-promote restores `argumentBuffer = ":new"` and `focus = argument`.

### The search-pane's cursor IS the cursor — because every pane has a cursor

This is a consequence of the view-mode reframe, not a separate rule. Every pane has a cursor. A `cards` pane's cursor is the cursored card; a `detail` pane's cursor is the focused block; a **`search` pane's cursor is the currently-selected row in the argument-field result list**.

Commands read "the current pane's cursor" and act. They don't know or care which view mode the pane is in. This means:

1. **No omnibox-specific command dispatch.** Enter in a search pane fires the same `commandExecutor` that Enter fires everywhere else. The command reads the cursor, runs, and the ephemeral overlay pane closes as a side-effect (persistent panes stay open).
2. **Pre-selection ergonomic wins come for free.** When `cmd-k` opens a fresh search overlay, the initial selected argument is the previous pane's cursor — so the search pane opens with "cursor points to whatever you were looking at". Enter runs `goto` against it (no-op "re-focus"). Shift+Enter runs `create-in` against it (creates a child). No special-casing; just cursor propagation during pane creation.
3. **Arrowing in the search pane moves the cursor.** Because the selected argument row *is* the cursor. In a persistent docked search pane, this means you're keyboard-driving a live cursor through a filtered, searchable view — exactly the promise of "omnibox as a dockable workflow surface", but with zero new abstractions.
4. **Commands that don't need an argument** (`zoom_out`, `toggle_theme`, `save`) don't read the cursor. Their `execute` function ignores `ctx.currentNodeId`. Enter runs them directly regardless of the argument field's state.

### Command arguments — selected from the list, not typed

Commands that need an argument read it from the current cursor — which, as above, is the argument-field selection. **The user doesn't type arguments.** They search the argument field and pick one.

For commands whose argument is an existing node (goto, move, link, create-in, add, zoom-to, open-in-pane, …) this is the default. For commands that need a *new* name (`:new-project <title>`, `:new-file <path>`), the title is the argument buffer itself — the command reads `argumentBuffer` directly instead of looking up a selected node. That's a per-command choice expressed in the command's `run()` function. The omnibox doesn't need to know.

This gives a clean mental model: **the argument field is always "what node are you talking about?"** — either selected from the results, or (rarely, for create-new commands) taken as raw text.

## Opening the omnibox

Every opening path resolves to a **create-pane action** that adds a `viewMode: "search"` pane to the workspace with `defaultCommand` + initial state. The pane lifecycle (ephemeral overlay vs persistent docked) is set by the `placement`:

| Chord | defaultCommand | argumentPrefill | focus | placement | lifecycle |
|---|---|---|---|---|---|
| `cmd-k` / `ctrl-k` | `goto` | *(current cursor)* | argument | center | ephemeral overlay |
| `g @` | `goto` | `@` | argument | center | ephemeral |
| `g #` | `goto` | `#` | argument | center | ephemeral |
| `g +` | `goto` | `+` | argument | center | ephemeral |
| `g [` | `goto` | `[` | argument | center | ephemeral |
| `g :` | *(empty)* | *(empty)* | command | center | ephemeral |
| `g g` | `goto` | *(current cursor)* | argument | center | ephemeral |
| `m @` | `move` | `@` | argument | center | ephemeral |
| `m +` | `move` | `+` | argument | center | ephemeral |
| `a @` | `add` | `@` | argument | center | ephemeral |
| `a #` | `add` | `#` | argument | center | ephemeral |
| `l g` | `add_link` | *(current cursor)* | argument | center | ephemeral |
| `c @` | `create_at` | `@` | argument | center | ephemeral |
| `/` | `local_find` | *(empty)* | argument | bottom-left | ephemeral |
| *(future)* | `goto` | *(cursor)* | argument | pane | persistent |

All chords converge on the same view-mode. "Opening the omnibox" is really "creating (or focusing) a search pane".

**Command IDs in the table above reference the existing commands** in `packages/km-commands/src/commands/` — `goto`, `move`, `add`, `add_link`, `capture_inbox`, `local_find`, etc. The omnibox is not adding new command IDs for its verbs; it's routing the existing ones through a new surface.

## State machine — the search-pane state

A `viewMode: "search"` pane carries a `SearchPaneState` on the pane (alongside `rootId`, which it inherits from normal panes). There is no separate omnibox reducer — the state is owned by the pane and mutated by reducer actions routed through the pane's own dispatcher:

```ts
interface SearchPaneState {
  /** Permanent default command for this pane, set at creation by the opening chord.
   *  Never changes for the lifetime of the pane. */
  defaultCommand: string
  /** Working command buffer — usually equals defaultCommand, diverges when user Tabs
   *  to the command field and edits. */
  commandBuffer: string
  /** Working argument buffer. */
  argumentBuffer: string
  focus: "command" | "argument"
  commandResults: KNode[]         // filtered command nodes   (only populated when focus=command)
  argumentResults: KNode[]        // filtered target nodes    (only populated when focus=argument)
  selectedCommandIndex: number | null   // which command the user has picked
  selectedArgumentIndex: number | null  // which argument the user has picked — this is the pane's cursor
  /** If true, the pane is dismissed after a successful CONFIRM. */
  ephemeral: boolean
  /** Layout hint — influences render but not state shape. Derived from defaultCommand
   *  at open time (`local_find` → bottom-left, everything else → center). */
  layout: "center" | "bottom-left" | "dock"
  /** Snapshot of the pre-promote state, if the user's last action was a PROMOTE. */
  promoteSnapshot: { argumentBuffer: string; focus: "command" | "argument" } | null
}
```

**`defaultCommand` is the pane's identity.** Every `view=search` pane has one, set at creation from the opening chord and **never changes** for the pane's lifetime. The working `commandBuffer` / `selectedCommandIndex` are allowed to diverge temporarily when the user Tabs to the command field and types something else — but the pane remembers what it "is". `Escape` while focused on the command field restores `commandBuffer = defaultCommand` and switches focus back to the argument field (instead of dismissing the pane). Only a second `Escape` dismisses it.

The footer renders the resolved action: if `commandBuffer === defaultCommand`, it shows `↵ <defaultCommand> <arg>`; if diverged, it shows `↵ <commandBuffer> <arg>  ·  esc restore <defaultCommand>`. The user always knows what the pane is, even while overriding.

**This means "omnibox = view=search" is not quite complete** — the full identity is `(viewMode: "search", defaultCommand: string)`. Two search panes with different default commands are as distinct as a cards pane and a columns pane; the same way `rootId` parameterizes a cards/columns pane, `defaultCommand` parameterizes a search pane.

The pane's public **cursor** accessor returns `argumentResults[selectedArgumentIndex] ?? null`. The board's `currentCursor()` just reads `activePane.cursor` — no special case for search panes.

Actions (dispatched by the pane's key handler):

```ts
type SearchPaneOp =
  | { type: "SEARCH_INPUT"; field: "command" | "argument"; buffer: string }
  | { type: "SEARCH_NAV_UP" | "SEARCH_NAV_DOWN" | "SEARCH_NAV_HOME" | "SEARCH_NAV_END" }
  | { type: "SEARCH_TOGGLE_FOCUS" }        // tab with no ghost
  | { type: "SEARCH_ACCEPT_GHOST" }        // tab / space / right-arrow with ghost visible
  | { type: "SEARCH_PROMOTE" }             // internal — fired by SEARCH_ACCEPT_GHOST when the accepted
                                           // argument-field ghost starts with ":"
  | { type: "SEARCH_CONFIRM" }             // enter — runs the resolved (command, argument) via
                                           // commandExecutor; if ephemeral, dismisses the pane
  | { type: "SEARCH_CANCEL" }              // escape — dismisses ephemeral pane; clears buffers for persistent
```

All reducers live in `@km/board` alongside the existing pane reducers. The existing `commandExecutor` (from `@km/commands`) handles `SEARCH_CONFIRM` — it reads the selected command, reads the pane's cursor, and runs the command's `execute(ctx)`.

**Invariants:**
- In a `search` pane, the cursor is always `argumentResults[selectedArgumentIndex] ?? null`.
- `selected*Index` is in `[0, *Results.length)` or `null` when the corresponding list is empty.
- Opening a search pane with `argumentPrefill` starting with a sigil runs the argument search immediately with that prefill.
- `SEARCH_CONFIRM` with a disabled command (command requires argument, no argument selected) is a no-op + bell.
- `SEARCH_CANCEL` on an ephemeral pane dismisses it and restores the previously-focused pane. On a persistent pane it clears the buffers but keeps the pane open.
- `SEARCH_ACCEPT_GHOST` with no visible ghost is a no-op (Tab then falls through to `SEARCH_TOGGLE_FOCUS`; Space / Right-Arrow pass through as normal text-input keys).

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

### Phase 5 — `viewMode: "search"` pane (new view mode)
Add `"search"` to the board pane's view-mode enum. Build the `SearchPaneView` component: command field (Silvery `TextInput` with `autocomplete = commandTitles`), argument field (same), result list below, footer with the resolved action. Single-field behavior internally (no Tab yet, no PROMOTE) — the command chip is locked by the opening chord. Route `command_palette`, `item_picker`, `search`, `manage_favorites`, `search_replace` to open a search pane instead of their current bespoke dialogs. The old dialog components become thin adapters that delegate to `openSearchPane({ command, argumentPrefill, layout: "center" })`.

### Phase 6 — cursor unification via pane cursor
Teach the board's `currentCursor()` lookup to route through `activePane.cursor`. For cards/columns/tabs/detail panes this is already true in spirit; for search panes, implement the `.cursor` accessor to return `argumentResults[selectedArgumentIndex]`. Remove any `dialog:omnibox` scope guards from the command executor. Tests: arrow in a search pane → commands that read `currentNodeId` act on the selected argument row.

### Phase 7 — two searchable fields + Tab + ghost accept + PROMOTE
Split the single buffer into `commandBuffer` + `argumentBuffer` with `focus` toggle. Two-line center-modal layout (command above argument). Wire Silvery `TextInput`'s `autocomplete` prop for both fields. Add the key rules:
- Tab: accept ghost if visible, else toggle focus.
- Space/Right-Arrow: accept ghost if visible, else pass through.
- `SEARCH_ACCEPT_GHOST` with a `:`-starting accepted ghost fires `SEARCH_PROMOTE` (move to command field, clear argument, store snapshot).
- Backspace after PROMOTE restores the snapshot.
- `Shift+Enter` shortcut for `create_at`, `Ctrl+Enter` shortcut for `goto`.
Update the Opening table chord handlers to route to the new two-field state shape. Finish wiring the `CAPTURE` op handler so `:capture` does the right thing against the configured inbox.

### Phase 8 — cursor pre-select
When opening an ephemeral search pane via `cmd-k`, propagate the previously-focused pane's cursor into the new pane's initial `selectedArgumentIndex`. Feature-flag behind a config option for the first release in case it's confusing.

### Phase 9 — `/` local find, `layout="bottom-left"`
Add the `bottom-left` layout. Wire `/` to open a search pane with `{ command: "local_find", focus: "argument", layout: "bottom-left" }`. Replace `apps/km-tui/src/views/FindBar.tsx` with the new surface. In-place board highlighting reads from the search pane's argument buffer and uses `highlightMatches()`.

### Phase 10 — shelves
Delete legacy code (`Omnibox.tsx`, `ItemPicker.tsx`, `FavoritesDialog.tsx`, `FindBar.tsx`, `CommandBox.tsx`, the dialog-scope plumbing that used to guard `dialog:omnibox`). Update `docs/ref/commands.md` with the new routing. Add integration tests for each chord path. Close **km-tui.palette-arrow-keys** — with the view-mode reframe, the class of bug is gone because there's no dialog-scope layering for commands.

### Phase 11 (post-v1) — docked persistent search pane
Allow a search pane to be spawned with `layout: "dock"` and `ephemeral: false`. Workspace pane manager treats it like any other dockable view (supports split, resize, focus cycling, etc.). Users can have a permanent "inbox triage" pane, a "search-as-you-go" pane, etc. Requires: a `cmd-k`-equivalent that toggles docking on the current ephemeral pane, and probably a new entry in the `vm` view-mode cycle.

**Ship sequencing:**
- Phase 1+2 ship together (pure refactors with test support).
- Phase 3+4 ship together (adapter + opt-in `when`).
- Phase 5 is the pivotal change — it introduces `viewMode: "search"` and collapses the existing dialogs onto it. Ships alone.
- Phase 6+7+8 ship as one release candidate (two-field model + cursor unification + pre-select are coherent as a unit).
- Phase 9 is pure win once Phase 5 is merged — it can ship at any point afterward.
- Phases 10+11 are cleanup and post-v1 work.

## Out of scope

- **Autocompletion inside card titles**. That's the inline editor, not the omnibox.
- **Multi-select inside the omnibox**. Future. Today the omnibox picks one thing; multi-select for "add tag to all selected tasks" is the existing multi-selection flow before opening.
- **Graph / tree visualizations**. The omnibox is a flat result list.
- **Freeform argument strings**. All arguments come from the result list (or from the buffer for create-new commands that opt in). No shell-style "parse whitespace into positional args".

## Resolved questions

1. **Recent handling** — recents are a recency bonus on the ranker, filtered by prefix like every other result. No separate "recents list"; the empty-buffer state just happens to be sorted by recency.
2. **`create_at` with no match** — inactivatable. Users who want to create a brand-new thing with no target use `capture_inbox` (which already exists as a stub in `edit.ts:255`) or a future `:new-project` / `:new-file` command that reads `argumentBuffer` as the title. This keeps `create_at` semantically clean — always operates on an existing target.
3. **Commands take arguments via the argument field** — not via typed strings. Commands whose argument is an existing node (`goto`, `move`, `add_link`, `create_at`, `reparent_picker`, …) read `ctx.currentNodeId` (which comes from the pane's cursor = the selected argument row). Create-new commands read `argumentBuffer` directly. Commands decide per-command; the omnibox doesn't care.
4. **Universal mode shows commands** — yes, with a tuneable type weight (start at 0.4; adjust against the canonical ranking test fixture).
5. **No separate override scope** — because the omnibox is a board view, not a dialog. Tab + typing in the command field is the override; `Shift+Enter` / `Ctrl+Enter` are shortcuts. Global keybindings work without any pass-through rule.
6. **Layout — two lines.** The command field is the "title" of the action, the argument is the "object". Center modal stacks them vertically (command line, argument line, results, footer). Bottom-left local-find keeps the compact single-line form (command is locked, so there's nothing to edit).
7. **Search-pane state is pane-owned.** Each search pane owns its own `SearchPaneState` (like detail panes own `rootId`, like cards panes own `cursorId`). The workspace holds panes by id; no global omnibox singleton.
8. **Empty command field content.** Recents (recently-run commands) plus — if the previously-focused pane had a cursor — that cursor surfaced as the "cursor target" suggestion in the argument side. "Here are the things you'd most likely want to do right now", not "here is a command reference".
9. **Tab completion — Silvery's `TextInput` autocomplete.** `vendor/silvery/packages/ag-react/src/ui/input/TextInput.tsx` already has `autocomplete: string[]` + ghost text + "accept the suggestion" semantics. Wire both fields to it. Tab priority: accept ghost if visible, else toggle focus. Space / Right-Arrow also accept when ghost visible. Only ghosted completions are ever committed — no separate "unambiguous top-match" heuristic.

## Open questions

*(none remaining — all prior questions resolved.)*

## Mapping to existing commands

The following commands already exist in `packages/km-commands/src/commands/` and will be rerouted to open a search pane instead of their current bespoke dialog/picker:

| Existing command | Current behavior | After migration |
|---|---|---|
| `command_palette` (`navigation.ts:262`) | Opens `Omnibox.tsx` | Opens search pane with `{ focus: "command" }` |
| `item_picker` (`tui.ts:55`) | Opens `ItemPicker.tsx` | Opens search pane with `{ command: "goto", focus: "argument" }` |
| `manage_favorites` (`navigation.ts:309`) | Opens `FavoritesDialog.tsx` | Opens search pane scoped to favorited nodes |
| `local_find` (`tui.ts:203`) | Opens `FindBar.tsx` | Opens search pane with `{ command: "local_find", layout: "bottom-left" }` |
| `search` (`tui.ts:66`) | Opens search dialog | Opens search pane with `{ command: "goto", focus: "argument" }` |
| `filter` (`navigation.ts:252`) | Opens filter dialog | Opens search pane with filter-specific layout (phase 5 detail) |
| `search_replace` (`tui.ts:241`) | Opens search/replace dialog | Opens search pane with a replace-aware layout (out of scope for v1) |
| `goto` (`navigation.ts:209`) | Takes `ctx.targetId`, emits `CURSOR_TO` | Unchanged — search pane's cursor feeds `ctx.currentNodeId`; command still reads `targetId` when set by a chord |
| `move` (`edit.ts:194`) | Takes `ctx.targetId`, emits `REPARENT_TO` | Same pattern |
| `add` (`edit.ts:209`) | Takes `ctx.targetId`, emits `LINK_TO`/`SET_LABEL`/etc | Same pattern |
| `add_link` (`edit.ts:223`) | Emits `ADD_LINK` | Same |
| `capture_inbox` (`edit.ts:255`) | Emits `{ type: "CAPTURE", location: "inbox" }` (stub) | Finish wiring in Phase 7 |

No new command IDs are introduced for the omnibox's verbs. The new work is: (a) the search view mode, (b) the `when`-clause DSL, (c) the commands-as-nodes adapter, and (d) finishing the `CAPTURE` op handler.

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
   TEA's command-def pattern uses `.parse()` with signal-valued defaults: `z.string().default(() => cursor())`. The search pane's `.cursor()` accessor returns its selected argument row. Every command that takes a `nodeId` declares it with a signal default that reads the active pane's cursor — and the active pane's cursor reader dispatches on view mode (cards → cursored card, detail → focused block, search → selected argument row). This is the TEA-native phrasing of "the search pane's selection IS the cursor".
   - **Pre-TEA**: the `CommandContext` builder reads `activePane.cursor` and populates `currentNodeId` imperatively (same effect, pre-reactive).

4. **Search pane = `withSearch()` domain plugin, parametrized by `defaultCommand`.**
   Every TEA domain plugin is model + commands + keybindings composed via `pipe()` ([commands.md § "Command-Centric Design"](../../vendor/internal/silvery/design/v15-tea/commands.md)). The search view becomes `withSearch()`:
   ```ts
   pipe(createApp(), withBoard(), withSelection(), withSearch(), withUndo(), ...)
   ```
   `withSearch()` contributes: (a) the `viewMode: "search"` registration on `withBoard()`, (b) the `SearchPaneState` model, (c) search-specific commands (`search.open`, `search.toggle_focus`, `search.accept_ghost`, `search.confirm`, `search.cancel`, `search.restore_default`), and (d) keybindings scoped via `when(searchModel.isActive, ...)`.
   **Pane creation takes `defaultCommand` as a parameter**, exactly like detail panes take `rootId`. `search.open({ defaultCommand: "move", argumentPrefill: "+" })` creates a search pane.

### Interactions with other domain plugins

- **`withSelection()`** (km-tui.tea): the search pane's "selected argument row" should be represented as a `NodeSelection` in the unified `Selection = TextSelection | NodeSelection | GapSelection` type — not as a separate `selectedArgumentIndex` field. Arrowing in the search pane updates `sel` through the same dispatch path that arrowing in a cards pane uses. One selection system, one normalization pass after tree mutations, one set of commands that read it. The `selectedArgumentIndex` in `SearchPaneState` becomes a derived view over `sel`, not primary state.

- **`withTree()`** (km-tui.tea): structural ops from the search pane (`move`, `create_at`, `add_link`, `reparent`) fire through the same atomic tree-op apply chain. No separate dispatch path; the search pane is a normal command producer. Undo works through the shared middleware.

- **`withDialogs()`** (km-tui.tea): the current plan in `bd show km-tui.tea` lists `open_omnibox` as a dialog command under `withDialogs()`. **This framing is obsolete.** The omnibox is a view mode, not a dialog. The km-tui.tea bead should be updated to:
  - Move `open_omnibox` → `search.open` under `withSearch()`.
  - Keep `withDialogs()` for genuinely modal affordances that aren't view modes (toast, delete-confirm, help overlay, the console palette).

- **`withEditor()`** (km-tui.tea): the command and argument fields use Silvery's `TextInput` (already supports ghost-text autocomplete). Once `withEditor()` exists, both fields become consumers of `PlainText.apply()` and the ghost-text logic runs inside the shared editor model. No special case.

- **`withUndo()`** (km-tui.tea): opening/closing a search pane is not itself undoable (like opening a cards view isn't). The commands the search pane dispatches ARE undoable, through the normal middleware. `Escape → dismiss` restores focus to the previous pane but doesn't undo any work.

### What this changes in the migration phases

- **Phase 3**: retitle from "commands as nodes" to "**command-tree projection (TEA shim)**". Build the row renderer against a `KNode`-shaped projection of `@km/commands`. The projection function is the only thing that needs to change post-TEA.
- **Phase 4**: retitle from "when-clauses (string DSL)" to "**predicate-function availability**". Add an optional `when?: (ctx: CommandContext) => boolean` field to `CommandDef`. No parser needed. Maps 1:1 to TEA's signal `when()`.
- **Phase 5**: the `SearchPaneView` component is the pre-TEA form of `withSearch()`'s UI contribution. Every piece of state it reads is eventually a signal; every action it dispatches is eventually a TEA op. Structure the code as if TEA were in place — factory function, explicit state shape, pure dispatch — so the framework migration is a rewiring exercise.
- **Phases 6-8**: the two-field model + cursor unification + pre-select collapse into "wire the search pane's cursor accessor into `activePane.cursor()`, wire the command field's autocomplete into the TEA command tree". Post-TEA, most of this is one-liner plumbing; pre-TEA, it's the imperative shim.

**Bottom line: the omnibox ships before TEA lands, but it's designed as a TEA plugin in advance.** When TEA migration happens, `withSearch()` becomes the canonical consumer that proves the framework works — instead of being painted into a corner, it becomes the framework's first win.

## Relationship to other work

- **km-tui.picker-rank-subpath** — absorbed into Phase 2.
- **km-tui.palette-arrow-keys** — absorbed into Phase 5+6 (the bug class goes away once the omnibox is a board view mode with no dialog scope).
- **km-silvery.focus** — the omnibox is a pane, not a dialog, making the focus system's job simpler.
- **km-silvery.selection-focus-plateau** — 5 fewer components to keep in sync across selection/focus state.
- **km-tui.tea** — the `SearchPaneState` reducer is an obvious TEA machine candidate. **Build the design in the shape TEA wants from day one** (see § TEA alignment above). `open_omnibox` in `withDialogs()` is obsolete; the correct home is `withSearch()`.
- **km-silvery.tea** — the omnibox is the first non-trivial consumer of `when()`, `resolveInvocation()`, signal-defaulted args, and the `app.commands.*` tree. Validating the omnibox validates those primitives.
- **km-tui.atomic-tree-ops** — the search pane is the main producer of structural ops that aren't "edit current node" (goto, move, add, create_at, reparent).
- **km-tui.detail-unify-real** — same shape: unify `detail` pane as a board view-mode rather than a special pane class. The omnibox unification follows the same pattern.
- **km-all.unified-selection** — the search pane's selected argument row IS a `NodeSelection`; this design assumes the unified selection type lands first (or is implemented alongside).

## References

- VS Code Quick Open (Ctrl+P) + Command Palette (Ctrl+Shift+P) — the sigil-routing precedent. VS Code uses `:` for line number, `@` for symbol, `#` for workspace symbol, `>` for command. The sigils mean different things in km but the same one-component-many-modes principle applies.
- Obsidian Quick Switcher — `file name`, `[[` for existing notes, `Ctrl+Enter` for new tab. One box, contextual sigils.
- Raycast — universal launcher with typed results and contextual actions (`Cmd+K` for action menu on selected result). The "verb override" idea comes from here.
- Emacs M-x + Helm/Ivy/Consult — one minibuffer, dynamic sources, action transformers per source. Closest spiritual ancestor.
