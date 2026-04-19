# Reactive Tree — Design Journey & Lessons Learned

> From 500-line custom engine to 160-line computed wrapper. The API was right, the implementation was wrong.

## Timeline

1. **v1 (session start)**: Count-based engine with string keys, manual batch, delta propagation
2. **v2**: Function-accessor API (`s => s.cursor`), `primary()` descriptors, `.reduce()`, walk coalescing
3. **v3**: Realized alien-signals computed() already does what we built. Rewrote as computed wrapper.

## The Key Insight

We built a 500-line engine to maintain per-node cached aggregates with incremental updates. Then we benchmarked against alien-signals `computed()` and found it was **5-38x faster** at our scale — because alien-signals does dependency tracking, caching, batching, and equality in native code.

Our engine reimplemented all of that in JavaScript:
- Manual dependency tracking → alien-signals tracks automatically
- Manual count-based caching → computed() caches automatically  
- Manual walk coalescing → alien-signals batches evaluations
- Manual delta propagation → computed recomputes the truth

## Why We Over-Engineered

1. **Designed from theory, not tools.** The design doc started from database materialized views, complexity contracts, counts-not-booleans. Never asked: "does our signal library already do this?"

2. **Premature optimization of architecture.** We assumed O(1) reads required a custom engine. But computed() gives O(1) reads too (cached after first computation). The optimization was solving a problem that didn't exist.

3. **Didn't benchmark the naive approach.** Built 500 lines before measuring if the simple way was fast enough. The simple way was faster.

4. **String keys locked us into custom machinery.** The v1 string-key API (`defineReduced("cursorDescendant", ...)`) couldn't leverage computed() because there was no typed per-node signal to depend on. Once we added `signal(false)` per node (v2), computed() became possible — but we didn't re-evaluate the engine.

## Lessons

### 1. Benchmark the simple thing first

Before building custom machinery, write the naive version (computed + tree walk) and benchmark it. If it's fast enough — ship it. If not, you have a baseline to optimize against.

### 2. Know your tools

alien-signals `computed()` is not a toy. It's a production-grade reactive engine with native-code performance. Understanding what it provides (dependency tracking, caching, batching, topological ordering) would have prevented 470 lines of reimplementation.

### 3. The API design was right

`tree.descendants(s => s.cursor).some()` reads as English. The DSL survived all three versions unchanged. The consumer API was right from v1. Only the implementation changed.

### 4. Counts-not-booleans was solving a delta problem

Our count-based approach (keep a count, not a boolean, to handle "remove one of two") solves a problem that only exists with delta-based updates. Computed signals don't have deltas — they recompute the truth. The problem disappears with the right abstraction.

### 5. Signals world means signals all the way

If you're in a signals-based system, use signals for everything. Don't build parallel machinery. `signal()` for sources, `computed()` for derived values, `effect()` for side effects. That's the complete vocabulary.

### 6. Custom `primary()` was unnecessary

We invented `primary(false)` as a descriptor — but `signal(false)` already IS the right thing. The definition-time signal is a template read once for its initial value. No wrapper needed.

## The Final Architecture

```
signal(false)                              → writable per-node state
tree.descendants(s => s.cursor).some()     → computed that walks the tree
{ parent, children }                       → duck-typed traversal (any structure)
createTree((tree) => schema, traversal)  → factory binding schema to structure
```

160 LOC. Zero new concepts. Same DSL. 5-38x faster.

## Perf Numbers

Engine benchmark (cursor move on flat tree):
- 100 siblings: 0.006ms (computed) vs 0.034ms (count engine) — computed 5x faster
- Deep chain 50: 0.006ms vs 0.229ms — computed 38x faster

Full pipeline (200x60, 3700 cards): ~6.6ms/press production (1.6ms pipeline + 5ms React).
Bench reports ~83ms because 78% is SILVERY_STRICT verification overhead.

## Lesson 7: Bench numbers must represent production

We spent multiple sessions investigating a "73-89% output phase bottleneck" that was actually SILVERY_STRICT test verification overhead. The bench inflated numbers by 12x (83ms bench vs 6.6ms production). We created beads, planned work, and ran Pro reviews based on wrong numbers.

**Root cause chain**: bench reuses vitest setup which forces STRICT=1 → bench numbers confirmed gut feel ("felt sluggish") → nobody questioned whether bench = production → no principle requiring bench to match production conditions.

**Fix**: `bun bench` now sets `SILVERY_STRICT=0`. Added to principles.md: "Benchmarks measure production — bench numbers must represent what users experience."

**Rule**: always verify that your measurement tool isn't measuring its own overhead.

## See Also

- `vendor/bearly/packages/alien-trees/src/index.ts` (published as `alien-trees` on npm) — the computed engine (extracted from `apps/km-tui/src/state/reactive-graph.ts` in April 2026)
- `docs/design/ui/rendering.md` — design doc (API, semantics, migration)
- `docs/design/ui/rendering.md` — visual treatment matrix
