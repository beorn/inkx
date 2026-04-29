---
id: "@km/flexx/fuzz-gaps"
aliases:
  - km-flexx.fuzz-gaps
  - km-flexx-fuzz-gaps
created_by: claude:b509d761
created_at: 2026-02-10T13:08:32Z
closed_at: 2026-02-10T13:20:39Z
owner: bjorn@stabell.org
assignee: claude:b509d761
---

# [x] Close 2 mutation testing coverage gaps in fuzz suite @km/flexx #bug #P2 @claude:b509d761

Mutation testing found 2 real coverage gaps: (1) skip-resetLayoutCache not caught — fuzz suite doesn't exercise scenarios where cache carries stale values across full calculateLayout calls. (2) always-return-cached-layout not caught — returning stale cache for dirty nodes not detected. Need new fuzz test groups targeting these specific cache code paths.