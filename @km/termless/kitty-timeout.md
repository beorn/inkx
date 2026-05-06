---
mentions:
  - km
  - claude
id: "@km/termless/kitty-timeout"
aliases:
  - km-termless.kitty-timeout
  - km-termless-kitty-timeout
created_by: claude:4929065a
created_at: 2026-03-24T05:49:37Z
closed_at: 2026-03-24T07:10:29Z
close_reason: "Fixed: batch-replay via execFileSync instead of broken fd-based
  IPC. Kitty 49/62→57/62 (92%). 8 timeout annotations removed."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Fix kitty backend Python subprocess timeouts in census @km/termless #bug #P2 @claude:4929065a

8 of 13 kitty failures are 'spawnSync ETIMEDOUT' — the Python subprocess bridge takes too long. Either increase the timeout, batch multiple probes into one subprocess call, or keep the Python process alive across probes instead of spawning per-query.

