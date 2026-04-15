# km-storage

SQLite-backed storage layer for km — nodes, edges, materialized views, FTS5 search, link cache. Peer of `@km/tree` (both depend on `@km/core`, neither on each other).

See the repo root [CLAUDE.md](../../CLAUDE.md) and [docs/architecture.md](../../docs/architecture.md) for where this package sits in the layer stack.

## Before working in km-storage

**Read first, in this order:**

1. [`docs/architecture.md`](../../docs/architecture.md) — storage is a peer of tree, below board; UI never touches storage directly
2. [`docs/design/data-model.md`](../../docs/design/data-model.md) — KNode, items vs blocks, what's authoritative vs derived
3. [`docs/design/links.md`](../../docs/design/links.md) — the canonical Link model (URI scheme, rel taxonomy, cache fields). Edit this doc first when changing the link type.
4. [Bun SQLite docs](https://bun.sh/docs/api/sqlite) — km uses `bun:sqlite` (WAL mode, FTS5). Never import `better-sqlite3` or `node:sqlite`.

**Do NOT reimplement:**

- Markdown parsing/serialization — that's `@km/markdown`. Storage consumes km-ast, never touches `.md` strings.
- Node/edge types — defined in `@km/core`. Storage persists them; it does not redefine them.
- Board state or selection — that's `@km/board`. Storage has no opinion about what's visible.

**km-storage invariants:**

- Filesystem remains the source of truth for content; storage is a cache + index. After materialization or reconciliation changes, users must delete `.km/state.db` to resync — flag this explicitly when shipping such a change.
- FTS5 + BM25 ranking is the search contract. Changes to tokenization or ranking must ship with fixtures and a migration plan.
- Migrations are additive whenever possible. Destructive migrations require a bead and a user-visible note.
- Storage functions are pure over the passed-in `Database` handle — no module-level singletons, no hidden globals.
- Event-sourcing-lite is the direction for CRDT compatibility (see memory `storage-crdt-direction.md`). Don't bake in assumptions that block that path.

**Anti-patterns specific to km-storage:**

- Reading or writing `.md` files directly — go through `@km/markdown` and the sync layer
- Embedding business logic (what's a "task"? what's "done"?) in SQL — that belongs in `@km/core` or `@km/board`
- Swallowing SQLite errors — every failure must log and surface to the user (see memory "no silent failures")
