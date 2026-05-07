---
mentions:
  - km
  - claude
id: "@km/rev-arch-0130/2-fix-km-beads-layer-violation-direct-fs-imports"
aliases:
  - km-rev-arch-0130.2
  - km-rev-arch-0130-2
  - "@km/rev-arch-0130/2"
created_at: 2026-01-30T00:35:27Z
closed_at: 2026-02-03T15:24:42Z
assignee: claude:da8e4a66
---

# [x] Fix km-beads layer violation (direct fs imports) @km/rev-arch-0130 #bug #P2 @claude:da8e4a66

Critical: @km/beads/src/sync.ts and migrate.ts directly import node:fs (existsSync, writeFileSync, mkdirSync). App layer should not touch Filesystem directly - should go through Storage layer or defer to CLI.

