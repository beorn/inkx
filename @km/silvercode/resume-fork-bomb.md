---
id: "@km/silvercode/resume-fork-bomb"
aliases:
  - km-silvercode.resume-fork-bomb
  - km-silvercode-resume-fork-bomb
created_by: claude:2405c72e
created_at: 2026-04-26T07:21:09Z
closed_at: 2026-04-26T07:39:02Z
close_reason: "Shipped: silvercode c74f8df16 + tests f0b6691e8.
  process-supervisor.ts (328 lines): pidfile + child-pgid registry + reaper.
  clampLayoutForResume forces initialSessions=1. spawn.ts onSpawn/onExit
  callbacks. 32 tests across 3 files. Session: km-session.0425-evening"
---

# [x] silvercode --resume can fork-bomb the machine @km/silvercode #bug #P1 @claude:2405c72e

blocks:: [[@km/silvercode]]

User reports silvercode --resume took down entire machine via process accumulation. Mechanism: each launch spawns initialSessions (1/2/4) × claude (700MB virtual) × N MCP grandchildren. spawn.ts:194 uses detached:true so when parent dies hard (machine kill), children survive as init-owned orphans. Repeated launches accumulate without cleanup. Defensive fixes needed: (1) startup orphan scan — kill leftover claude pgids from previous silvercode instances of same vault; (2) lock file or pidfile per --resume <id> to prevent concurrent attaches; (3) consider --resume defaulting initialSessions=1 (resume is for one session, not grid).