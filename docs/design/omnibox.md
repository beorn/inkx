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

## Model

### Input buffer

The omnibox has a single text buffer. The **first character** selects the search mode:

| First char | Mode | Matches |
|---|---|---|
| `:` | **Command** | Registered commands by id and title (`:save`, `:zoom out`, `:toggle-theme`) |
| `@` | **Context** | Person / assignee / context node (`@delei`, `@bjorn`) |
| `#` | **Tag** | Tag node (`#urgent`, `#review`) |
| `+` | **Project** | Project node (`+km`, `+taxes`) |
| `[` | **Node** | Any node by title / content (fallback — non-sigil full-text search) |
| `/` | *(reserved)* | Find in current document (maybe — not in v1) |
| `>` | *(reserved)* | Jump to heading in current doc (maybe — not in v1) |
| `?` | *(reserved)* | Help — "what does this key do?" inline docs (maybe — not in v1) |
| *(empty)* | **Universal** | Everything, ranked by type |

Backspace through the sigil → `''` → mode becomes **Universal**. Type a different sigil → mode switches. No separate components, no re-open. The mode is a function of the buffer's first character, recomputed on every keystroke.

**Empty-buffer behavior**: when the buffer is empty, show a *suggested* result set (recent nodes, cursor context, default project, "run command" hint). Pressing any key dispatches based on the first character.

### Result types

Every result is one of:

| Type | Rendered as | Primary action |
|---|---|---|
| `command` | `:prefix + command title + keybinding hint` | Run command |
| `node:person` | `@name + role + parent path` | Goto / assign |
| `node:tag` | `#name + usage count` | Goto / tag selection |
| `node:project` | `+name + parent path + status` | Goto / move-in |
| `node:file` | `title + parent path + modified date` | Goto / zoom-in |
| `node:block` | `title + parent breadcrumbs + body preview` | Goto / zoom-in |

All six share the **same row component** — a thin wrapper over `NodeLine`. They differ only in the decoration callback (sigil color, trailing metadata column). That callback is selected by result type.

### Row component

Extract a new `OmniboxRow` that takes:

```ts
interface OmniboxRow {
  id: string                  // stable key
  type: ResultType            // drives decoration
  primary: string             // main label (node title, command title)
  secondary?: string          // parent path, keybinding, tag count
  sigil?: string              // rendered inline at the start (:, @, #, +, [)
  isSelected: boolean
  isCursor: boolean           // current-cursor result, highlighted differently
}
```

`ItemPicker`'s custom rendering, `Omnibox`'s custom rendering, and `FavoritesDialog`'s custom rendering all collapse into this one row. Each call site builds a `ResultType` + row data from its source of results.

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
| `Ctrl+g` + Enter | Force `goto` |
| `Ctrl+m` + Enter | Force `move` |
| `Ctrl+a` + Enter | Force `add` |
| `Ctrl+l` + Enter | Force `link` |
| `Ctrl+Enter` | Force `create-in` |
| `Shift+Enter` | Open target in new pane |
| `Escape` | Cancel |

The verb is shown in the footer: `[goto] Enter to confirm · Ctrl+m move · Ctrl+l link · Esc cancel`. Override keys update the footer live so the user sees which verb will run.

**Why Ctrl+ for overrides**: `Ctrl+g`, `Ctrl+m`, `Ctrl+l` don't conflict with text input inside the omnibox, and the parallel with the opening chord (`g` → `Ctrl+g`) is easy to remember.

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
Create `OmniboxRow` and migrate `ItemPicker`, `Omnibox`, `FavoritesDialog` to use it. No behavior change. Catches divergence bugs.

### Phase 2 — shared ranker
Extract `rankResults(query, results)` with the ranking rules above. Add `omnibox-ranking.test.ts` table. Migrate `ItemPicker.filterOptions` and `Omnibox`'s scorer to use it. Fixes **km-tui.picker-rank-subpath**.

### Phase 3 — unified component
New `Omnibox` component (single file, ~300 lines). Replaces `Omnibox.tsx` + `ItemPicker.tsx` + `FavoritesDialog.tsx`. Same dialog modes, same commands, new internal shape. Old components become thin wrappers that forward to the new one for one release, then get deleted.

### Phase 4 — verb system
Implement the verb override keys. Update the chord bindings to route to the unified component with the right `{verb, sigil}` initial state.

### Phase 5 — cursor pre-select
Teach the omnibox to read cursor state on open and set `preselect` appropriately. Feature-flag behind a config option for the first release in case it's confusing.

### Phase 6 — shelves
Delete legacy code. Update docs. Update keybindings reference. Add integration tests for each chord path.

Each phase is independently shippable. Phase 1+2 can ship together — they're pure refactors with test support.

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
