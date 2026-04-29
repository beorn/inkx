---
id: "@km/tribe/startup-version-check"
aliases:
  - km-tribe.startup-version-check
  - km-tribe-startup-version-check
created_by: claude:19080504
created_at: 2026-03-27T05:24:45Z
closed_at: 2026-03-27T06:32:54Z
close_reason: "Implemented: MD5 hash of tribe.ts + lib/tribe/*.ts checked on
  startup. Re-execs with BUN_RUNTIME_TRANSPILER_CACHE=0 if hash changed.
  Published as @bearly/tribe v0.6.0."
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Check source hash on startup — force reload if code changed since last run @km/tribe #feature #P2 @claude:19080504

New MCP processes start with Bun-compiled cache of source at spawn time. Auto-reload only triggers on NEW commits that touch tribe code. If the process started after the commit, it never sees the diff and runs stale compiled code. Fix: on startup, hash tribe.ts + lib/tribe/*.ts, compare to a stored hash in the DB. If different, immediately re-exec (same as triggerReload). This eliminates the need to kill orphan duplicators.