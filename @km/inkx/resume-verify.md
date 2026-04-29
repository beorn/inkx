---
id: "@km/inkx/resume-verify"
aliases:
  - km-inkx.resume-verify
  - km-inkx-resume-verify
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:32:52Z
closed_at: 2026-03-04T16:23:36Z
owner: bjorn@stabell.org
---

# [x] Verify terminal modes after suspend/resume via DECRQM @km/inkx #feature #P3

After resumeTerminalState(), query DECRQM to verify alt screen (1049), cursor visibility (25), mouse (1000/1002), bracketed paste (2004) are in expected state. Re-enable any diverged modes.

Files: inkx runtime term-provider.ts
Depends on: @km/silvery-legacy/decrqm