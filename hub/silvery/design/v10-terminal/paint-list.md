# Paint List — Display List Model for O(changed) Updates

**Bead**: km-silvery.zero-alloc (reframe tier)
**Horizon**: v1.0 (terminal)
**Date**: 2026-04-10
**Status**: Design exploration

## Problem

Silvery's pipeline does 4 tree walks per frame (measure, layout, render, output). Even with dirty tracking, the render phase still visits every node to check dirty flags. For a 100-item list where 2 items changed, the render phase visits 100 nodes (98 fast-path skips + 2 renders). At 1000 items, that's 1000 flag checks.

The output phase then diffs two 80x24 buffers cell by cell — 1,920 comparisons even when only 2 cells changed.

Both scale with tree/buffer size, not change size.

## Insight: GPU renderers solved this decades ago

GPU rendering pipelines don't walk a scene graph on every frame. They maintain a **display list** (or paint list) — a flat array of "draw this shape at this position with this style" commands. When something changes, they **patch** the affected commands. The GPU processes only the patched entries.

Terminal UIs can use the same model.

## The design

### Phase 1: Build paint list (first render only)

On the first render, the pipeline builds a flat array of paint commands:

```typescript
interface PaintCommand {
  nodeId: number // which ag node owns this
  kind: "text" | "fill" | "border" | "clear"
  row: number // buffer row
  col: number // buffer column
  width: number // cell span
  chars: string // text content (for text commands)
  fg: number // packed fg color
  bg: number // packed bg color
  attrs: number // packed attributes (bold, dim, italic, etc.)
}

// The paint list is a flat array, ordered by z-index (paint order)
type PaintList = PaintCommand[]
```

Each ag node maps to 1-N paint commands (a Text node with 3 lines = 3 commands, a Box with border = 4 border commands + 1 fill command).

### Phase 2: On update, patch the list (incremental)

When a node's props change, the reconciler marks it dirty. Instead of traversing the tree:

1. Look up the node's paint commands by nodeId (O(1) via index)
2. Recompute only those commands (new style, new text, new position)
3. Write the new cells directly to the buffer at the command's row/col

No tree walk. No flag checking on 98 clean nodes. O(changed commands).

### Phase 3: Output only patched cells

The output phase already tracks dirty rows. With paint list, it can be more precise:

1. Each patched command marks its cells as dirty
2. Output phase iterates only dirty cells, not the entire buffer

This is O(changed cells), not O(buffer size).

### What changes vs current pipeline

| Current                                   | Paint list                                |
| ----------------------------------------- | ----------------------------------------- |
| 4 tree walks per frame                    | 1 tree walk on first render, 0 on updates |
| Render visits all nodes, skips clean ones | Render patches only dirty nodes' commands |
| Output diffs entire buffer                | Output emits only patched cells           |
| O(tree) per frame                         | O(changed) per frame                      |
| Buffer clone per frame                    | In-place patch, no clone                  |

### Layout integration

When layout changes (node moves/resizes), the paint commands for that node need their row/col/width updated. Two options:

**Option A: Recompute affected commands.** When a node has `layoutDirty`, recalculate its commands' positions from the new boxRect. O(commands for that node).

**Option B: Offset-based.** Store positions as offsets from the parent. When parent moves, add the delta to all child commands. O(subtree size) but with a single addition per command.

Option A is simpler and sufficient for terminal UIs where layout changes are rare (resize, fold/unfold).

### Text handling

Text nodes are the complex case because text wrapping depends on available width. When content changes:

1. Re-run text measurement + line breaking for the changed node only
2. If line count changes → layout is affected (node height changed) → recompute ancestor layout
3. Regenerate paint commands for the new lines

When only style changes (color, bold, inverse):

1. Update the fg/bg/attrs fields on existing commands
2. Write new cells to buffer at same positions
3. No text measurement, no layout

This is what the existing style-only fast path does, but paint list makes it O(1) per node instead of requiring a tree walk to find the node.

### Scroll containers

Scroll containers are the tricky part. When scroll offset changes:

1. All visible commands shift by the scroll delta
2. Commands that scroll out of view become inactive (not processed by output)
3. Commands that scroll into view become active
4. Newly visible items may need their commands built for the first time (lazy paint list)

This maps well to the existing Tier 1 (buffer shift) optimization, but with commands instead of raw cells.

### Memory

For a 1000-node tree with ~3 commands per node:

- 3000 PaintCommands × ~64 bytes each = ~192 KB
- Node-to-command index: 1000 entries × 8 bytes = ~8 KB
- Total: ~200 KB (acceptable)

### Compatibility with current pipeline

The paint list doesn't need to replace the current pipeline immediately. It can be layered:

1. First render: current pipeline runs, builds paint list as a side effect
2. Incremental updates: try paint list path first. If it can handle the change (style/text only, no layout), use it. Otherwise, fall back to current pipeline.
3. Gradually expand paint list coverage until fallback is rare.

This is the same pattern as the style-only fast path — an optimization that handles common cases, with a fallback for complex ones.

## Effort estimate

- Phase 1 (paint list data structure + build on first render): ~3 days
- Phase 2 (incremental patch for style-only changes): ~2 days
- Phase 3 (incremental patch for text content changes): ~3 days
- Phase 4 (scroll container support): ~3 days
- Phase 5 (remove fallback, paint list handles all cases): ~5 days

Total: ~2-3 weeks. Can ship Phase 1+2 independently for immediate cursor/selection perf gains.

## Expected impact

For cursor/selection moves (style-only, 2 nodes change):

- Current: ~0.43ms (100 flag checks + 2 renders + 1920 cell diffs)
- Paint list: ~0.01ms (2 command patches + 2 cell writes)
- **~40× faster pipeline** (on top of React reconciliation, which is separate)

Combined with useSignalProps (bypasses React): ~0.001ms total. That's the O(1) endgame.

## Risks

1. **Complexity** — paint list is a second rendering model alongside the current tree-based one. Bugs could emerge from inconsistencies between the two during the fallback period.
2. **STRICT verification** — SILVERY_STRICT must verify paint list output matches tree-based output. Essential for correctness.
3. **Layout invalidation** — when layout changes, paint list commands must be fully rebuilt for affected subtrees. The fallback path handles this, but frequent layout changes would negate the optimization.

## Prior art

- **GPU display lists** (OpenGL, Vulkan) — the original inspiration
- **React Native Fabric** — shadow tree + flat view descriptors
- **Flutter's Layer tree** — compositing layers with retained rendering
- **Ratatui's Buffer** — cell-level buffer, but without a display list (full rebuild each frame)
- **Blessed's damage buffer** — region-level dirty tracking, closer to our current model

## Decision needed

Is the paint list worth the complexity? The zero-alloc bead's quick wins (#1 layout-on-demand, #7 expanded fast path, #13 ANSI caching) may get us to ~0.1ms/frame without the paint list. The paint list's ~0.01ms is dramatically better but at significant implementation cost.

Recommend: ship the quick wins first, measure, then decide if the paint list's additional 10× is needed.
