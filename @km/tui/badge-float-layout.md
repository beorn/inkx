---
id: "@km/tui/badge-float-layout"
aliases:
  - km-tui.badge-float-layout
  - km-tui-badge-float-layout
created_by: Bjørn Stabell
created_at: 2026-04-14T18:59:53Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.badge-float-layout
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T11:59:53Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Render priority/date badges as floating elements, not a reserved column @km/tui #feature #P3

blocks:: [[@km/tui]]

Reported via /pm with screenshot (Today — 2026-04-14/15 card).

**Current behavior**: priority + date badges (P0 Tomorrow, P1 Today, etc.) render as flex children in the head-row. Because they have flexShrink=0 and the title has flexGrow=1/flexShrink=1, the title column is narrowed across ALL wrapped lines — line 1 AND lines 2+. On multi-line tasks, the entire right-side badge column remains unused on lines 2+, looking table-like.

**Desired**: CSS 'float: right' semantics — line 1 is narrowed to make room for the badge, lines 2+ use the full card width. Content wraps around the badge instead of beside it.

**Screenshot 2026-04-14 11.47.31**:

    ┌────────────────────────────────────────────────────────┐
    │ Pay CA FTB $2,500 via ftb.ca.gov/pay/ → Web   P0 Tomorrow│
    │ Pay → Extension Payment Form 3519 → tax                │  ← wasted right space
    │ year 2025. IRS = $0 (federal refund).                  │  ← wasted right space
    └────────────────────────────────────────────────────────┘

    vs desired:

    ┌────────────────────────────────────────────────────────┐
    │ Pay CA FTB $2,500 via ftb.ca.gov/pay/ → Web   P0 Tomorrow│
    │ Pay → Extension Payment Form 3519 → tax year 2025. IRS │  ← full width
    │ = $0 (federal refund).                                  │
    └────────────────────────────────────────────────────────┘

**Implementation options**:

1. **position: absolute + manual text pre-wrap** (medium complexity)
   - Badge: `position='absolute' top=0 right=0`
   - Content: wrap text manually so line 1 is max (width - badgeWidth), lines 2+ max width
   - Custom wrap calculator using measureText helpers
   - Most faithful to CSS float, no new silvery primitive

2. **New silvery primitive: `float='right'` on Box** (hard, biggest payoff)
   - Extends flexily layout to handle floats
   - Universal: any component with floating children gets this behavior for free
   - Requires deep flexily changes (CSS float is non-trivial — intrusions into adjacent flex items)

3. **Pre-compute line 1 vs line N widths in TreeNode** (low complexity, @km/tui only)
   - TreeNode measures badge width at render, splits title into two Texts:
     - First text: sliced at line-1-max-chars, wraps within (width - badgeWidth)
     - Second text: remainder, wraps within full width
   - No silvery changes. But fragile — edge cases with inline formatting spans crossing the split point
   - Doesn't reuse for other badge-like cases

4. **Accept current behavior** (do nothing)
   - Narrow content on multi-line tasks is consistent but wastes horizontal space
   - Users with 80-col terminals would notice more; wide-terminal users less

**Recommendation**: Start with option 3 as a @km/_orphan/tui-local fix. If it works well, consider promoting to option 2 as a silvery primitive. Option 1 is similar to option 3 but wraps the code differently.

**Files to touch for option 3**:
- apps/@km/tui/src/views/TreeNode.tsx (HeadRow layout, around line 820-848)
- Maybe a new helper in apps/@km/tui/src/text/ for line-width splitting

**Tests**: snapshot test with a long task title + P0 Tomorrow, verify line 2+ extends beyond the badge-reserved column.