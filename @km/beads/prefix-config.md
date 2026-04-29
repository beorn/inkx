---
id: "@km/beads/prefix-config"
aliases:
  - km-beads.prefix-config
  - km-beads-prefix-config
created_by: claude:da9990c5
created_at: 2026-04-28T00:31:15Z
closed_at: 2026-04-28T02:53:32Z
close_reason: Shipped in commit ede04bd5a (staged work was bundled into a peer
  agent's commit by concurrent git activity, but all code is present in that
  SHA).
owner: bjorn@stabell.org
---

# [x] Fix hardcoded PREFIX in short-ids.ts — read from .km/config.yaml @km/beads #task #P1

Replace const PREFIX = 'km' in packages/@km/beads/src/short-ids.ts:4 with config-driven prefix from .km/config.yaml. Acceptance: short-ids.ts reads prefix via @km/storage config; tests cover km/cloudi/custom prefixes; km bd info still shows current prefix (already does). Help text mentions prefix is per-repo.