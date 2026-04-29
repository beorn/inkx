---
id: "@km/silvery/role-lanes-decide"
aliases:
  - km-silvery.role-lanes-decide
  - km-silvery-role-lanes-decide
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:06:32Z
---

# [ ] Role lanes — explicit DEFER decision, revisit at Cycle 3 @km/silvery #decision #P3

blocks:: [[@km/silvery/authoring-elegance]]

From 2026-04-21 elegance review: keep role-lanes (observer/targeted/global/fallback/middleware) OUT of definePlugin v1. Document as pipe-ordering policy only, not type-level tag. Zustand and Solid prove ceremony-free composition works; Slate is a cautionary tale against over-taxonomizing. Revisit when a concrete precedence bug survives discipline OR at Cycle 3 (2026-06-21), whichever is earlier. Supersedes the P3 implementation bead @km/silvery/tea-role-lanes until this decision is reversed.