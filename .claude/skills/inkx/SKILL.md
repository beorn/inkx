---
description: Debug and fix inkx rendering issues — incremental rendering, dirty flags, scroll containers, sticky children. Use when inkx renders incorrectly or has visual artifacts.
argument-hint: [symptom] (describe the visual glitch, or "fuzz" for fuzz-driven workflow)
---

# inkx Diagnostic Workflow

**Issue**: $ARGUMENTS

## Decision Tree

```
I see a visual glitch
├── Content correct on initial render, wrong after navigation?
│   └── Incremental rendering bug → Step 1: INKX_STRICT
├── Wrong sizes or positions (not wrong pixels)?
│   └── Possibly a Flexx layout bug → See .claude/skills/flexx/SKILL.md
├── Scroll content jumps or disappears?
│   └── Scroll tier issue → Step 5: Check tier selection
├── Sticky header shows wrong bg or corrupts items?
│   └── getCellBg coupling → Step 6: Check bg inheritance
├── Border artifacts after color change?
│   └── paintDirty cascading → Step 5: Check contentAreaAffected
└── Ghost characters or stale pixels?
    └── Output phase or region clearing → Step 1: INKX_STRICT
```

## Diagnostic Steps

### Step 1: INKX_STRICT

Always start here. Catches any incremental vs fresh render divergence.

```bash
# In the app
INKX_STRICT=1 bun km view /path/to/vault

# In tests (enabled by default)
bun vitest run vendor/beorn-inkx/tests/
bun vitest run apps/km-tui/tests/
```

If INKX_STRICT throws `IncrementalRenderMismatchError`, the error output includes:
- **Cell values** (incremental vs fresh) — shows exactly what diverged
- **Node path** — which component owns the mismatched cell
- **Dirty flags** — whether the node was clean when it shouldn't have been
- **Scroll context** — visible range, offset changes
- **Fast-path analysis** — WHY the node was likely skipped

### Step 2: Write a Failing Test

Follow the [test-first protocol](../tests/test-first-protocol.md). Write a failing test before any fix. For inkx bugs, use `withDiagnostics` with `{ checkIncremental: true, checkReplay: true, checkStability: true }`.

### Step 3: INKX_INSTRUMENT

Enable performance instrumentation to see skip/render counts:

```bash
INKX_INSTRUMENT=1 bun km view /path
```

Exposed on `globalThis.__inkx_content_detail` (per-frame) and `globalThis.__inkx_content_all` (array):
- `nodesVisited`, `nodesRendered`, `nodesSkipped` — too many renders = over-invalidation
- `clearOps` — how many region clears happened
- `cascadeMinDepth`, `cascadeNodes` — cascade analysis
- `scrollClearReason`, `scrollContainerTier` — which tier was selected and why

### Step 4: debug-mismatch.ts

For node-level diagnostics when you have a specific mismatch position:

```typescript
import { findNodeAtPosition, getNodeDebugInfo, buildMismatchContext } from "inkx/debug-mismatch"

const ctx = buildMismatchContext(root, mismatch, incrementalBuffer, freshBuffer)
console.log(formatMismatchContext(ctx))
// Shows: cell values, dirty flags, layout state, scroll ancestors, fast-path analysis
```

### Step 5: Check the Five Critical Formulas

In `content-phase.ts`, `renderNodeToBuffer`:

```typescript
layoutChanged       = !rectEqual(node.prevLayout, node.contentRect)
contentAreaAffected = contentDirty || layoutChanged || childPositionChanged || childrenDirty || bgDirty
parentRegionCleared = (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !props.backgroundColor
skipBgFill          = hasPrevBuffer && !ancestorCleared && !contentAreaAffected
parentRegionChanged = (hasPrevBuffer || ancestorCleared) && contentAreaAffected
```

Common mistakes:
- Using `needsOwnRepaint` where `contentAreaAffected` is needed (cascades border changes)
- Missing `bgDirty` in `contentAreaAffected` (stale bg when backgroundColor removed)
- Wrong `parentRegionCleared` propagation (transparent Boxes must propagate, colored Boxes break cascade)

### Step 6: getCellBg Coupling

**Critical insight**: Text nodes without explicit bg read the buffer via `getCellBg`. Any change to when/how regions are cleared changes what Text renders.

Check: At the time Text renders, is the buffer state at its position identical to what a fresh render would produce?

Common violations:
- Clearing viewport to inherited bg instead of `null` (fresh starts with null)
- Stale bg from previous frames' sticky positions still in cloned buffer
- Region cleared but Text already rendered (ordering issue)

## Parallel Diagnosis Strategy

When multiple hypotheses exist, test them concurrently:

```
Agent 1: Test "dirty flag propagation" hypothesis
  → Write test targeting flag cascade, check with INKX_STRICT

Agent 2: Test "scroll tier selection" hypothesis
  → Write test with scroll container, vary scroll offset, check tier

Agent 3: Test "bg inheritance" hypothesis
  → Write test with nested bg + Text, check getCellBg reads

Agent 4: Write minimal repro from user report
  → withDiagnostics driver test reproducing exact steps
```

Merge findings: typically one agent's test fails, confirming that hypothesis.

## Performance Workflow

```bash
# Pre-flight: check CPU load
top -l 1 -n 5 -stats command,cpu | head -10

# Run inkx benchmarks (if they exist for the area you're changing)
bun vitest run vendor/beorn-inkx/tests/

# Run the full app to verify no visual regression
INKX_STRICT=1 bun km view /path
```

## After Fixing

1. **Promote regression test** — Move from `/tmp/` to `vendor/beorn-inkx/tests/` or `apps/km-tui/tests/`
2. **Update docs** — Add to pipeline `CLAUDE.md` lessons if new pattern discovered
3. **Create prevention bead** — If structural change needed to prevent this class of bug

## Key Files

| File | What to Check |
|------|--------------|
| `src/pipeline/content-phase.ts` | Fast-path logic, cascade formulas, scroll tiers, region clearing |
| `src/pipeline/render-text.ts` | `getCellBg` inheritance, BgSegment tracking |
| `src/pipeline/render-box.ts` | `skipBgFill`, border rendering |
| `src/pipeline/output-phase.ts` | Buffer diff, ANSI output generation |
| `src/pipeline/layout-phase.ts` | Scroll state, sticky positions, screenRect |
| `src/debug-mismatch.ts` | Mismatch diagnostics, node attribution |
| `src/with-diagnostics.ts` | Diagnostic plugin, VirtualTerminal |
| `src/pipeline/CLAUDE.md` | Full pipeline internals reference |

## Cross-References

- `vendor/beorn-inkx/src/pipeline/CLAUDE.md` — Dirty flags, cascade, scroll tiers, lessons learned
- `.claude/skills/tui/fix.md` — TUI-level debugging (board driver, diagnostics)
- `.claude/skills/explore/random.md` — Fuzz testing workflow
- `docs/lessons/debugging-rendering.md` — Anti-patterns when debugging rendering
- `docs/lessons/incremental-rendering.md` — Incremental rendering concepts
- `docs/lessons/sticky-children-rendering.md` — Sticky children fix session
