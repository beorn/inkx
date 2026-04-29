---
id: "@km/_orphan/flexx-zero-alloc"
aliases:
  - km-flexx-zero-alloc
created_at: 2026-01-30T20:33:59Z
closed_at: 2026-01-30T21:35:54Z
assignee: claude:227cdc41
---

# [x] [flexx] Zero-allocation layout passes via node-stored flex info @km/_orphan #task #P1 @claude:227cdc41

## Summary

**Problem:** High-frequency TUI rendering (60+ fps) creates GC pressure from temporary objects allocated during each layout pass. The classic flexbox algorithm allocates:
- `ChildLayout` objects for each child during flex distribution
- `FlexLine[]` arrays for flex-wrap support
- Temporary arrays during filtered iteration (absolute vs relative children)

**Solution:** Store all intermediate layout state directly on Node objects and use pre-allocated module-level arrays, eliminating per-pass heap allocations.

**Result:** 1.75-2x faster than Yoga for flat layouts, but 29-45x slower for deep hierarchies due to algorithmic inefficiencies (not allocation).

---

## Status: Complete - Available as `@beorn/flexx/zero`

The zero-allocation layout engine is now a separate export, allowing users to choose between classic and optimized algorithms.

## What Was Built

### Dual Algorithm Architecture

```
@beorn/flexx           → Classic algorithm (ChildLayout objects, FlexLine arrays)
@beorn/flexx/zero      → Zero-alloc algorithm (FlexInfo on nodes, pre-allocated arrays)
```

**Files created:**
- `src/layout-zero.ts` - Zero-alloc layout algorithm
- `src/node-zero.ts` - Node with FlexInfo struct
- `src/index-zero.ts` - Entry point for `/zero` subpath
- `docs/ZERO_ALLOCATION.md` - Design documentation

### inkx Integration

```typescript
// Engine selection via env var or option
INKX_ENGINE=flexx       // Classic (default)
INKX_ENGINE=flexx-zero  // Zero-allocation
INKX_ENGINE=yoga        // Yoga WASM
```

**Files created:**
- `src/adapters/flexx-zero-adapter.ts`
- Updated `src/layout-engine.ts` with `LayoutEngineType = 'flexx' | 'flexx-zero' | 'yoga'`

## How Zero-Alloc Works

### 1. FlexInfo on Nodes (instead of ChildLayout objects)

**Before (classic):** Each layout pass creates temporary objects:
```typescript
const childLayouts: ChildLayout[] = children.map(child => ({
  node: child,
  mainSize: 0,
  baseSize: computeBaseSize(child),
  flexGrow: child.style.flexGrow,
  // ... 10+ more fields
}));
```

**After (zero-alloc):** Mutate persistent struct on each node:
```typescript
// Node has: _flex: FlexInfo (created once, reused every pass)
child.flex.mainSize = 0;
child.flex.baseSize = computeBaseSize(child);
child.flex.flexGrow = child.style.flexGrow;
```

### 2. Pre-allocated Line Arrays (instead of FlexLine[])

**Before (classic):**
```typescript
const lines: FlexLine[] = [];
lines.push({ children: [...], crossSize: 0 });
```

**After (zero-alloc):**
```typescript
// Module-level typed arrays (allocated once at load)
let _lineCrossSizes = new Float64Array(32);
let _lineCrossOffsets = new Float64Array(32);
let _lineLengths = new Uint16Array(32);

// Each child stores its line index
child.flex.lineIndex = currentLineIdx;
```

### 3. Filtered Iteration (instead of filter())

**Before (classic):**
```typescript
const relativeChildren = children.filter(c => !isAbsolute(c) && !isHidden(c));
```

**After (zero-alloc):**
```typescript
// relativeIndex set during initial scan: -1 = skip, 0+ = include
for (const child of children) {
  if (child.flex.relativeIndex < 0) continue;
  // process...
}
```

## Benchmark Results

| Scenario | Flexx Classic | Flexx Zero | Yoga WASM |
|----------|--------------|------------|-----------|
| **Flat 500 nodes** | 1x | **1.75-2x faster** | ~0.9x |
| **Deep 50 levels** | 1x | 0.7x (slower) | **29-45x faster** |
| **Kanban TUI** | 1x | ~1.1x faster | ~1.7x faster |

**Key insight:** Zero-alloc excels at flat, wide layouts but struggles with deep hierarchies. The slowness is NOT from allocation - it's from algorithmic inefficiencies identified below.

## Root Cause Analysis (O3 Deep Research)

Why deep hierarchies are slow:

1. **O(N×L) child scanning** - `distributeFlexSpaceForLine()` scans ALL children for EACH line instead of using line boundary indices
2. **No caching** - Every layout recalculates everything, no memoization
3. **No incremental layout** - Full tree recalc even for single-node changes
4. **JS recursion overhead** - Deep recursion slower than C++ native

## Improvement Roadmap

### P0: Line Boundary Indices (Low effort, High impact)
Store line start/end indices during `breakIntoLines()` to eliminate O(N×L) scanning.

```typescript
// Current: O(N×L) - scans all children per line
for (const child of allChildren) {
  if (child.flex.lineIndex === currentLine) { ... }
}

// Improved: O(N) - direct access via indices
const start = _lineStarts[lineIdx];
const end = start + _lineLengths[lineIdx];
for (let i = start; i < end; i++) { ... }
```

### P1: Dirty-flag Incremental Layout (Medium effort, Very High impact)
Mark nodes dirty on style/content change, propagate up, skip clean subtrees.

### P2: Measure Result Caching (Low effort, Medium impact)
Cache `(availW, availH) → (computedW, computedH)` per node.

### P3: Special-case Single-child (Low effort, Medium impact)
Skip flex distribution for containers with one child.

### P4: Iterative Traversal (High effort, Medium impact)
Replace recursion with explicit stack for better JIT optimization.

## Design Details

### FlexInfo Struct (14 fields, stored on Node)

```typescript
interface FlexInfo {
  mainSize: number;           // Current main-axis size
  baseSize: number;           // Original base size (for weighted shrink)
  mainMargin: number;         // Total main-axis margin (non-auto)
  flexGrow: number;           // Cached flex-grow
  flexShrink: number;         // Cached flex-shrink
  minMain: number;            // Min constraint
  maxMain: number;            // Max constraint
  frozen: boolean;            // Frozen during distribution
  lineIndex: number;          // Which flex line
  relativeIndex: number;      // -1 if absolute/hidden, else position
  mainStartMarginAuto: boolean;
  mainEndMarginAuto: boolean;
  mainStartMarginValue: number;
  mainEndMarginValue: number;
}
```

### Pre-allocated Arrays (768 bytes total)

```typescript
let _lineCrossSizes = new Float64Array(32);   // 256 bytes
let _lineCrossOffsets = new Float64Array(32); // 256 bytes
let _lineLengths = new Uint16Array(32);       // 64 bytes
let _lineChildren: Node[][] = [...];          // 32 empty arrays
```

## Test Results

- **flexx tests:** 87 pass, 8 fail (known edge cases, same as classic)
- **inkx tests (flexx-zero):** 1129 pass, 4 fail
- **inkx tests (flexx):** 1127 pass, 6 fail
- **km tests:** 2368 pass (all pass)

## Commits

- flexx: `c6d7fc1` - feat: add zero-allocation layout engine as subpath export
- inkx: `8227e70` - feat: add flexx-zero layout engine option
- km: `e49ca713` - chore(vendor): update flexx/inkx with zero-alloc layout engine

## Next Steps

1. **P0 fix** would close most of the gap with Yoga on deep hierarchies
2. **P1 incremental layout** would make flexx competitive across all scenarios
3. Consider making `flexx-zero` the default once P0/P1 are implemented