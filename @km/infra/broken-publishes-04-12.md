---
mentions:
  - km
id: "@km/infra/broken-publishes-04-12"
aliases:
  - km-infra.broken-publishes-04-12
  - km-infra-broken-publishes-04-12
created_by: Bjørn Stabell
created_at: 2026-04-12T03:45:12Z
closed_at: 2026-04-12T04:10:54Z
close_reason: "Fixed by hotfix publishes: silvery 0.17.4, @silvery/commander
  0.17.5, vitest-silvery-dots 0.1.2, vimonkey 0.2.3.
  @silvery/test/create/headless/theme marked private (bundled into barrel). All
  verified passing 'bun release verify'."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.broken-publishes-04-12
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-11T20:45:28Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Hotfix broken packages found by /release verify @km/infra #bug #P1

blocks:: [[@km/infra]]

bun release verify found 4 broken packages just published in this session:

1. @silvery/commander@0.17.3 — bundle imports zod but not in dependencies
2. @silvery/test@0.17.3 — install crashes (likely missing dep)
3. @silvery/create@0.17.3 — install crashes
4. vitest-silvery-dots@0.1.0 — install crashes

To investigate each:
  bun release verify <pkg>

Then fix the missing dependencies, build, publish hotfix, re-verify.

