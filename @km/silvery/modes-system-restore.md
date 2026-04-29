---
id: "@km/silvery/modes-system-restore"
aliases:
  - km-silvery.modes-system-restore
  - km-silvery-modes-system-restore
created_by: claude:019d032d
created_at: 2026-04-22T21:17:17Z
---

# [ ] Modes.systemRestore(writeSyncFn) — writeSync-capable mode reset for signal handlers @km/silvery #task #P3

blocks:: [[@km/silvery]]

phase-4-modes found during Phase 4 (2026-04-22) that 3 legacy enableX/disableX call sites in create-app.tsx + terminal-lifecycle.ts use writeSync(fd, ansi) for signal-handler reliability (process exit, SIGTSTP/SIGCONT resume). The regular Modes API uses the write function injected at construction, which is stdout.write — async and not flushed before process.exit.

Proposal: add a Modes.systemRestore(writeSyncFn, options?) method that takes a synchronous write function (typically writeSync bound to process.stdout.fd) and emits the restore sequences for every mode this owner activated, in a single writeSync call. Intended for use from uncaughtException / SIGTERM / beforeExit paths.

This is the 'writeSync escape hatch' — modes' normal API stays async-clean, but emergency restore gets a tight, deterministic path.

Follow-up work, not blocking Phase 8 of @km/silvery/term-sub-owners.