# @km/reactive-tree

Per-node signals + tree-scoped computeds. A materialized-view engine over any
duck-typed tree, backed by alien-signals. Extracted from `apps/km-tui/src/state/reactive-graph.ts`
in April 2026 (bead `km-all.reactive-tree-extract`).

See the repo root [CLAUDE.md](../../CLAUDE.md), [docs/architecture.md](../../docs/architecture.md),
and [docs/lessons/reactive-tree.md](../../docs/lessons/reactive-tree.md) for the
engine's history and the three rewrites that got us here.

## Before working in reactive-tree

**Read first, in this order:**

1. [`docs/lessons/reactive-tree.md`](../../docs/lessons/reactive-tree.md) — v1 → v2 → v3 history, why the DSL survived and the engine didn't
2. [`docs/principles.md`](../../docs/principles.md) — factory functions, `using` cleanup, no classes, no globals
3. [`README.md`](./README.md) — the public API and engine classification

**Do NOT reimplement:**

- A second reactive engine next to this one. alien-signals `computed()` is the dependency tracker; this package is the tree-classification layer on top of it. If you need a new aggregate shape, add it to the descriptor classifier in `src/index.ts`, don't build a parallel engine.
- Per-node bookkeeping Maps that shadow the existing `sparseIndices`. The sparse-ancestor index is the single source of truth for `descendants(...).some()/.count()` — extend it, don't fork it.

**Invariants:**

- **No km-specific types**: this package is infrastructure. It knows nothing about KNode, boards, columns, or markdown. The only public types are `Traversal`, `TreeDSL`, `ReactiveTree`, `NodeAccessor`.
- **Downward dependency only on alien-signals.** Not React, not vitest runtime, not any `@km/*` package. If an import creeps in, the package belongs elsewhere (probably `apps/km-tui/src/state/`).
- **Factory functions, no classes.** Same rule as the rest of km.
- **rebind() preserves node identity.** Do not clear `nodes` on rebind — React components subscribed via `useSignal` hold references to signal instances that must survive topology changes. Only the tree-walking computeds are invalidated (via `treeVersion`).
- **Atomicity under batch.** Every index mutation path (`indexSet`, `clear`, `rebind`) wraps its writes in `runBatch` so observers see one combined update, not a half-applied state. Every indexed signal wrapper reads via `runUntracked` so the wrapper's own truthiness check doesn't leak into a caller's dependency set.

**Anti-patterns specific to this package:**

- Importing React, zustand, or anything DOM-adjacent — this package is pure reactive plumbing
- Clearing `nodes` on rebind to "keep things tidy" — breaks subscriptions (see the Invariants section above)
- Adding a new descriptor shape without a sparse-index strategy **and** a walk fallback — the engine must work for dense and sparse signals; pick the right strategy in the classifier, don't punt to walks for everything
- Reusing `descendants(...).some()` for cases where you actually want `.count()` or `.reduce()` — the semantics are different and the sparse index is tuned for membership, not values

**Tests:**

- `tests/reactive-tree.test.ts` — full behavioral coverage (signals, some/count/reduce, includeSelf, rebind, atomicity, re-entrancy, bootstrap)
- `tests/reactive-tree-perf.bench.ts` — microbench asserting O(depth) writes on 100K-descendant columns

Run from the km repo root:

```bash
bun vitest run packages/reactive-tree/tests/
```

## Planned work (tracked in beads)

- **Phase 3** (`km-all.reactive-tree-library` design): first-class topology events replacing `rebind()` with a streaming delta protocol. Not scheduled — only worth building once a second consumer forces the API shape.
- **Phase 4**: strategy adapters (dense/unique/singleton). Additive; same DSL, different indices.
- **Vendor promotion**: move to `vendor/reactive-tree/` as a git submodule once a non-km consumer exists. The package is already structured to survive that move (no `@km/*` imports, no monorepo paths inside).
