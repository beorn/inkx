---
id: "@km/rev-0129/6-fix-inverted-pyramid-code-layout-in-cli-commands"
aliases:
  - km-rev-0129.6
  - km-rev-0129-6
  - "@km/rev-0129/6"
created_at: 2026-01-29T16:36:05Z
closed_at: 2026-01-29T18:09:24Z
---

# [x] Fix inverted pyramid code layout in CLI commands @km/rev-0129 #task #P3 @claude:298008b9

13 files have main logic buried after helpers. Key files:
- apps/@km/_orphan/cli/src/commands/daemon.ts:613 (first export at line 613)
- apps/@km/_orphan/cli/src/commands/sh.ts:297
- apps/@km/_orphan/cli/src/commands/list.ts:183
- apps/@km/_orphan/cli/src/commands/init.ts:123
- apps/@km/_orphan/cli/src/commands/sync.ts:175

Move exports/main logic to top, helpers to bottom. Look for duplicate helper patterns across files.