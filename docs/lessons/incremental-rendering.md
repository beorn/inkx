# Debugging Incremental Rendering Bugs

**Keywords**: Silvery, rendering, incremental, stale pixels, fast-path, dirty flags, SILVERY_STRICT

This document captures lessons learned from fixing incremental rendering bugs in Silvery. Use these patterns when you're stuck debugging visual glitches.

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
4. **Invariant checks** - SILVERY_STRICT catches mismatches automatically

Example: We added `FAST-PATH ANALYSIS` to error output that explains WHY a node was skipped:
```
FAST-PATH ANALYSIS:
  ⚠ ALL DIRTY FLAGS FALSE - fast-path likely skipped this node
  ✓ Node index 1 is in visible range [0..1]
  ✓ Scroll offset unchanged (fast-path enabled for children)
```

## Designing for AI-Assisted Debugging

AI agents (Claude, GPT) are excellent at debugging when given rich diagnostic output. Design your error messages and test infrastructure to maximize AI effectiveness.

### Make Errors Self-Diagnosing

**Bad**: `AssertionError: expected "A" but got "B"`

**Good**: Include everything needed to diagnose without re-running:
```
MISMATCH at (12, 5) on render #3

CELL VALUES:
  incremental: char=" " fg=null bg=6
  fresh:       char="T" fg=null bg=0

INNERMOST NODE:
  path: root > #board > [0] > #card-1
  type: silvery-box
  backgroundColor: undefined

DIRTY FLAGS:
  active: (none - node was clean)

FAST-PATH ANALYSIS:
  ⚠ ALL DIRTY FLAGS FALSE - fast-path likely skipped this node
  ✓ Node index 1 is in visible range [0..1]
```

The AI can immediately see: "Clean node in visible range but wrong content → fast-path skipped it when it shouldn't have."

### Capture Rich State for Replay

Build test helpers that capture complete state, not just pass/fail:

```typescript
// board-test.ts helper captures full context
export function testEnv(tree: TreeDefinition, options?: TestEnvOptions) {
  const { board, term, repo } = createBoard(tree, options)

  return {
    press: (key: string) => {
      board.press(key)
      // Auto-captures: cursor position, selected node, scroll state, screen content
    },
    getState: () => ({
      cursor: board.cursor,
      selectedNodeId: board.selectedNodeId,
      screen: term.text,
      scrollOffsets: getScrollOffsets(board),
    }),
    // For AI: dump everything needed to reproduce
    diagnostics: () => ({
      ...getState(),
      nodeTree: dumpTree(repo),
      renderHistory: board.renderHistory,
    }),
  }
}
```

### Error Messages Should Answer "Why?"

Every error message should answer:
1. **What** went wrong (the symptom)
2. **Where** it happened (position, node path, render number)
3. **Why** it likely happened (analysis of flags, state, conditions)
4. **How** to reproduce (minimal steps or test case)

## Defensive Programming with Invariants

Incremental rendering bugs are hard because they're **silent** — wrong pixels render without errors. The solution: add invariants that catch mismatches immediately.

### The SILVERY_STRICT Pattern

Compare fast-path (incremental) vs slow-path (fresh) on every render:

```typescript
// In scheduler.ts
if (process.env.SILVERY_STRICT && this.stats.renderCount > 0) {
  const freshBuffer = renderPhase(root, null)  // Force fresh render
  const mismatches = compareBuffers(incrementalBuffer, freshBuffer)

  if (mismatches.length > 0) {
    const ctx = buildMismatchContext(root, mismatches[0], incrementalBuffer, freshBuffer)
    throw new IncrementalRenderMismatchError(formatMismatchContext(ctx))
  }
}
```

**Cost**: 2x render time in tests. **Benefit**: Catches bugs immediately instead of subtle visual glitches noticed weeks later.

### Layer Your Invariants

| Layer | What to Check | When |
|-------|---------------|------|
| **Unit** | Single function contracts | Every call |
| **Integration** | Cross-component consistency | After operations |
| **System** | End-to-end correctness | Every render (in tests) |

For rendering:
```typescript
// Unit: Node-level invariants
if (node.subtreeDirty && !hasAnyDirtyDescendant(node)) {
  throw new Error(`subtreeDirty=true but no dirty descendants: ${nodePath(node)}`)
}

// Integration: Layout invariants
if (child.screenRect && parent.screenRect) {
  if (!rectContains(parent.screenRect, child.screenRect)) {
    throw new Error(`Child ${childPath} outside parent bounds`)
  }
}

// System: Render invariants (SILVERY_STRICT)
const fresh = renderFresh(root)
const incremental = renderIncremental(root, prevBuffer)
assertEqual(fresh, incremental, "Incremental render mismatch")
```

### Enable by Default in Tests

Don't require opt-in for safety checks:

```typescript
// vitest/setup.ts
if (!process.env.SILVERY_STRICT) {
  process.env.SILVERY_STRICT = "1"  // On by default for tests
}
```

Developers can opt-out for performance testing, but the default catches bugs.

### Invariants as Documentation

Invariants document assumptions that are easy to violate during refactoring:

```typescript
// This documents: "contentRegionCleared must propagate to children"
const childHasPrev = contentRegionCleared ? false : hasPrevBuffer

// Without the invariant, a future dev might "optimize" to:
const childHasPrev = hasPrevBuffer  // Bug: ignores contentRegionCleared
```

The SILVERY_STRICT check catches this immediately in tests.

### When Invariants Fail: Fix the Bug, Not the Invariant

When an invariant fails, you have two choices:
1. **Fix the code** - The invariant caught a real bug
2. **Update the invariant** - Your understanding of correctness was wrong

Never disable invariants because they're "too strict." If the invariant fires, either the code or the invariant is wrong — figure out which.

## Get Fresh Eyes: Multi-LLM Review

When you're deep in a debugging session, it's hard to see the big picture. You're "in the picture" — focused on specific code paths, chasing symptoms, building mental models that may be wrong.

### The Problem with Single-Perspective Debugging

- **Tunnel vision**: You've read the same code 20 times and keep missing the bug
- **Sunk cost**: You've invested in a theory and keep finding evidence to support it
- **Local maxima**: Your fix works but there's a simpler architectural solution
- **Blind spots**: You assume certain things "can't be the problem"

### Use Other LLMs for Fresh Perspectives

The `/deep` command queries OpenAI's deep research for thorough analysis:

```bash
# Comprehensive code review with full source context
bun llm --deep -y --context "$(cat << 'EOF'
# Bug: Incremental render shows blank regions after navigation

## Problem
Children disappear after parent clears its region. SILVERY_STRICT catches
mismatch but I can't find the root cause.

## Full Source Code
[paste render-phase.ts - the ENTIRE file, not snippets]

## What I've Tried
1. Added contentRegionCleared flag - didn't help
2. Checked dirty flag propagation - looks correct
3. ...

## Questions
1. Is there a fundamental flaw in the fast-path logic?
2. Am I missing an edge case?
3. Is there a simpler architectural approach?
EOF
)" "Review this rendering bug. Identify root cause and suggest fixes."
```

### When to Get Outside Perspective

| Situation | Action |
|-----------|--------|
| Stuck for 30+ minutes on same bug | `/deep` with full source |
| Fix works but feels hacky | Ask for architectural review |
| Not sure if fix is complete | Ask for edge cases you might have missed |
| Complex algorithm changes | Ask for correctness review |

### What Makes a Good LLM Review Request

1. **Full source code** - Not snippets. Include entire files. LLMs handle large context well.
2. **Problem description** - Specific symptoms, what you've tried, what failed
3. **Your current theory** - State it so they can challenge it
4. **Specific questions** - "Is X correct?" beats "What's wrong?"

### The Meta-Benefit

Even if the other LLM doesn't solve your problem, articulating it clearly often triggers your own insight. The act of preparing context for review forces you to:
- Organize what you know
- State your assumptions explicitly
- Question whether you've tried the obvious things

Sometimes you solve the bug while writing the review request.

## Incremental Rendering: The Core Concepts

### The Fast-Path

Incremental rendering clones the previous buffer, then only re-renders changed nodes:

```typescript
if (
  hasPrevBuffer &&
  !node.contentDirty &&
  !node.stylePropsDirty &&
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
| **Blank regions** | Content disappears after navigation | Parent cleared region but children skipped by fast-path | Propagate `contentRegionCleared` to disable child fast-path |
| **Stale backgrounds** | Old highlight color persists | Node had backgroundColor, now doesn't | Check `stylePropsDirty` flag, clear region on removal |
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

### 1. Enable SILVERY_STRICT (Default in Tests)

```bash
# Enabled by default for storeMode testing
bun vitest run apps/km-tui/tests/

# Or explicitly enable for CLI debugging
SILVERY_STRICT=1 bun km view /path/to/vault
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

Key functions in `render-phase.ts`:

1. `renderPhase()` - Entry point, clones buffer
2. `renderNodeToBuffer()` - Fast-path check, region clear
3. `renderScrollContainerChildren()` - Scroll-specific logic
4. `renderNormalChildren()` - Standard child rendering

Trace through with the question: "Why is this node skipped?"

## Dirty Flag Reference

| Flag | Meaning | Set When |
|------|---------|----------|
| `contentDirty` | Text/structure changed | Text content changes |
| `stylePropsDirty` | Visual props changed | backgroundColor, color, border changes |
| `subtreeDirty` | Descendant is dirty | Any child has a dirty flag |
| `childrenDirty` | Children added/removed/reordered | React reconciliation changes children |
| `layoutDirty` | Layout props changed | Width, height, flex props change |

## Testing Checklist

When fixing incremental bugs:

- [ ] Create a fixture test that reproduces the bug
- [ ] Run tests (SILVERY_STRICT is on by default): `bun vitest run vendor/silvery/tests/`
- [ ] Check all silvery tests still pass
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

- `vendor/silvery/src/pipeline/render-phase.ts` - Fast-path logic
- `vendor/silvery/src/debug-mismatch.ts` - Error formatting
- `vendor/silvery/src/scheduler.ts` - SILVERY_STRICT check
- `apps/km-tui/tests/helpers/board-test.ts` - Test fixtures
