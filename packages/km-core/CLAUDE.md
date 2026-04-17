# km-core

The shared core — types, invariants, and pure helpers that every other km package consumes. The bottom of the layer stack: km-core depends on nothing else in km.

See the repo root [CLAUDE.md](../../CLAUDE.md) and [docs/architecture.md](../../docs/architecture.md) for the Core layer's role.

## Before working in km-core

**Read first, in this order:**

1. [`docs/design/model/knode.md`](../../docs/design/model/knode.md) — the canonical KNode shape, items vs blocks, what belongs in core
2. [`docs/glossary.md`](../../docs/glossary.md) — terms of art used across the codebase; align new names with existing ones
3. [`docs/principles.md`](../../docs/principles.md) — factory functions, `using` cleanup, async generators, explicit DI, no classes, no globals
4. [`docs/architecture.md`](../../docs/architecture.md) — core sits at the bottom of the stack; km-core must not import from board, storage, markdown, commands, or tree

**Do NOT reimplement:**

- Types that already live in this package under different names — grep first, rename if needed
- Validators / type guards you can derive from the shape itself — prefer one source of truth
- Utility functions that exist in the standard library or `@km/infra` helpers

**km-core invariants:**

- **Zero downward dependencies**: km-core depends on no other `@km/*` package. If you find yourself reaching for board/tree/storage types, the type probably belongs in `@km/tree` or `@km/board`, not core.
- **Pure**: all functions are pure, no side effects, no I/O. This is the foundation other packages test against.
- **Stable**: every type exported from core is effectively public API. Changes ripple through every package; flag them in the bead and in the commit.
- **Factory functions, not classes**: follow `docs/principles.md`. No `new`, no inheritance, no singletons.

**Anti-patterns specific to km-core:**

- Importing from any other `@km/*` package — core is the bottom of the stack
- Adding "just one" class — km is factory-function-only; this is load-bearing for DI and testing
- Embedding board/view/storage concerns in core types (e.g. "cursor", "visible", "dirty") — those belong in the layers above
- Naming a new type before checking the glossary — prefer existing terminology
