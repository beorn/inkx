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

One modal: the *omnibox*. It handles every "find something, then do a thing with it" workflow. Sigil prefixes select the search mode. Verbs are attached after search, not before.

One result list, one row renderer, one keybinding scope (`dialog:omnibox`), one state machine.

## Mockups

All three mockups below are the **same component** with different `placement` and initial `{verb, sigil}` state. The layout is a presentation prop; the search, ranker, row renderer, and state machine are identical. These are semantic wireframes — not box-drawn ASCII — so each element is a line annotated with what it is.

### 1. Center modal — `cmd-k`, Universal search, cursor pre-selected

Empty buffer. Cursor node is the top result, recents and suggestions follow. Footer shows the default verb and override keys.

```
placement:    center
state:        { verb: goto, sigil: null, buffer: "" }

  input       : › _                                                      (empty)

  results     : ▸ @ omnibox.md                +km/docs/design    ← selected (cursor node)
              : : zoom-out                    bound to  Z
              : ▸ + km-tui.omnibox-unified    beads              P0
              : @ delei                       context
              : # urgent                      47 uses
              : ▸ board.tsx                   +km/apps/km-tui/src

  footer      : [goto]  ↵ confirm   ^m move   ^l link   ⇧↵ create-in   esc
```

Row format: `<sigil> <primary>  <secondary>  [trailing badge]`. The cursor marker `▸` and the selected marker `←` are shown on separate lines only for clarity in the mockup — in the real UI, the selected row has an inverse background and the cursor row has a `▸` prefix.

### 2. Center modal — `g @` chord, Context picker, typing "del"

Opens with `@` pre-filled. User types "del". The ranker resolves the `@delei` vs `@office/Finance/Accounts/Delei/SPD` bug: the short exact segment-prefix match wins.

```
placement:    center
state:        { verb: goto, sigil: "@", buffer: "@del" }

  input       : › @del_

  results     : @ delei                                context       ← selected
              : @ deloitte                             work/context
              : @ @office/Finance/Accounts/Delei/SPD   deep match

  footer      : [goto]  ↵ confirm   ^m move   ^l link   ⇧↵ create-in   esc
```

### 3. Bottom-left local find — `/` sigil

Same component, `placement="bottom-left"`. Scoped to the current pane's visible tree. Renders as a narrow inline bar in the status area with a match count. Backspace through `/` promotes it back to the centered Universal omnibox. The result list is shown as **highlighted matches in-place** on the board rather than a separate dropdown — so the component still owns the query + ranker, but the "result list" is the set of match highlights + a `next/prev` cursor over them.

```
placement:    bottom-left
state:        { verb: find, sigil: "/", buffer: "omnibox" }

  [board area] Matches are highlighted in-place on the rendered tree.
               Current match has a stronger highlight; others are subtle.

  bottom bar  : / omnibox          2 / 37    ↵ next   ⇧↵ prev   esc
```

## Model

### Input buffer

The omnibox has a single text buffer. The **first character** selects the search mode:

| First char | Mode | Matches | Placement |
|---|---|---|---|
| `:` | **Command** | Command nodes by id and title (`:save`, `:zoom out`, `:toggle-theme`) | Center |
| `@` | **Context** | Person / assignee / context node (`@delei`, `@bjorn`) | Center |
| `#` | **Tag** | Tag node (`#urgent`, `#review`) | Center |
| `+` | **Project** | Project node (`+km`, `+taxes`) | Center |
| `[` | **Node** | Any node by title / content (fallback — non-sigil full-text search) | Center |
| `/` | **Local find** | Find-in-current-view (current doc / board / detail pane) | Bottom-left bar |
| `>` | *(reserved)* | Jump to heading in current doc (maybe — not in v1) | Center |
| `?` | *(reserved)* | Help — "what does this key do?" inline docs (maybe — not in v1) | Center |
| *(empty)* | **Universal** | Everything, ranked by type | Center |

Backspace through the sigil → `''` → mode becomes **Universal**. Type a different sigil → mode switches. No separate components, no re-open. The mode is a function of the buffer's first character, recomputed on every keystroke.

**Local find is the same component, different layout.** `/` scopes the search to the current pane's visible tree and shows the box in the bottom-left status area (narrow, inline, match count next to it) instead of the centered modal. Backspace through `/` → component promotes back to the centered omnibox with Universal scope. The placement is a presentation prop — a single `<Omnibox placement="center" | "bottom-left" />` — not a different component. This also means we can choose to pin the whole combobox to the bottom-left if we ever want to (e.g., for "quiet" chord sessions) without touching the search engine, row renderer, or state machine.

**Empty-buffer behavior**: when the buffer is empty, show a *suggested* result set (recent nodes, cursor context, default project, "run command" hint). Pressing any key dispatches based on the first character.

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

### Verbs — default, override, confirm

Every selection has a **default verb** that depends on how the omnibox was opened:

| Open via | Default verb |
|---|---|
| `cmd-k` / `ctrl-k` | `run` (for commands), `goto` (for nodes) |
| `g` chord | `goto` |
| `m` chord | `move` — move current selection to target |
| `a` chord | `add` — add target (tag/project/person) to current selection |
| `l` chord | `link` — insert link to target at cursor |
| `c` chord | `create-in` — create new child under target |

The verb is an attribute of the omnibox session, not of the result. User can **override** at confirm time:

| Key | Verb |
|---|---|
| `Enter` | Default verb (from chord) |
| `Ctrl+Enter` | Force `goto` (mirrors global `Ctrl+Enter` = follow link) |
| `Ctrl+g` + Enter | Force `goto` |
| `Ctrl+m` + Enter | Force `move` |
| `Ctrl+a` + Enter | Force `add` |
| `Ctrl+l` + Enter | Force `link` |
| `Shift+Enter` | Force `create-in` (create new child under target) |
| `Escape` | Cancel |

The verb is shown in the footer: `[goto] Enter to confirm · Ctrl+m move · Ctrl+l link · ⇧Enter create-in · Esc cancel`. Override keys update the footer live so the user sees which verb will run.

**Why Ctrl+ for overrides**: `Ctrl+g`, `Ctrl+m`, `Ctrl+l` don't conflict with text input inside the omnibox, and the parallel with the opening chord (`g` → `Ctrl+g`) is easy to remember.

**Why Shift+Enter = create-in**: Inside the omnibox scope, Shift+Enter has no conflicting meaning (the board-layer bindings for `search_replace.prev`, `text.child_block`, and `enter_body_edit` are shadowed by `dialog:omnibox`). Create-in is the action a user reaches for when the result list doesn't contain what they want — Shift+Enter reads naturally as "Enter, but new". "Open in new pane" is deferred from v1; if added later, `Cmd+Enter` is the candidate.

### Cursor as default target

When the omnibox opens, the currently-cursored board node becomes the **pre-selected first result** (unless the sigil filters it out). This means:

- `g` → omnibox opens with empty buffer, cursor's parent project pre-selected → Enter goes to current cursor (effectively "re-focus"). Not that useful alone, but the pattern matters for other verbs.
- `m` → omnibox opens, cursor-adjacent move-target suggestions pre-filled → Enter moves selection to most likely target.
- `l` → omnibox opens, cursor's siblings pre-filled → Enter links to current cursor context.
- `a` → opens with tag input ready, current tags filtered out.

This is the biggest ergonomic win over the current design: **the default operation is "do the verb against the most likely target"**, not "open an empty box and search from scratch".

## Opening the omnibox

| Chord | Default verb | Default sigil |
|---|---|---|
| `cmd-k` / `ctrl-k` | (auto — command for `:`, goto for nodes) | *(none — universal)* |
| `g @` | goto | `@` |
| `g #` | goto | `#` |
| `g +` | goto | `+` |
| `g [` | goto | `[` |
| `g :` | run | `:` |
| `g g` | goto | *(none — cursor pre-filled)* |
| `m @` | move | `@` |
| `m +` | move | `+` |
| `a @` | add | `@` |
| `a #` | add | `#` |
| `l g` | link | *(none — cursor pre-filled)* |
| `c @` | create-in | `@` |

All chords converge on the same component with different `{verb, sigil}` initial state.

## State machine

```
                     open(verb, sigil)
       closed ─────────────────────────▶ open
         ▲                                 │
         │   close()                       │ key events
         │                                 ▼
         └──────────────────── confirm(verb, result)
                                           │
                                           ▼
                                      dispatch op
```

States:

- **closed** — no omnibox visible. All keys route to the board.
- **open** — omnibox mounted, dialog mode is `dialog:omnibox`, input has focus.

Actions:

```ts
type OmniboxOp =
  | { type: "OPEN"; verb: Verb; sigil?: string; preselect?: NodeId }
  | { type: "CLOSE" }
  | { type: "INPUT"; buffer: string }
  | { type: "NAV_UP" | "NAV_DOWN" | "NAV_HOME" | "NAV_END" }
  | { type: "SET_VERB"; verb: Verb }            // ctrl+g/m/l override
  | { type: "CONFIRM" }                         // dispatches verb + selected result
  | { type: "CANCEL" }
```

The reducer lives in `@km/board` or a new `packages/km-tui-omnibox/` package. React components subscribe via `useSignal`.

**Invariants**:
- If `open`, the first character of `buffer` (or `null` if empty) uniquely determines the search mode.
- If `open`, `selectedResultIndex` is in `[0, results.length)` or `null` when `results` is empty.
- Opening with `preselect` sets `selectedResultIndex` to the index of that result if present.
- Closing always clears `buffer`, `results`, `selectedResultIndex`, and pops the dialog mode.

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

### Phase 5 — unified component
New `Omnibox` component (single file, ~300 lines). Replaces `Omnibox.tsx` + `ItemPicker.tsx` + `FavoritesDialog.tsx`. Same dialog modes, new internal shape: one node-keyed result list. Old components become thin wrappers that forward to the new one for one release, then get deleted. Supports `placement: "center"` only in this phase.

### Phase 6 — verb system
Implement the verb override keys (`Ctrl+Enter` = goto, `Shift+Enter` = create-in, `Ctrl+g/m/a/l + Enter`, etc.). Update the chord bindings (`cmd-k`, `g`/`m`/`a`/`l`/`c` chords) to route to the unified component with the right `{verb, sigil}` initial state.

### Phase 7 — cursor pre-select
Teach the omnibox to read cursor state on open and set `preselect` appropriately. Feature-flag behind a config option for the first release in case it's confusing.

### Phase 8 — `/` local find, `placement="bottom-left"`
Add the `bottom-left` placement. Wire `/` to open the omnibox with `{ verb: "find", sigil: "/", placement: "bottom-left" }`. Replace `apps/km-tui/src/views/FindBar.tsx` with the omnibox in local-find mode. In-place match highlighting comes from the existing find-bar plumbing — only the box itself moves.

### Phase 9 — shelves
Delete legacy code (`Omnibox.tsx`, `ItemPicker.tsx`, `FavoritesDialog.tsx`, `FindBar.tsx`, `CommandBox.tsx`, old command-registry adapter). Update docs. Update keybindings reference. Add integration tests for each chord path.

Each phase is independently shippable. Phase 1+2 can ship together — they're pure refactors with test support. Phase 3+4 can ship together (they enable each other). Phase 8 is pure win once Phase 5 is merged.

## Out of scope

- **Autocompletion inside card titles**. That's the inline editor, not the omnibox.
- **Find-in-page**. `/` stays on the local-find bar for now; could be folded in later via the `/` sigil.
- **Multi-select inside the omnibox**. Future. Today the omnibox picks one thing; multi-select for "add tag to all selected tasks" is the existing multi-selection flow before opening.
- **Graph / tree visualizations**. The omnibox is a flat result list.

## Open questions

1. **Where does "recent" live?** Per-verb recency (recent goto targets, recent moves) or global? Leaning global — one MRU list ranked by the ranker with a recency bonus.
2. **How does create-in work inline?** User types `+newproject` → no existing match → Enter with `create-in` verb creates a new project node. Do we need a visible "(create)" row to make it explicit? Probably yes.
3. **Should commands take arguments?** `:move-to +km` = move with target? Could extend later — for now, `:` is for zero-arg commands, verbs handle targeted ops.
4. **Does Universal mode show commands?** Yes, but they rank lower than nodes (type weight 0.4 for commands in Universal, 1.0 in `:` mode). Commands appear at the bottom of an unfiltered universal list.
5. **Keyboard-only modifiers for override**: `Ctrl+g` works on most terminals with Kitty keyboard enabled. For legacy terminals (no Kitty), the override system needs a fallback — probably `Tab` cycling through verbs, or a visible verb chip the user can click/tab to.

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
