---
mentions:
  - km
id: "@km/silvery/large-terminal-perf"
aliases:
  - km-silvery.large-terminal-perf
  - km-silvery-large-terminal-perf
created_by: Bjørn Stabell
created_at: 2026-04-10T20:09:19Z
closed_at: 2026-04-10T20:57:04Z
close_reason: Clone 0.08ms, culling exists, React reconciliation 87%. Use
  VirtualList for 1000+ items.
owner: bjorn@stabell.org
---

# [x] Large terminal performance (400x200) — buffer clone + viewport culling @km/silvery #task #P2

At 400x200 (80K cells), 1000-item cursor move is 14.8ms (borderline 60fps).

## Bottleneck analysis

- Buffer clone: 320KB Uint32Array.set + Map copies. Likely 200-500µs.
- Tree traversal: still O(dirty × depth) but with more visible nodes
- Buffer writes: more cells to write for each dirty node (wider lines)

## Proposed optimizations

1. No-clone double buffer: swap instead of clone. Save 200-500µs/frame.
- Two TerminalBuffers, swap refs after each frame
- Dirty nodes write to "next" buffer at their positions
- Clean regions: copy only the dirty spans, not the entire buffer
6. Viewport culling: skip renderNodeToBuffer for off-screen nodes
- Check node.boxRect against viewport bounds before entering
- For scroll containers, already handled. For non-scroll, new check needed.
10. Dirty-span output: output phase already has dirty-row tracking, extend to dirty-column spans

## Benchmark baseline (400x200)

- Cursor move 100 items: 1.309ms (3.5x vs 80x24's 0.374ms)
- Cursor move 1000 items: 14.815ms (4.4x vs 80x24's 3.394ms)
- Resize 1000 items: 19.550ms (2x vs 80x24's 9.8ms)
- Kanban 5x50: 3.572ms (1.4x vs 80x24's 2.489ms)

