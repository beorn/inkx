---
id: "@km/silvercode/spawn-error-blank-screen"
aliases:
  - km-silvercode.spawn-error-blank-screen
  - km-silvercode-spawn-error-blank-screen
created_by: claude:cc081a9a
created_at: 2026-04-28T03:07:50Z
closed_at: 2026-04-28T03:11:46Z
close_reason: "Fixed in d42adb18b. Controller exposes
  lastSpawnError()/onSpawnError(); App.tsx renders alt-screen-visible banner
  when sessions empty + spawn error set. Verified: bun fix clean, 4/4 cli-smoke
  tests pass, manual welcome screen unaffected."
started_at: 2026-04-28T03:08:05Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvercode.spawn-error-blank-screen
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T20:08:05Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] [bug] silvercode shows blank screen when initial spawn fails — stderr hidden by alt-screen @km/silvercode #bug #P1 @claude:cc081a9a

blocks:: [[@km/silvercode]]

silvercode --account d@delei.org (no --resume) gives a blank screen.

ROOT CAUSE:
1. Controller's eager spawnSession() rejects (e.g. ACP connection closed,
   credentials missing, agent binary unavailable)
2. The catch handler writes the error to process.stderr
3. silvercode is in alt-screen mode → stderr is invisible
4. Sessions array stays empty, PaneGrid renders empty placeholder, the
   user sees a blank UI with no clue what went wrong

REPRO:
silvercode --account d@delei.org   # account that fails to spawn
=> alt-screen comes up
=> blank UI for the duration the user is willing to wait
=> spawn error visible only on stderr, only AFTER user kills the process

FIX (commit pending):
- Controller: tracks lastSpawnError and exposes onSpawnError(handler)
- App.tsx: subscribes; renders a visible error banner inside alt-screen
  when sessions.length === 0 AND spawnError is set
- The banner explains the failure, lists common causes, and tells the
  user how to quit (Ctrl+D twice)

This is a sister fix to @km/silvercode/resume-blank-screen — same shape
of bug (alt-screen swallows visibility), different trigger (initial
spawn vs --resume).