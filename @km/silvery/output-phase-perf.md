---
id: "@km/silvery/output-phase-perf"
aliases:
  - km-silvery.output-phase-perf
  - km-silvery-output-phase-perf
created_by: Bjørn Stabell
created_at: 2026-04-07T19:34:47Z
closed_at: 2026-04-08T16:05:43Z
close_reason: "WONTFIX: 73-89% was SILVERY_STRICT overhead. Real output phase is
  0.2ms/frame. Content phase (153ms) is the actual bottleneck."
owner: bjorn@stabell.org
---

# [x] Silvery output phase (diff/ANSI) is 73-89% of cursor wall time @km/silvery #bug #P0

Silvery's output phase (buffer diff + ANSI/SGR generation) is 73-89% of cursor wall time. This is the real performance bottleneck behind the user-reported cursor sluggishness.

## Measurement (2026-04-07, HEAD b86f936d3)

\`\`\`
cursor-perf:200x60:100-cards     wall=2070ms  output=1581ms (76%)  content=163ms (8%)
cursor-perf:400x200:2000-cards   wall=12709ms output=11276ms (89%) content=405ms (3%)
\`\`\`

Per-press: ~104ms at 200x60 (100 cards). Fixed cost — barely scales with card count (104→111ms across 36x more cards). The bottleneck is per-frame, not per-node.

## Likely hotspot: findInheritedBg/Fg

Tree-walk analysis found findInheritedBg (render-phase.ts:1559-1608) walks the parent chain for EVERY text node during render. Runs hundreds of times per frame on large boards. Uncached O(depth) × O(text_nodes) = O(N × depth) per frame.

\`\`\`ts
function findInheritedBg(node: AgNode): InheritedBgResult {
  let current = node.parent
  while (current) {
    if (current.props.backgroundColor) return { color: parseColor(...), ... }
    if (current.props.theme) return { color: parseColor(theme.bg), ... }
    current = current.parent
  }
}
\`\`\`

Fix: cache inheritedBg on AgNode, invalidate when ancestor's backgroundColor/theme changes (dirty flag already propagates up via subtreeDirty).

## Other silvery tree-walk patterns contributing to output cost

| Pattern | File | Impact |
|---------|------|--------|
| findInheritedBg/Fg | render-phase.ts:1559 | **Critical** — runs per text node per frame |
| notifyLayoutSubscribers | layout-phase.ts:167 | Full DFS every frame — pre-filter by dirty flag |
| hasDescendantOverflowChanged | render-phase.ts:1458 | Recursive DFS on subtreeDirty nodes |
| markSubtreeLayoutSeen | layout-phase.ts (flexily) | Post-layout cleanup DFS |

## Investigation plan (incorporating Pro review)

### A. Phase timers
Measure separately inside the output phase:
- Buffer diff time
- SGR escape sequence generation
- Cursor positioning
- Write/flush time
- findInheritedBg time specifically

Count per frame: visible rows, total bytes written, changed rows, styled spans.

### B. Benchmark controls
Two baselines needed:
1. **Null sink** — all render/diff work, no terminal write (isolates CPU cost)
2. **Full redraw, no diff** — brute-force whole frame (if it wins, replace diff strategy)

### C. Benchmark matrix
Synthetic fixtures at multiple sizes:
- 100 / 1k / 5k visible rows
- Single-line change vs full redraw
- Selection move by one row
- Collapse/expand subtree

### D. Complexity sweeps
- Hold delta constant, increase N — plot for O(N²)
- Hold N constant, vary delta
- If doubling N quadruples time on small edits → quadratic diff path

### E. Flamegraphs
Use bun --cpu-prof or 0x. Look for hotspots in:
- LCS/Myers diff
- ANSI tokenization
- String concatenation / repeated joins
- Width calculation / grapheme segmentation
- findInheritedBg parent walks

### F. Common pathologies to check
- Diffing raw ANSI strings instead of logical cells
- Per-line diff nested inside whole-frame diff
- Repeated ANSI strip/re-tokenize on every compare
- Recomputing width/graphemes repeatedly
- Quadratic LCS on large row arrays

## Sequencing with P1

P0 investigation should start first (it's P0). But do final tuning AFTER @km/tui/hierarchical-node-state lands, since P1 may change:
- Number of rerenders (fewer, more targeted)
- Changed region size (smaller, more localized)
- Row identity stability (less churn)

## Acceptance

- [ ] Output phase < 30% of cursor wall time at 200x60, 100 cards
- [ ] Per-press latency < 50ms (current: 104ms)
- [ ] Stretch: < 16ms (feels instant)
- [ ] findInheritedBg cached (O(1) per node, not O(depth))
- [ ] No O(N²) in diff path (verified by complexity sweep)