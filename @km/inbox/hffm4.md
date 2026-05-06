---
mentions:
  - km
id: "@km/inbox/hffm4"
aliases:
  - km-hffm4
  - "@km/_orphan/hffm4"
created_at: 2026-01-29T23:09:21Z
closed_at: 2026-02-02T10:38:33Z
---

# [x] Cleanup old inkx patterns: createTestRenderer, stdin.write, renderStatic @km/_orphan #task #P2

This bead is BLOCKED by inkx-mig.

Once inkx-mig removes createTestRenderer entirely, this bead becomes:

- Migrate km tests from createTestRenderer to render()
- Migrate stdin.write() to app.press()

DO NOT START until inkx-mig is complete - otherwise you'll be migrating to an API that will change.

Depends: inkx-mig

Labels: [chore inkx]

