# Debugging Incremental Rendering Bugs

**Keywords**: inkx, rendering, incremental, stale pixels, fast-path, dirty flags, INKX_STRICT

This document captures lessons learned from fixing incremental rendering bugs in inkx. Use these patterns when you're stuck debugging visual glitches.

## The Meta-Lesson: When Stuck, Build Better Tools

When debugging is hard, **stop and build better tooling**. The investment pays off quickly.

### Signs You Need Better Tools

- Running the same tests repeatedly with grep
- Mentally tracing code paths trying to understand state
- "The bug only happens in production, not in tests"
- Guessing at root causes without data

### What to Build

1. **Enhanced error messages** - Include ALL context needed to diagnose
2. **Fixture tests** - Convert production bugs to reproducible test cases
3. **State snapshots** - Capture before/after state at key points
4. **Invariant checks** - INKX_STRICT catches mismatches automatically

Example: We added `FAST-PATH ANALYSIS` to error output that explains WHY a node was skipped:
```
FAST-PATH ANALYSIS:
  ⚠ ALL DIRTY FLAGS FALSE - fast-path likely skipped this node
  ✓ Node index 1 is in visible range [0..1]
  ✓ Scroll offset unchanged (fast-path enabled for children)
```

## Incremental Rendering: The Core Concepts

### The Fast-Path

Incremental rendering clones the previous buffer, then only re-renders changed nodes:

```typescript
if (
  hasPrevBuffer &&
  !node.contentDirty &&
  !node.paintDirty &&
  !layoutChanged &&
  !node.subtreeDirty &&
  !childPositionChanged
) {
  return  // FAST-PATH: Skip this node, its pixels are in the cloned buffer
}
```

### Common Bug Patterns

| Pattern | Symptom | Root Cause | Fix |
|---------|---------|------------|-----|
| **Blank regions** | Content disappears after navigation | Parent cleared region but children skipped by fast-path | Propagate `parentRegionCleared` to disable child fast-path |
| **Stale backgrounds** | Old highlight color persists | Node had backgroundColor, now doesn't | Check `paintDirty` flag, clear region on removal |
| **Sibling shift artifacts** | Gap pixels between moved children | Child positions changed but parent didn't clear | Detect `childPositionChanged`, clear parent region |
| **Overlay bleed** | Dialog background leaks through | Dialog closed but underlying content not restored | Re-render content behind dialog |

### The Key Insight

**When a parent clears its region, ALL children must re-render** - even clean ones.

The viewport clear erases children's pixels from the cloned buffer. If children have clean flags, fast-path skips them, leaving blanks.

```typescript
// WRONG: Only checks childrenDirty and childPositionChanged
const childHasPrev = childrenDirty || childPositionChanged ? false : hasPrevBuffer

// RIGHT: Also checks if viewport was cleared
const childHasPrev = childrenDirty || childPositionChanged || needsViewportClear
  ? false
  : hasPrevBuffer
```

## Debugging Workflow

### 1. Enable INKX_STRICT (Default in Tests)

```bash
# Enabled by default for storeMode testing
bun vitest run apps/km-tui/tests/

# Or explicitly enable for CLI debugging
INKX_STRICT=1 bun km view /path/to/vault
```

This compares incremental vs fresh render on EVERY render and throws on mismatch.

### 2. Read the Error Output

The enhanced error shows:
- **Position** - Where the mismatch occurred
- **Cell values** - What incremental showed vs what fresh showed
- **Node path** - Which component owns that cell
- **Dirty flags** - Whether the node was clean (shouldn't have been skipped)
- **Scroll context** - Visible range, offset changes
- **Fast-path analysis** - WHY the node was likely skipped

### 3. Identify the Pattern

Look for these clues:

| Clue | Likely Pattern |
|------|----------------|
| `active: (none - node was clean)` | Fast-path incorrectly skipped |
| `⚠ SCROLL CHANGED: offset X → Y` | Scroll handling issue |
| `bg=N` in incremental, `bg=0` in fresh | Background not cleared |
| Node in visible range but blank | Viewport clear + fast-path issue |

### 4. Create a Fixture Test

Convert the production bug to a minimal test:

```typescript
test("children appear when viewport cleared", () => {
  const render = createRenderer({ cols: 80, rows: 24, incremental: true })

  function App({ selected }: { selected: number }) {
    return (
      <Box overflow="scroll" height={10}>
        {items.map((item, i) => (
          <Card key={i} selected={i === selected} />
        ))}
      </Box>
    )
  }

  const app = render(<App selected={0} />)
  app.rerender(<App selected={1} />)  // This triggers the bug

  expect(app.text).toContain("Item 1")  // Fails if fast-path skips
})
```

### 5. Trace the Code Path

Key functions in `content-phase.ts`:

1. `contentPhase()` - Entry point, clones buffer
2. `renderNodeToBuffer()` - Fast-path check, region clear
3. `renderScrollContainerChildren()` - Scroll-specific logic
4. `renderNormalChildren()` - Standard child rendering

Trace through with the question: "Why is this node skipped?"

## Dirty Flag Reference

| Flag | Meaning | Set When |
|------|---------|----------|
| `contentDirty` | Text/structure changed | Text content changes |
| `paintDirty` | Visual props changed | backgroundColor, color, border changes |
| `subtreeDirty` | Descendant is dirty | Any child has a dirty flag |
| `childrenDirty` | Children added/removed/reordered | React reconciliation changes children |
| `layoutDirty` | Layout props changed | Width, height, flex props change |

## Testing Checklist

When fixing incremental bugs:

- [ ] Create a fixture test that reproduces the bug
- [ ] Run tests (INKX_STRICT is on by default): `bun vitest run vendor/beorn-inkx/tests/`
- [ ] Check all inkx tests still pass
- [ ] Check km-tui tests: `bun vitest run apps/km-tui/tests/`
- [ ] Run the actual app: `bun km view /path/to/vault`

## Performance Considerations

Don't over-invalidate. Each disabled fast-path means more rendering work.

The hierarchy of "expensive":
1. **Fresh render every frame** - Most correct, most expensive
2. **Subtree re-render** - When subtreeDirty propagates up
3. **Node re-render** - Single node + children
4. **Fast-path skip** - Zero cost, relies on cloned buffer

Goal: Skip as many nodes as possible while maintaining correctness.

## Related Files

- `vendor/beorn-inkx/src/pipeline/content-phase.ts` - Fast-path logic
- `vendor/beorn-inkx/src/debug-mismatch.ts` - Error formatting
- `vendor/beorn-inkx/src/scheduler.ts` - INKX_STRICT check
- `apps/km-tui/tests/helpers/board-test.ts` - Test fixtures
