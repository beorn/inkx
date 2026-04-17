# km-commands

The command layer — every discrete key, menu item, and omnibox entry that mutates state. Commands are serializable records dispatched to the board reducer as actions.

See the repo root [CLAUDE.md](../../CLAUDE.md) and [docs/architecture.md](../../docs/architecture.md) for the Commands layer's role. See [docs/lessons/input-architecture.md](../../docs/lessons/input-architecture.md) for why discrete keys must go through this package.

## Before working in km-commands

**Read first, in this order:**

1. [`src/`](src) — **list the existing commands** before adding a new one. Commands are cheap to duplicate by accident; grep for similar names and verb roots (`move`, `fold`, `toggle`, `insert`).
2. [`docs/design/model/knode.md`](../../docs/design/model/knode.md) and [`docs/design/selection-model.md`](../../docs/design/selection-model.md) — commands operate on `Selection.nodes(ctx)`, never on a single "current node"
3. [`docs/lessons/input-architecture.md`](../../docs/lessons/input-architecture.md) — why components must not handle discrete keys themselves
4. [`docs/design/tea-state-machines.md`](../../docs/design/tea-state-machines.md) — commands are TEA actions; they must stay serializable and pure

**Do NOT reimplement:**

- Node-tree operations — use `@km/tree` primitives; commands compose them, they don't rebuild them
- Selection logic — always `Selection.nodes(ctx)`, never "if one thing selected else many"
- Side effects inline — emit effects from the reducer; don't do I/O inside a command handler
- A second command registry — everything goes through this package's registry so the omnibox, key router, and menu all see the same universe

**km-commands contracts:**

- A command is `(ctx, args) → Action[] | Effect[]`. No hidden state, no module-level singletons.
- Every command is serializable — args are plain data, no closures, no functions, no class instances. This is what lets the AI automation and replay layers drive km.
- Before adding a new command, check the existing registry for a command that already does the job with different args. Prefer parameterizing an existing command over creating a near-duplicate.
- Before adding a new op primitive, check `@km/tree` and existing commands for a composition that covers the case.
- Multi-selection is free if you use `Selection.nodes(ctx)` — never special-case "single item".

**Anti-patterns specific to km-commands:**

- Commands that branch on view mode (cards/columns/tabs) — view mode lives in board state; the command operates on nodes
- Commands that call UI component methods — commands return data, components interpret it
- Non-serializable args (functions, refs, Maps, Dates) — use string IDs, plain objects, and ISO strings
- Duplicate command names with different args — parameterize instead of forking
