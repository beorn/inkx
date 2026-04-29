---
id: "@km/infra/dolt-migrate"
aliases:
  - km-infra.dolt-migrate
  - km-infra-dolt-migrate
created_by: claude:73c2828f
created_at: 2026-02-15T13:14:42Z
closed_at: 2026-03-09T22:07:21Z
close_reason: "Grooming: experimental, abandoned, 17+ days stale"
owner: bjorn@stabell.org
---

# [x] Retry bd SQLite → Dolt migration @km/infra #task #P4

bd migrate dolt currently fails with path conflict:
  Error: mkdir .beads/beads.db: not a directory

Likely a bd bug — it tries to mkdir on the existing beads.db file path instead of creating .beads/dolt/.
Check if a newer bd version fixes this, or file upstream.

Benefits of Dolt: bd diff, bd branch, bd history (git-like versioning at SQL level).
Current SQLite works fine — this is nice-to-have.