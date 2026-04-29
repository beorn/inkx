---
id: "@km/_orphan/ijn54"
aliases:
  - km-ijn54
created_by: claude:73d7a332
created_at: 2026-03-11T18:57:07Z
closed_at: 2026-03-12T01:38:53Z
close_reason: Moved createKittyManager + initKittyAutoDetection (~106 lines)
  from ink.ts to packages/term/src/kitty-manager.ts. Exported from
  @silvery/term. ink.ts now imports and uses a 10-line adapter
  (resolveKittyManagerOptions) to convert Ink flag names to bitmask. 223 compat
  tests pass.
owner: bjorn@stabell.org
assignee: claude:73d7a332
---

# [x] ink.ts: consolidate kitty protocol with @silvery/term @km/_orphan #task #P3 @claude:73d7a332
