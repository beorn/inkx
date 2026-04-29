---
id: "@km/tribe/ci-session-correlation"
aliases:
  - km-tribe.ci-session-correlation
  - km-tribe-ci-session-correlation
created_by: claude:19080504
created_at: 2026-04-01T06:11:35Z
closed_at: 2026-04-01T06:19:18Z
close_reason: "Implemented: track recent pushers per repo, DM sessions matching
  repo name on 3x failure"
---

# [x] CI: correlate failures to tribe sessions via commit/push timestamps @km/tribe #feature #P3 @claude:19080504

When CI fails, identify which tribe session pushed the breaking commit by correlating:
1. GitHub push event actor + timestamp
2. git plugin commit reports (session broadcasts 'Committed: hash')
3. Session registry (which session name maps to which project)

Then send a targeted DM to that session: 'Your push to repo broke CI — hash message'
Instead of broadcasting to all.