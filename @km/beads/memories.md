---
id: "@km/beads/memories"
aliases:
  - km-beads.memories
  - km-beads-memories
created_by: claude:da9990c5
created_at: 2026-04-28T00:32:03Z
closed_at: 2026-04-28T02:53:33Z
close_reason: Shipped in commit ede04bd5a (staged work was bundled into a peer
  agent's commit by concurrent git activity, but all code is present in that
  SHA).
owner: bjorn@stabell.org
---

# [x] @mem root + km bd remember/memories/prime @km/beads #task #P1

memories live as ## sections in mem/ tagged @memory; km bd remember --key foo upserts by heading slug; km bd memories lists/searches; km bd prime emits sections for hook injection. Acceptance: 3 current bd memories migrate cleanly; remember + read round-trip works; help text covers all three commands.