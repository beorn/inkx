---
description: Debug and fix Flexily layout issues — caching, fingerprinting, zero-allocation, performance. Use when Flexily layout is broken or performance degrades.
argument-hint: [symptom] (describe the layout bug, or "bench" for performance workflow)
benefits-from: [recall, tests]
escalate-to: {render: "layout correct but rendering wrong — silvery pipeline issue", arch: "new layout primitive or measure function design"}
---

# Flexily Diagnostic Workflow

**Issue**: $ARGUMENTS

## Decision Tree

```
I see a layout issue
├── Wrong sizes only after navigation (not initial render)?
│   └── Layout caching bug → Step 1: Re-layout fuzz suite
├── Pixel gaps between adjacent elements?
│   └── Edge-based rounding issue → Step 5: Check absolute rounding
├── Text overflows card borders?
│   └── overflow:hidden/scroll + flexShrink → Step 4: Check CSS §4.5 divergence
├── Performance regression?
│   └── Step 6: Benchmark workflow
├── Measure function returning wrong size?
│   └── Step 3: Check measureNode save/restore
└── Auto-sized container wrong dimensions?
    └── Fingerprint mismatch → Step 2: Targeted differential test
```

## Diagnostic Steps

### Step 1: Run the Re-layout Fuzz Suite

Always start here. 1200+ tests using differential oracle — catches any caching/fingerprint bug.

```bash
bun vitest run vendor/flexily/tests/relayout-consistency.test.ts
```

If a seed fails, isolate it:
```bash
bun vitest run vendor/flexily/tests/relayout-consistency.test.ts -t "seed=42"
```

The differential oracle: build tree → layout → mark dirty → re-layout → compare against fresh layout. Fresh layout is trivially correct (no caching). Any difference is a bug.

### Step 2: Targeted Differential Test

When fuzz doesn't catch it, mirror the real component structure:

```typescript
import { Node, FLEX_DIRECTION_COLUMN, OVERFLOW_SCROLL } from "silvery"

test("mirrors km card structure", () => {
  const root = Node.create()
  root.setWidth(80)
  root.setHeight(24)
  root.setFlexDirection(FLEX_DIRECTION_COLUMN)

  const column = Node.create()
  column.setOverflow(OVERFLOW_SCROLL)
  column.setFlexGrow(1)
  root.insertChild(column, 0)

  // Add children mirroring real structure...
  const card = Node.create()
  card.setWidth("100%")  // or explicit number
  column.insertChild(card, 0)

  // First layout
  root.calculateLayout(80, 24)
  const freshWidth = card.getComputedWidth()

  // Dirty a leaf and re-layout
  card.markDirty()
  root.calculateLayout(80, 24)
  const relayoutWidth = card.getComputedWidth()

  // Compare
  expect(relayoutWidth).toBe(freshWidth)
})
```

### Step 3: Check measureNode Save/Restore

`measureNode()` overwrites `layout.width/height` as a side effect. If calling code doesn't save/restore, clean nodes get corrupted values that persist through fingerprint-cached re-layouts.

Search for `measureNode` calls in `layout-zero.ts` and verify each has save/restore:
```typescript
const savedW = child.layout.width
const savedH = child.layout.height
measureNode(child, ...)
child.layout.width = savedW
child.layout.height = savedH
```

### Step 4: Check CSS §4.5 Divergence

Flexily forces `flexShrink >= 1` for `overflow:hidden/scroll` containers (Yoga doesn't). If layout differs from Yoga for overflow containers, this is intentional:

```typescript
// layout-zero.ts ~line 1244
if ((overflow === OVERFLOW_HIDDEN || overflow === OVERFLOW_SCROLL) && flex.flexShrink < 1) {
  flex.flexShrink = 1
}
```

Test: `vendor/flexily/tests/yoga-overflow-compare.test.ts`

### Step 5: Check Edge-Based Rounding

Naive `Math.round(width)` creates pixel gaps. Flexily rounds absolute edge positions:

```typescript
const absLeft = Math.round(absX + marginLeft + fractionalLeft)
const absRight = Math.round(absX + marginLeft + fractionalLeft + childWidth)
child.layout.width = absRight - absLeft  // Gap-free
```

If gaps appear, check that rounding uses absolute coordinates, not relative.

### Step 6: Benchmark Workflow

```bash
# 1. Pre-flight: check CPU load
top -l 1 -n 5 -stats command,cpu | head -10

# 2. Save baseline
cd vendor/flexily && bun bench bench/yoga-compare-warmup.bench.ts > /tmp/bench-before.txt

# 3. Make changes...

# 4. Rebuild if source changed
cd vendor/flexily && bun run build

# 5. Check CPU load again
top -l 1 -n 5 -stats command,cpu | head -10

# 6. Save after
cd vendor/flexily && bun bench bench/yoga-compare-warmup.bench.ts > /tmp/bench-after.txt

# 7. Compare
diff /tmp/bench-before.txt /tmp/bench-after.txt
```

**Baseline numbers** (must maintain):
- Flat trees: Flexily ~2x Yoga
- Shallow deep trees: Flexily ~2.3x Yoga
- No-change re-layout: Flexily ~5.5x Yoga

**Thresholds**:
- Regressions <5% for minor features
- No regressions for refactoring (must be neutral or faster)

### Step 7: Mutation Testing

After modifying cache/fingerprint logic:

```bash
bun scripts/mutation-test.ts
```

Verifies the fuzz suite catches 4 deliberate cache mutations. If a mutation isn't caught, fuzz coverage is insufficient — add targeted tests.

## NaN Semantics Reference

NaN is treacherous in Flexily — it means both "unconstrained" and appears as a natural sentinel choice:

| Comparison | Result | Consequence |
|-----------|--------|-------------|
| `NaN === NaN` | `false` | Cache lookup misses (can cause re-computation) |
| `Object.is(NaN, NaN)` | `true` | Fingerprint falsely matches (can skip needed re-layout) |
| `Number.isNaN(x)` | `true` if NaN | Use for explicit NaN checks |

**Rules**:
- Use `Object.is()` for constraint fingerprint comparison (intentional — NaN unconstrained matches NaN unconstrained)
- Use `-1` as cache invalidation sentinel (not NaN)
- Use `Number.isNaN()` for explicit "is this unconstrained?" checks

## Parallel Diagnosis Strategy

When the bug is ambiguous:

```
Agent 1: Run fuzz suite, analyze any failures
  → bun vitest run tests/relayout-consistency.test.ts

Agent 2: Build targeted test mirroring real component
  → Differential oracle with exact tree structure

Agent 3: Benchmark to check for performance regression
  → Compare before/after numbers

Agent 4: Check mutation test coverage
  → bun scripts/mutation-test.ts
```

## After Fixing

1. **Rebuild** — `cd vendor/flexily && bun run build`
2. **Benchmark** — Verify no performance regression
3. **Run silvery tests** — Layout changes can cause rendering mismatches: `bun vitest run vendor/silvery/tests/`
4. **Update docs** — Add to `src/CLAUDE.md` lessons if new pattern discovered

## Key Files

| File | What to Check |
|------|--------------|
| `src/layout-zero.ts` | Core algorithm — 11 phases, flex distribution, rounding |
| `src/node-zero.ts` | Node class — dirty propagation, caching, fingerprinting |
| `src/types.ts` | FlexInfo, Style, Value interfaces |
| `src/utils.ts` | resolveValue, applyMinMax, shared traversal stack |
| `src/testing.ts` | `getLayout`, `diffLayouts`, `expectRelayoutMatchesFresh` |
| `src/CLAUDE.md` | Full internals reference with algorithm phases and lessons |
| `tests/relayout-consistency.test.ts` | Re-layout fuzz suite (1200+ tests) |
| `bench/yoga-compare-warmup.bench.ts` | Primary benchmark |

## Cross-References

- `vendor/flexily/src/CLAUDE.md` — Algorithm phases, zero-allocation design, caching, lessons learned
- `vendor/flexily/docs/testing.md` — Test methodology
- `vendor/flexily/docs/incremental-layout-bugs.md` — Bug taxonomy, industry context
- `.claude/skills/tui/fix.md` — "Layout Bugs" section for TUI-level diagnosis
- `docs/lessons/layout-caching.md` — Layout caching bugs lesson
