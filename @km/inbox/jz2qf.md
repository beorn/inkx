---
id: "@km/inbox/jz2qf"
aliases:
  - km-jz2qf
  - "@km/_orphan/jz2qf"
created_at: 2026-02-02T23:11:48Z
closed_at: 2026-02-04T11:23:57Z
---

# [x] inkx: incremental contentPhase rendering @km/_orphan #feature #P2

## Problem

contentPhase processes ALL nodes every frame (~31µs/node), even when React only updated 2 components. This causes O(n) render time where n=total nodes, not changed nodes.

With 6668 nodes, contentPhase takes 210ms even though only 2 TreeCards changed.

## Root Cause

React's reconciler knows exactly which components changed, but inkx ignores this:
- React marks 2 nodes as needing update
- inkx walks all 6668 nodes anyway
- Each node is written to TerminalBuffer regardless of change

## Research Context (Deep Research, Feb 2026)

Modern TUI frameworks solve this:
- **Ratatui**: "compares the current buffer to the new buffer each frame and writes only the needed updates"
- **Textual**: "marks that widget as 'dirty' and automatically refreshes its content" 
- **Ink**: Has \`incrementalRendering\` mode that "only updates changed lines"

## Proposed Solution

1. **Use existing contentDirty flag**: Already set by reconciler when content changes
2. **Add layoutDirty flag**: Set when computed layout differs from previous
3. **Cache rendered output per node**: Store node's buffer region after first render
4. **Skip unchanged nodes**: In contentPhase, if !contentDirty && !layoutDirty, blit cached content

```typescript
function renderNodeToBuffer(node, buffer) {
  // Fast path: unchanged node
  if (!node.contentDirty && !node.layoutDirty && node.cachedContent) {
    buffer.blit(node.cachedContent, layout.x, layout.y)
    return
  }
  
  // Slow path: render and cache
  const rendered = renderNodeContent(node)
  node.cachedContent = rendered
  buffer.blit(rendered, layout.x, layout.y)
  node.contentDirty = false
  node.layoutDirty = false
}
```

## Expected Impact

- Current: 6668 nodes × 31µs = 210ms
- With caching: 2 changed nodes × 31µs + 6666 blits × ~1µs ≈ 7ms
- **30x improvement** for typical cursor movements

## Complexity

Medium-high:
- Cache invalidation when ancestors resize
- Memory overhead for cached content
- Need to handle scroll offset changes
- Clipping interaction with cached regions

## Alternatives Considered

1. **Reduce node count** (DONE - reduced depth from 2→1, 78% improvement)
2. **Line-level diffing in outputPhase** (already done, but contentPhase is the bottleneck)
3. **Virtualization** (already done via VirtualList, but doesn't help contentPhase)

## References

- Textual: https://textual.textualize.io/guide/reactivity/
- Ratatui diffing: https://github.com/ratatui-org/ratatui/discussions/579
- Ink incrementalRendering: https://github.com/vadimdemedes/ink#render-options