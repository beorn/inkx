---
id: "@km/body/2-phase-3-virtual-body-cards-within-columns"
aliases:
  - km-body.2
  - km-body-2
  - "@km/body/2"
created_at: 2026-01-23T15:22:14Z
closed_at: 2026-01-23T15:51:39Z
---

# [x] Phase 3: Virtual body cards within columns @km/body #task #P2

Apply extractBody at column level to separate body content from structural cards.

Key logic:
- If column has structural children (subsections), they become cards
- Non-structural children BEFORE first structural become body card
- If column has ONLY non-structural children (no subsections), they become regular cards (no body)

This means:
- Tasks before subsections → body card
- Tasks with no subsections → regular cards
- Recursive: applies at all depths

Also handle:
- Lists of lists (recursive body)
- Consider collapsing list container with list items