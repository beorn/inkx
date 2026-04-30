---
id: "@km/inbox/7wfx"
aliases:
  - km-7wfx
  - "@km/_orphan/7wfx"
created_at: 2026-01-20T11:24:04Z
closed_at: 2026-01-20T11:43:39Z
---

# [x] Consolidate chalk and inkx styling to fix visual bugs @km/_orphan #task #P1

Many visual bugs stem from mixing chalk ANSI codes with inkx styling. When chalk backgrounds are used inside inkx Boxes, they conflict because:
1. inkx Box backgroundColor fills the computed area
2. chalk ANSI codes in text override inkx styling for those characters only
3. Padding/empty space doesn't inherit chalk styling

Need to:
1. Audit all chalk usage in @km/_orphan/ink views
2. Decide on a clear policy: use inkx for component backgrounds, chalk only for inline text color
3. Refactor views to follow the policy
4. Consider creating a bridge utility if needed

Related bugs:
- Top bar background not spanning full width (fixed by using pure inkx)
- Possible cause of blank lines and filled space issues