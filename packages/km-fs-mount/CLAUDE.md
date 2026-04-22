# km-fs-mount

Filesystem mount layer — the code that projects a km repo onto (and back from) a real directory on disk. Owns the `fs/` utilities (path resolution, CAS, ignore patterns, FileTree abstraction), the `watch/` subsystem (watcher, reconcile, sync, writequeue, echo-guard, safe-write), and the FS-backed `Store` (`createFsStore`).

See the repo root [CLAUDE.md](../../CLAUDE.md) and [docs/architecture.md](../../docs/architecture.md) for where this package sits in the layer stack. km-fs-mount sits **beside** `@km/storage` — storage is backend-agnostic (memory + sqlite), fs-mount is the node:fs-dependent backend + sync machinery.

## Before working in km-fs-mount

**Read first, in this order:**

1. [`docs/architecture.md`](../../docs/architecture.md) — fs-mount is the FS boundary; @km/storage never imports `node:fs` directly (transitively through this package instead)
2. [`packages/km-storage/CLAUDE.md`](../km-storage/CLAUDE.md) — the invariants this package must preserve when projecting changes
3. [`docs/design/model/knode.md`](../../docs/design/model/knode.md) — the shape this package materializes from `.md` files
4. [`src/watch/README.md`](src/watch/README.md) — the watch subsystem's internal protocol (ownership, echo suppression, reconciliation, heartbeat)

**Do NOT reimplement:**

- Markdown parsing or serialization — that's `@km/markdown`. fs-mount consumes km-ast.
- Database operations — that's `@km/storage`. fs-mount composes `BaseStore`, `Emitter`, and friends.
- KNode/Change/Edge types — defined in `@km/core`.

**km-fs-mount invariants:**

- Filesystem is the source of truth for content; the in-memory DB inside `createFsStore` is a cache.
- Writes go through `WriteQueue` + `safe-write` + `echo-guard` — never `writeFileSync` directly from a handler; bypassing the write pipeline drops ownership tokens and breaks conflict detection.
- Watcher echoes (our own writes coming back via the watcher) MUST be suppressed via `echo-guard`.
- After materialization or reconciliation changes, users must delete `.km/state.db` to resync — flag this in the bead and commit message.

**Anti-patterns specific to km-fs-mount:**

- Direct `node:fs` writes that bypass WriteQueue — breaks echo suppression and conflict detection
- Reading `.md` files directly instead of going through `@km/markdown`
- Swallowing filesystem errors — every failure must log and surface via the emitter / toast channel
- Leaking `node:fs` types across the `@km/storage` boundary — fs-mount is the containment boundary for filesystem concerns
