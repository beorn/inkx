# Lesson: We Were Optimizing the Wrong Thing (2026-04-10)

## The Bug

We spent an entire session optimizing React reconciliation, tree traversal, and dirty flags — while the actual bottleneck was creating 80,000 Cell objects every frame that nobody reads.

## What Happened

`createTextFrame(buffer)` in `buffer.ts` was doing three things eagerly:
1. **Clone the buffer** — deep-copy for immutability (~0.08ms at 80K cells)
2. **Create Cell objects** — `buffer.getCell(x, y)` for every cell (~10ms at 80K cells)
3. **Lazy text/ansi** — these were already lazy (good)

The Cell object creation dominated. At 80×24 (1,920 cells), the cost was ~0.3ms — invisible. At 400×200 (80,000 cells), it was ~10ms — the entire frame budget.

## Why We Didn't Catch It

1. **Benchmarks ran at 80×24** — the cost was in the noise. Only the 400×200 benchmark exposed it.
2. **Profiling attributed it to "React reconciliation"** — the timing bucket included both React work and frame creation. We assumed React was the bottleneck.
3. **The diagnostic bench revealed it** — "no-change rerender" (every component bails out) cost the same as cursor move. If React were the bottleneck, no-change would be near-zero. It wasn't.

## The Fix

Make everything lazy:

```typescript
// Before: eager clone + 80K Cell objects every frame
const snapshot = buffer.clone()
const cellData = new Array(width * height)
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++)
    cellData[y * width + x] = snapshot.getCell(x, y)

// After: lazy — only compute when accessed
let _snapshot: TerminalBuffer | undefined
function getSnapshot() { return _snapshot ??= buffer.clone() }
let _cellData: Cell[] | undefined
function getCellData() { ... build on first cell() access ... }
```

## Impact

| Scenario | Before | After | Speedup |
|---|---|---|---|
| 100 items, 80×24 | 0.37ms | 0.15ms | 2.4× |
| 1000 items, 80×24 | 3.5ms | 1.5ms | 2.3× |
| 1000 items, 400×200 | 14.8ms | 2.0ms | 7.5× |
| vs Ink ratio | 5-6× | **15-16×** | |

## The Real Lesson: We Were Measuring the Wrong Thing

We spent hours optimizing React reconciliation (reactive cascade, PreparedText cache, dirty flags) because profiling said "React reconciliation: 87%." But that 87% included `createTextFrame` — a non-React operation that happened to run inside the same timing bucket.

**We were optimizing the pipeline when the bottleneck was the snapshot.**

### How to avoid this next time

1. **Measure at realistic sizes.** The 80×24 bench hid a O(cells) cost that dominated at 400×200. Always benchmark at the user's actual terminal size.

2. **Use the diagnostic bench pattern.** Compare "no-change rerender" (every component bails out) vs "cursor move." If they cost the same, the bottleneck is NOT in React — it's in per-frame overhead that runs regardless of what changed.

3. **Question attribution.** When a timing bucket says "React reconciliation: 87%," ask: what ELSE runs in that bucket? The measurement boundary may not match the architectural boundary.

4. **Lazy beats eager for derived data.** If you create data that the consumer might not read, defer the creation. The 80K Cell objects were read by tests and STRICT mode — never by production rendering.

5. **The most impactful optimization is often the dumbest one.** Not a clever algorithm change. Not reactive signals. Just: stop doing expensive work nobody asked for.
