---
id: "@km/inbox/ssn3o"
aliases:
  - km-ssn3o
  - "@km/_orphan/ssn3o"
created_by: claude:97b8de73
created_at: 2026-02-22T20:48:13Z
closed_at: 2026-02-22T22:14:51Z
owner: bjorn@stabell.org
---

# [x] ctrl-c/ctrl-z don't work during loading or in board @km/_orphan #bug #P2

ctrl-c doesn't work during initial loading (before board opens) or while in the board. Same with ctrl-z and other common stty bindings. These should work as expected: ctrl-c to quit/interrupt, ctrl-z to suspend.