---
id: "@km/flexily/no-cycle-guard"
aliases:
  - km-flexily.no-cycle-guard
  - km-flexily-no-cycle-guard
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:11Z
closed_at: 2026-03-13T05:42:57Z
close_reason: "Fixed: Added cycle guard to insertChild() in both node-zero.ts
  and classic/node.ts. Self-insertion and ancestor-insertion throw errors. Test
  added."
---

# [x] Bug: No cycle guard in insertChild() — self-insertion causes infinite loops @km/flexily #bug #P1
