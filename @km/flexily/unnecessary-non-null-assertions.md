---
id: "@km/flexily/unnecessary-non-null-assertions"
aliases:
  - km-flexily.unnecessary-non-null-assertions
  - km-flexily-unnecessary-non-null-assertions
created_by: claude:65d845d9
created_at: 2026-03-13T05:33:10Z
closed_at: 2026-03-13T05:39:16Z
close_reason: P4 — cosmetic TypeScript cleanup, not blocking
owner: bjorn@stabell.org
---

# [x] Unnecessary non-null assertions on always-defined variables @km/flexily #task #P4

layout-zero.ts uses non-null assertions (!) on variables that are always defined numbers: mainPos! (lines 1197, 1203, 1232, 1237, 1240, 1241, 1539, 1542, 1545, 1548), lineCrossOffset! (lines 1233, 1236, 1240, 1241), startOffset! (line 1010), itemSpacing (line 1015), currentItemSpacing! (lines 1542, 1548). These variables are initialized before the loop that uses them. The assertions are noise that obscures whether actual nullability exists. Remove them for clarity. [pro]