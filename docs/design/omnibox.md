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
- **The omnibox's selected argument row IS the cursor for command purposes.** Commands always operate on "the current cursor". When the omnibox is open, the current cursor is the omnibox's argument-field selection. When it closes, the current cursor snaps back to the board. **The omnibox is just a dynamic view of the tree** that temporarily provides the cursor.
- **There is no "omnibox vs board" branch in any command.** `goto`, `move`, `create-in` don't ask "am I in a dialog?" — they read the current cursor and act. The cursor source is a view concern, not a command concern.
- **A future omnibox-as-pane** (docked persistent view) falls out of this for free. It's the same component with `placement="pane"`, perpetually open, its argument-field selection continuously driving the cursor. The user gets a permanent workflow surface — like a keyboard-driven file navigator or task triager — with no new abstractions.

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

### Default command, override via Tab

The command field starts pre-populated based on how the omnibox was opened:

| Open via | Initial command |
|---|---|
| `cmd-k` | `goto` |
| `g` chord | `goto` |
| `m` chord | `move` |
| `a` chord | `add` |
| `l` chord | `link` |
| `c` chord | `create-in` |
| `/` (direct) | `find` |

**Override = tab to the command field and type.** There are no `Ctrl+g/m/a/l` chord overrides anymore — the command field *is* the override surface. It's always visible as a chip/label (mockups 1, 2, 4) and becomes a text input the moment you Tab to it or press `:` on an empty argument field. Once the user picks a different command, Tab back to the argument field and confirm.

This is strictly simpler than the "default verb + modifier override" model: the user doesn't have to learn a second key system. Tab is the universal "edit the other half of the tuple" affordance, and the argument field continues to behave as it did.

**Confirm keys:**

| Key | Action |
|---|---|
| `Enter` | Run the currently-shown command against the selected argument |
| `Shift+Enter` | Run `create-in` against the selected argument (shortcut — no Tab needed) |
| `Ctrl+Enter` | Run `goto` against the selected argument (shortcut — mirrors global `follow_link`) |
| `Escape` | Cancel, restore prior cursor |
| `Tab` | Toggle focus between command and argument fields |

`Shift+Enter` and `Ctrl+Enter` are **shortcuts** for common overrides, not a separate "verb override" mechanism. They're equivalent to `Tab → type "create-in" → Tab → Enter` / `Tab → type "goto" → Tab → Enter` but without the round trip. Any other verb goes through Tab.

**Disabled state.** If the current command requires an argument (`goto`, `move`, `create-in`, `link`, `add`) but the argument field has no selected result, Enter is inactivatable — the footer shows `↵ <command> (disabled — no target)` and a bell rings on Enter. Mockup 4 shows this case with `create-in` on an empty result list.

### The omnibox's selection IS the cursor

This is the deepest unification in the whole design.

**While the omnibox is open, its argument-field selection is `cursorId` for every command in the system.** Commands always read "the current cursor" and act on it. The source of that cursor is a property of the active view:

- Board view open, no dialog → cursor is the board's cursored node.
- Omnibox open (any placement) → cursor is whichever row is selected in the omnibox's argument-field result list.
- Detail pane active → cursor is the detail pane's focused node.

Commands don't know or care. They call `currentCursor()` and operate. This means:

1. **There is no `omniboxConfirm()` function that special-cases the dialog.** Enter in the omnibox just fires the same command dispatch that Enter on the board fires. The command reads the cursor, runs, and the omnibox closes as a side-effect of the dispatch (unless it's a persistent pane).
2. **The pre-selection ergonomic wins come for free.** When you open the omnibox via `cmd-k`, the first result is the current board cursor. Enter runs `goto` against it — which is a no-op "re-focus". Shift+Enter runs `create-in` against it — creating a child under the current node. These aren't special-cased; they're just consequences of "the selected argument is the cursor" + "the default selected argument is the board cursor".
3. **Arrowing in the omnibox moves the cursor.** In `placement="pane"` (the persistent case) this is especially powerful: arrow keys in the omnibox propagate to the entire app. You're keyboard-driving a live cursor through a filtered, searchable view.
4. **Commands that don't need an argument** (`:save`, `:zoom-out`, `:toggle-theme`) simply don't read the cursor. They're still valid with no argument-field selection. Enter runs them directly.

### Command arguments — selected from the list, not typed

Commands that need an argument read it from the current cursor — which, as above, is the argument-field selection. **The user doesn't type arguments.** They search the argument field and pick one.

For commands whose argument is an existing node (goto, move, link, create-in, add, zoom-to, open-in-pane, …) this is the default. For commands that need a *new* name (`:new-project <title>`, `:new-file <path>`), the title is the argument buffer itself — the command reads `argumentBuffer` directly instead of looking up a selected node. That's a per-command choice expressed in the command's `run()` function. The omnibox doesn't need to know.

This gives a clean mental model: **the argument field is always "what node are you talking about?"** — either selected from the results, or (rarely, for create-new commands) taken as raw text.

## Opening the omnibox

Every opening path resolves to an `OPEN` action with `{ command, argumentPrefill, focus, placement }`:

| Chord | command | argumentPrefill | focus | placement |
|---|---|---|---|---|
| `cmd-k` / `ctrl-k` | `goto` | *(current cursor)* | argument | center |
| `g @` | `goto` | `@` | argument | center |
| `g #` | `goto` | `#` | argument | center |
| `g +` | `goto` | `+` | argument | center |
| `g [` | `goto` | `[` | argument | center |
| `g :` | *(empty)* | *(empty)* | command | center |
| `g g` | `goto` | *(current cursor)* | argument | center |
| `m @` | `move` | `@` | argument | center |
| `m +` | `move` | `+` | argument | center |
| `a @` | `add` | `@` | argument | center |
| `a #` | `add` | `#` | argument | center |
| `l g` | `link` | *(current cursor)* | argument | center |
| `c @` | `create-in` | `@` | argument | center |
| `/` | `find` | *(empty)* | argument | bottom-left |

All chords converge on the same component with different opening state.

## State machine

```
                         open(cmd, arg, focus, placement)
         closed ──────────────────────────────────────▶ open
           ▲                                             │
           │        close()                              │ key events
           │                                             ▼
           └──────────────────────────── confirm(cmd, selectedArg)
                                                         │
                                                         ▼
                                                    dispatch op
```

States:

- **closed** — no omnibox visible. Cursor source is the board.
- **open** — omnibox mounted, dialog mode is `dialog:omnibox`. The omnibox is now the cursor source.

Store shape:

```ts
interface OmniboxState {
  open: boolean
  placement: "center" | "bottom-left" | "pane"
  commandBuffer: string           // search query for the command field
  argumentBuffer: string          // search query for the argument field
  focus: "command" | "argument"
  commandResults: KNode[]         // filtered command nodes (only populated when focus=command)
  argumentResults: KNode[]        // filtered target nodes  (only populated when focus=argument)
  selectedCommandIndex: number | null   // which command the user has picked (may differ from commandBuffer)
  selectedArgumentIndex: number | null  // which argument the user has picked
}
```

Key invariant: **the committed command and argument are the most recently `selected*Index` — not whatever's currently in the buffer.** Switching focus to the command field to browse doesn't reset the argument selection, and vice versa. This is what makes mockup 3 work.

Actions:

```ts
type OmniboxOp =
  | { type: "OPEN"; command: string; argumentPrefill: string; focus: "command" | "argument"; placement: Placement }
  | { type: "CLOSE" }
  | { type: "INPUT"; field: "command" | "argument"; buffer: string }
  | { type: "NAV_UP" | "NAV_DOWN" | "NAV_HOME" | "NAV_END" }   // navigates the focused field's result list
  | { type: "TOGGLE_FOCUS" }                                     // tab
  | { type: "CONFIRM" }                                          // run resolved (command, argument)
  | { type: "CANCEL" }
```

The reducer lives in `@km/board` or a new `packages/km-tui-omnibox/` package. React components subscribe via `useSignal`.

**Invariants:**
- If `open`, exactly one of `commandResults` / `argumentResults` is "active" (the focused field's results).
- If `open`, `selected*Index` is in `[0, *Results.length)` or `null` when the corresponding list is empty.
- Opening with `argumentPrefill` starting with a sigil runs the argument search immediately with that prefill.
- `CONFIRM` with a disabled command (command requires argument, no argument selected) is a no-op + bell.
- `CLOSE` and `CANCEL` both clear all buffers and results and pop the dialog mode. `CANCEL` also restores the prior board cursor. `CLOSE` (post-successful-confirm) lets the dispatched command decide the new cursor.

## Migration

This is a refactor-then-feature, not a rewrite. Phases:

### Phase 1 — shared row component
Create `OmniboxRow` (the node-based one). Migrate `ItemPicker`, `Omnibox`, `FavoritesDialog` to use it — adapter layer converts today's result shapes to `KNode`-compatible rows. No behavior change. Catches divergence bugs.

### Phase 2 — shared ranker
Extract `rankResults(query, KNode[])` with the ranking rules above. Add `omnibox-ranking.test.ts` table. Migrate `ItemPicker.filterOptions` and `Omnibox`'s scorer to use it. Fixes **km-tui.picker-rank-subpath**.

### Phase 3 — commands as nodes
Introduce `CommandNode` and the synthetic `commands/` subtree. Migrate the existing command registry (`command-bridge.ts` / `@km/commands`) to register nodes into the tree. No UI changes yet — the old command palette still queries the registry, but via the node-backed adapter. Tests: every registered command appears as a `KNode` with `type: "command"`.

### Phase 4 — when-clauses
Parse and evaluate `when` expressions. Migrate the current ad-hoc availability checks (dialog-mode guards, edit-mode guards) to `when` clauses on the command nodes. Keybinding layer consults `when` before dispatching. Tests: disabled commands don't appear in the omnibox list and don't trigger their key.

### Phase 5 — unified component, one field (bridge)
Single-field `Omnibox` component (~300 lines). Replaces `Omnibox.tsx` + `ItemPicker.tsx` + `FavoritesDialog.tsx`. Same dialog modes, one node-keyed result list. Old components become thin wrappers for one release, then delete. Supports `placement: "center"` only. This is the **bridge step** — still a single buffer internally so we don't ship the two-field model and the component rewrite at the same time.

### Phase 6 — cursor unification
Make the omnibox the cursor source while open. Every command that reads `currentCursor()` now resolves to the omnibox's selected result when the omnibox is open. Tests: arrow in omnibox → board cursor follows. Shift+Enter create-in no longer special-cases "the dialog" — it just operates on "the cursor".

### Phase 7 — two searchable fields
Split the single buffer into `commandBuffer` + `argumentBuffer` with `focus` toggle. Introduce Tab semantics. Visible command chip in the center modal. `Shift+Enter` and `Ctrl+Enter` become the only "override" shortcuts; remove any `Ctrl+g/m/a/l` plumbing that was in Phase 5. Update chord table in `Opening the omnibox`.

### Phase 8 — cursor pre-select
Teach the omnibox to read the board cursor on open and set `argumentPrefill` / `selectedArgumentIndex` appropriately. Feature-flag behind a config option for the first release in case it's confusing.

### Phase 9 — `/` local find, `placement="bottom-left"`
Add the `bottom-left` placement. Wire `/` to open with `{ command: "find", focus: "argument", placement: "bottom-left" }`. Replace `apps/km-tui/src/views/FindBar.tsx` with the omnibox in local-find mode. Extract `highlightMatches()` into a shared helper used by both the row renderer and the in-place board highlighting.

### Phase 10 — shelves
Delete legacy code (`Omnibox.tsx`, `ItemPicker.tsx`, `FavoritesDialog.tsx`, `FindBar.tsx`, `CommandBox.tsx`, old command-registry adapter). Update docs. Update keybindings reference. Add integration tests for each chord path.

### Phase 11 (post-v1) — `placement="pane"`
Persistent docked omnibox. Same component, `persistent: true` flag, never auto-closes on Enter. Workspace-level state (like detail pane). Requires: pane-aware focus-restoration, "don't save nav history for omnibox-cursor transitions", and probably a new `vm` cycle slot.

Each phase is independently shippable. Phase 1+2 can ship together (pure refactors). Phase 3+4 can ship together. Phase 5 is the single-buffer bridge. Phase 6+7+8 are the two-field migration and should ship as one release candidate. Phase 9 is pure win once Phase 7 is merged.

## Out of scope

- **Autocompletion inside card titles**. That's the inline editor, not the omnibox.
- **Multi-select inside the omnibox**. Future. Today the omnibox picks one thing; multi-select for "add tag to all selected tasks" is the existing multi-selection flow before opening.
- **Graph / tree visualizations**. The omnibox is a flat result list.
- **Freeform argument strings**. All arguments come from the result list (or from the buffer for create-new commands that opt in). No shell-style "parse whitespace into positional args".

## Resolved questions

The following were open in earlier drafts; resolved here:

1. **Recent handling** — recents are a recency bonus on the ranker, filtered by prefix like every other result. No separate "recents list"; the empty-buffer state just happens to be sorted by recency.
2. **create-in with no match** — inactivatable. Creating a brand-new project/file is a separate command (`:new-project`, `:new-file`) that reads `argumentBuffer` as the title. This keeps `create-in` semantically clean (always operates on an existing target).
3. **Commands take arguments via the argument field** — not via typed strings. `move` reads the selected argument row; `:new-project` reads the argument buffer directly. Commands decide per-command.
4. **Universal mode shows commands** — yes, with a tuneable type weight (start at 0.4; adjust against the canonical ranking test fixture).
5. **Keyboard-only override fallback** — not needed. Override is via Tab + typing in the command field, which works on every terminal. `Ctrl+Enter` / `Shift+Enter` are shortcuts, not requirements; if a terminal strips them, the user can still Tab.

## Open questions

1. **Two fields on one line vs two separate lines?** In the center modal, should the command chip and argument input be on one visual row (`[goto] @del_`) or stacked (command line, then argument line)? One-line is denser and feels like a shell prompt; two-line is clearer about which field has focus. Leaning two-line in the center placement and one-line in bottom-left.
2. **`placement="pane"` state ownership** — does the pane own its own omnibox state, or is there one global omnibox state that the pane "attaches" to? Leaning pane-owned (like detail panes own their `rootId`).
3. **Does the command field show recents when empty?** Yes for symmetry, but this means `cmd-k` with empty arg and Tab to command immediately shows "recently run commands" — which might be distracting. Alternative: empty command field shows *all* commands grouped by category until the user types.
4. **Tab completion inside the command field** — if user types `mo`, should Tab complete to `move` (as in a shell) or toggle focus back to argument? Probably the latter (focus toggle) to keep Tab's semantic consistent, and let the user just press `Enter` to pick the top result.

## Relationship to other work

- **km-tui.picker-rank-subpath** — absorbed into Phase 2.
- **km-silvery.focus** — the omnibox is one dialog, making the focus system easier to get right.
- **km-silvery.selection-focus-plateau** — one less component to keep in sync across selection/focus state.
- **km-tui.tea** — the omnibox state machine is an obvious TEA machine candidate. Build the design in the shape TEA wants.
- **km-tui.atomic-tree-ops** — verb overrides dispatch atomic ops. The omnibox is the main producer of structural ops that aren't "edit current node".

## References

- VS Code Quick Open (Ctrl+P) + Command Palette (Ctrl+Shift+P) — the sigil-routing precedent. VS Code uses `:` for line number, `@` for symbol, `#` for workspace symbol, `>` for command. The sigils mean different things in km but the same one-component-many-modes principle applies.
- Obsidian Quick Switcher — `file name`, `[[` for existing notes, `Ctrl+Enter` for new tab. One box, contextual sigils.
- Raycast — universal launcher with typed results and contextual actions (`Cmd+K` for action menu on selected result). The "verb override" idea comes from here.
- Emacs M-x + Helm/Ivy/Consult — one minibuffer, dynamic sources, action transformers per source. Closest spiritual ancestor.
