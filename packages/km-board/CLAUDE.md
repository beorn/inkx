# km-board

The board state machine — columns, cards, sub-items, cursor, selection, folding, view modes. Pure `(action, state) → [state, effects]` reducer above `@km/tree` and `@km/storage`.

See the repo root [CLAUDE.md](../../CLAUDE.md) and [docs/architecture.md](../../docs/architecture.md) for the Board layer's role.

## Before working in km-board

**Read first, in this order:**

1. [`docs/design/model/knode.md`](../../docs/design/model/knode.md) — KNode, items vs blocks, board hierarchy (column/card/sub-item roles are **positional**, not typed)
2. [`docs/design/ui/selection.md`](../../docs/design/ui/selection.md) — canonical selection semantics, `Selection.nodes(ctx)`, multi-select contracts
3. [`docs/design/tea.md`](../../docs/design/tea.md) — the TEA pattern every km state machine follows
4. [`docs/design/ui/visibility.md`](../../docs/design/ui/visibility.md) and [`docs/design/ui/navigation.md`](../../docs/design/ui/navigation.md) — how folding and view modes interact with cursor movement

**Do NOT reimplement:**

- Node tree traversal / mutation primitives — that's `@km/tree`
- Markdown or storage concerns — the board reducer never touches `.md` strings or SQLite
- Selection primitives — use `Selection.nodes(ctx)` from the selection module, never hand-roll "cursor or selected" logic per command
- A second state-machine pattern — board uses TEA (`(action, state) → [state, effects]`); if you need events, emit them as effects

**Board invariants the reducer must maintain:**

- State transitions are pure. No I/O, no timers, no `Date.now()` — everything side-effecting becomes an effect.
- Actions and effects are serializable data — they must survive JSON round-trip so we can replay, record, and drive the board from AI automation.
- The cursor is always valid for the current view: if a node is folded away or filtered out, the reducer must move the cursor to a visible anchor.
- Folding precedence: selection > card > column > root. Commands operate on this hierarchy, not on whatever happens to be "hovered".
- All node-ops handle multiple selection by design — never branch on "single vs multi" inside a command; take `Selection.nodes(ctx)` and loop.
- The hidden-descendant count (`+N`) is recursive. Changes to the tree shape must update counts across all ancestors.

**Anti-patterns specific to km-board:**

- Storing derived state in the reducer — recompute from base state; see [`docs/design/omnibox.md`](../../docs/design/omnibox.md) for the "derived vs base" split
- Board commands reaching into TUI components — commands return effects; components interpret them
- Typing sub-items as a distinct node kind — the role is positional, not a type (see data-model.md)
