---
id: "@km/rev-arch-0130/3-fix-missing-repo-di-in-bd-ts-query-calls"
aliases:
  - km-rev-arch-0130.3
  - km-rev-arch-0130-3
  - "@km/rev-arch-0130/3"
created_at: 2026-01-30T00:35:27Z
closed_at: 2026-02-03T15:24:42Z
---

# [x] Fix missing Repo DI in bd.ts query calls @km/rev-arch-0130 #bug #P2 @claude:da8e4a66

Critical: bd.ts:94 calls queryReady() without passing { repo } parameter. All @km/beads query functions need explicit Repo injection.