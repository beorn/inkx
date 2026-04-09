---
description: Debug and fix silvery rendering issues — incremental rendering, dirty flags, scroll containers, sticky children. Use when silvery renders incorrectly or has visual artifacts.
argument-hint: [symptom] (describe the visual glitch, or "fuzz" for fuzz-driven workflow)
---

# silvery Diagnostic Workflow

**Issue**: $ARGUMENTS

## Diagnostic Quick Reference

See **[debugging.md](vendor/silvery/docs/guide/debugging.md)** for the canonical env var reference, what each mode catches/misses, and CI strategy.

Key modes: `SILVERY_STRICT=1` (buffer-level, always on in tests), `SILVERY_STRICT_TERMINAL=xterm` (independent terminal check), `SILVERY_INSTRUMENT=1` (performance counters), `SILVERY_CELL_DEBUG=x,y` (cell attribution). STRICT errors auto-include instrumentation — no separate run needed.

## Decision Tree

```
I see a visual glitch
├── Content correct on initial render, wrong after navigation?
│   └── Incremental rendering bug → Step 1: SILVERY_STRICT
├── Wrong sizes or positions (not wrong pixels)?
│   └── Possibly a Flexily layout bug → See .claude/skills/flexily/SKILL.md
├── Scroll content jumps or disappears?
│   └── Scroll tier issue → Step 5: Check tier selection
├── Sticky header shows wrong bg or corrupts items?
│   └── getCellBg coupling → Step 6: Check bg inheritance
├── Border artifacts after color change?
│   └── stylePropsDirty cascading → Step 5: Check contentAreaAffected
├── Colors wrong but characters correct? (progressive garble)
│   └── Output phase bug → SILVERY_STRICT_TERMINAL=vt100
├── CJK/wide char shifts text right?
│   └── bufferToAnsi cursor drift → SILVERY_STRICT_TERMINAL=xterm
├── Bug only appears with real vault, not test fixtures?
│   └── Test fixtures too simple → use real-vault test or larger fixture
└── Ghost characters or stale pixels?
    └── Region clearing or output phase → Step 1: SILVERY_STRICT, then SILVERY_STRICT_TERMINAL=vt100
```

## Diagnostic Steps

### Step 0: Verify Incremental Checking is ON (MANDATORY FIRST CHECK)

**Before ANY other investigation**, verify the test has `checkIncremental` enabled.

Board tests using `testEnv()` or `testEnvWithRepo()` compare incremental vs fresh render **on every press()** by default. If a test was created with `checkIncremental: false`, it won't catch rendering bugs. Check:

```typescript
// GOOD: checkIncremental defaults to true — no opt-out needed
const { board } = testEnv(() => item("board", ...))

// BAD: test opted out of incremental checking
const { board } = testEnv(() => item("board", ...), { checkIncremental: false })
```

For non-testEnv tests, use `withDiagnostics({ checkIncremental: true })` on the board driver.

If a test exercises dialog open/close, toast show/hide, or any component mount/unmount and does NOT have incremental checking, **add it before investigating**.

### Step 1: SILVERY_STRICT

Run with SILVERY_STRICT to catch incremental vs fresh render divergence at the runtime level.

```bash
# In the app (catches production createApp path issues)
SILVERY_STRICT=1 bun km view /path/to/vault

# In tests (testEnv checks incremental by default since 2026-02-17)
bun vitest run vendor/silvery/tests/
bun vitest run apps/km-tui/tests/
```

**Note**: testEnv's `checkIncremental` catches bugs in the test renderer path. Some bugs (like ghost dialogs) only manifest in the production `createApp` path — use `SILVERY_STRICT=1` with the real app for those.

If SILVERY_STRICT throws `IncrementalRenderMismatchError`, the error output automatically includes:
- **Cell values** (incremental vs fresh) — shows exactly what diverged
- **Node path** — which component owns the mismatched cell
- **Dirty flags** — whether the node was clean when it shouldn't have been
- **Scroll context** — visible range, offset changes
- **Fast-path analysis** — WHY the node was likely skipped
- **Render-phase stats** — nodes visited/rendered/skipped, per-flag breakdown (why nodes weren't skipped), scroll container diagnostics
- **Cell attribution** — mismatch debug context from `debug-mismatch.ts`

This means you no longer need separate `SILVERY_INSTRUMENT` or `SILVERY_CELL_DEBUG` steps when diagnosing a STRICT failure — the error has everything.

### Step 2: Write a Failing Test

Follow the [test-first protocol](../tests/test-first-protocol.md). Write a failing test before any fix. For silvery bugs, use `withDiagnostics` with `{ checkIncremental: true, checkReplay: true, checkStability: true }`.

### Step 3: SILVERY_INSTRUMENT

Enable performance instrumentation to see skip/render counts:

```bash
# Enable stats collection + loggily output
SILVERY_INSTRUMENT=1 DEBUG=silvery:content DEBUG_LOG=/tmp/silvery.log bun km view /path
```

Output via loggily `silvery:content` namespace. Also exposed on `globalThis.__silvery_content_detail` (per-frame) and `globalThis.__silvery_content_all` (array) for programmatic access:
- `nodesVisited`, `nodesRendered`, `nodesSkipped` — too many renders = over-invalidation
- `clearOps` — how many region clears happened
- `cascadeMinDepth`, `cascadeNodes` — cascade analysis
- `scrollClearReason`, `scrollContainerTier` — which tier was selected and why

### Step 4: debug-mismatch.ts

For node-level diagnostics when you have a specific mismatch position:

```typescript
import { findNodeAtPosition, getNodeDebugInfo, buildMismatchContext } from "silvery/debug-mismatch"

const ctx = buildMismatchContext(root, mismatch, incrementalBuffer, freshBuffer)
console.log(formatMismatchContext(ctx))
// Shows: cell values, dirty flags, layout state, scroll ancestors, fast-path analysis
```

### Step 5: Check the Five Critical Formulas

In `render-phase.ts`, `renderNodeToBuffer`:

```typescript
layoutChanged            = node.layoutChangedThisFrame
contentAreaAffected      = contentDirty || layoutChanged || childPositionChanged || childrenDirty || bgDirty || absoluteChildMutated || descendantOverflowChanged
contentRegionCleared     = (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !props.backgroundColor
skipBgFill               = hasPrevBuffer && !ancestorCleared && !contentAreaAffected
childrenNeedFreshRender  = (hasPrevBuffer || ancestorCleared) && contentAreaAffected
```

Common mistakes:
- Using `needsOwnRepaint` where `contentAreaAffected` is needed (cascades border changes)
- Missing `bgDirty` in `contentAreaAffected` (stale bg when backgroundColor removed)
- Wrong `contentRegionCleared` propagation (transparent Boxes must propagate, colored Boxes break cascade)
- Checking `!rectEqual(prevLayout, contentRect)` instead of `layoutChangedThisFrame` (stale when layout phase skipped)

### Step 6: Text Background Inheritance

Text nodes inherit bg from nearest ancestor with `backgroundColor` via explicit `inheritedBg` parameter (computed by `findInheritedBg()`). The old `getCellBg` buffer-read approach was replaced to decouple text rendering from buffer state.

**Check**: Is `inheritedBg` correct at the time Text renders? Does region clearing use the same bg that `findInheritedBg()` would return?

Common violations:
- Clearing viewport to inherited bg instead of `null` (fresh starts with null)
- Stale bg from previous frames' sticky positions still in cloned buffer
- `getCellBg` fallback still used by scroll indicators in render-box.ts — can diverge from `inheritedBg`
- Region cleared but Text already rendered (ordering issue)

## Parallel Diagnosis Strategy

When multiple hypotheses exist, test them concurrently:

```
Agent 1: Test "dirty flag propagation" hypothesis
  → Write test targeting flag cascade, check with SILVERY_STRICT

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

# Run silvery benchmarks (if they exist for the area you're changing)
bun vitest run vendor/silvery/tests/

# Run the full app to verify no visual regression
SILVERY_STRICT=1 bun km view /path
```

## After Fixing

1. **Promote regression test** — Move from `/tmp/` to `vendor/silvery/tests/` or `apps/km-tui/tests/`
2. **Update docs** — Add to pipeline `CLAUDE.md` lessons if new pattern discovered
3. **Create prevention bead** — If structural change needed to prevent this class of bug

## Key Files

| File | What to Check |
|------|--------------|
| `src/pipeline/render-phase.ts` | Fast-path logic, cascade formulas, scroll tiers, region clearing |
| `src/pipeline/render-text.ts` | `getCellBg` inheritance, BgSegment tracking |
| `src/pipeline/render-box.ts` | `skipBgFill`, border rendering |
| `src/pipeline/output-phase.ts` | Buffer diff, ANSI output generation |
| `src/pipeline/layout-phase.ts` | Scroll state, sticky positions, scrollRect |
| `src/debug-mismatch.ts` | Mismatch diagnostics, node attribution |
| `src/with-diagnostics.ts` | Diagnostic plugin, VirtualTerminal |
| `src/pipeline/CLAUDE.md` | Full pipeline internals reference |

## Related Skills (load the right one)

| Symptom | Use |
|---------|-----|
| Silvery pipeline bug (this skill) | `/silvery` — dirty flags, incremental rendering, scroll tiers |
| km-tui component bug (card/column/board) | `/tui` — km-specific TUI development |
| Flexily layout bug (wrong sizes/positions) | `/flexily` — layout engine caching, fingerprinting |
| Performance issue (slow render, jank) | `/perf` — profiling and diagnostics |
| Need a failing test first | `/troubleshoot` — structured debugging protocol |

## Fuzz Tests

Property-invariant and stress fuzz tests verify rendering correctness under randomized conditions. Run with `FUZZ=1`:

| File | What it tests |
|------|--------------|
| `vendor/silvery/tests/features/property-invariants.fuzz.tsx` | 7 property invariants: idempotence, no-op, inverse operations, viewport clipping, combined |
| `vendor/silvery/tests/features/incremental-rendering.fuzz.tsx` | Stress tests: scrollable lists, nested bg, wrap boundaries, absolute positioning, multi-column boards |
| `apps/km-tui/tests/render-fuzz.fuzz.ts` | km-specific fuzz: large fixtures (100 items), nested fixtures, scrolling at various sizes, mutation keys (z/Z/f/F/Enter/Escape/Tab) |

These tests surface pre-existing incremental rendering bugs and run only with `FUZZ=1` (not in CI).

## Cross-References

- `vendor/silvery/src/pipeline/CLAUDE.md` — Dirty flags, cascade, scroll tiers, lessons learned
- `.claude/skills/tui/fix.md` — TUI-level debugging (board driver, diagnostics)
- `.claude/skills/explore/random.md` — Fuzz testing workflow
- `docs/lessons/debugging-rendering.md` — Anti-patterns when debugging rendering
- `docs/lessons/incremental-rendering.md` — Incremental rendering concepts
- `docs/lessons/sticky-children-rendering.md` — Sticky children fix session
