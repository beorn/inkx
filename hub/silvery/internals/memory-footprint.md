# Memory Footprint: Silvery vs Ink

Silvery trades higher resident memory for lower per-frame GC pressure. This is the right tradeoff for interactive TUIs where smooth frame timing matters more than peak RSS.

## Per-Node Memory

| Component             | Silvery                   | Ink               | Notes                                                       |
| --------------------- | ------------------------- | ----------------- | ----------------------------------------------------------- |
| Node structure        | ~350 bytes                | ~150 bytes        | AgNode has dirty flags, boxRect, prevLayout, layoutNode ref |
| Reactive state        | ~600 bytes                | 0                 | 14 signals + 8 computeds per node (WeakMap, GC'd with node) |
| PreparedText cache    | ~300-1500 bytes/text node | 0                 | Collected text + format LRU (4 widths). Only text nodes.    |
| Layout node (Flexily) | ~200 bytes                | ~200 bytes (Yoga) | Similar — flexbox state per node                            |

## Shared/Global Memory

| Component                  | Silvery            | Ink           | Notes                                                                               |
| -------------------------- | ------------------ | ------------- | ----------------------------------------------------------------------------------- |
| Terminal buffer (current)  | W×H×~40 bytes      | W×H×~20 bytes | Silvery: full cell (char, fg, bg, attrs, wide, cont, hyperlink). Ink: simpler cell. |
| Terminal buffer (previous) | W×H×~40 bytes      | 0             | Clone for incremental rendering. Ink re-renders from scratch.                       |
| displayWidth LRU           | ~1MB (10K entries) | 0             | Shared cache across all text measurement. 45x speedup.                              |
| Style intern cache         | ~50KB              | 0             | ~50 unique styles × SGR strings + ~2500 transition pairs                            |

## Real-World Estimates

For a 500-item board at 120×40 terminal:

| Metric                    | Silvery (with PreparedText)          | Ink                            |
| ------------------------- | ------------------------------------ | ------------------------------ |
| **Resident (persistent)** | ~5-6MB                               | ~1.5-2MB                       |
| **Per-frame GC pressure** | ~0.5MB (only dirty nodes allocate)   | ~5-10MB (full string rebuild)  |
| **Peak during render**    | ~6-7MB                               | ~12-15MB                       |
| **GC pause frequency**    | Low (incremental, small allocations) | High (large temporary strings) |

## Tradeoff Analysis

Silvery uses **3-4x more resident memory** but **10-20x less GC pressure per frame**.

### Why this matters for TUIs

Interactive TUIs render at 30-60fps during keyboard/mouse interaction. Under sustained input:

- **Ink**: Every frame allocates 5-10MB of temporary strings (React render → Yoga layout → string output). V8's generational GC handles this well in isolation, but under sustained 60fps input, young-gen collections pile up and cause frame drops.

- **Silvery**: Dirty-node rendering means only 2 nodes allocate during cursor move (~10KB). The persistent caches (buffers, PreparedText, displayWidth LRU) are long-lived and don't trigger GC. Frame timing is stable.

### PreparedText cache memory impact

PreparedText adds ~150-750KB for a 500-item board (depending on text complexity):

| Cache level               | Per text node  | Total (500 nodes) | Invalidation                     |
| ------------------------- | -------------- | ----------------- | -------------------------------- |
| L0: plain text            | ~50-200 bytes  | ~25-100KB         | Content/children change          |
| L1: collected text + bg   | ~200-800 bytes | ~100-400KB        | Content/children/style/bg change |
| L2: format LRU (4 widths) | ~100-500 bytes | ~50-250KB         | Cleared when L1 invalidates      |

The LRU cap (4 entries per node) bounds worst-case memory. Terminal widths are integers, so the LRU covers normal resize oscillation (80↔120 cols) without eviction.

### When memory matters

- **Embedded/constrained environments**: Silvery's 5-6MB baseline is fine for desktop terminals. For embedded or WebAssembly targets, the buffer clone and reactive state may need optimization.
- **Thousands of nodes**: At 10,000+ nodes, reactive state (~6MB) becomes significant. The signals-ag-bridge (P2) could reduce this by lazily creating signals only for visible nodes.
- **Long text**: PreparedText L1 stores the full ANSI-styled text string. For nodes with 10KB+ text, the cache doubles memory for that node. The invalidation ensures stale caches are GC'd.

## Measurement

No runtime measurement infrastructure yet. To add:

- `SILVERY_MEM_STATS=1` — log per-phase memory delta via `process.memoryUsage()`
- Per-node cache size tracking in PreparedText (optional instrumentation)
- Buffer memory: `buffer.width * buffer.height * CELL_SIZE * 2`
