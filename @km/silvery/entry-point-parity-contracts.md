---
mentions:
  - km
  - claude
id: "@km/silvery/entry-point-parity-contracts"
aliases:
  - km-silvery.entry-point-parity-contracts
  - km-silvery-entry-point-parity-contracts
created_by: claude:c6244087
created_at: 2026-04-23T10:24:06Z
closed_at: 2026-04-23T10:48:26Z
close_reason: done in silvery 53ed28bf + km 4a2ccbfb4. New
  tests/contracts/entry-point-parity.contract.test.tsx pins 3 invariants across
  run/createApp.run/render/createTerm/createTermless. 7 tests passing.
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.entry-point-parity-contracts
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T03:24:06Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Extend defaults-contract convention — omit profile, assert defaults across run/createApp.run/render @km/silvery #task #P2 @claude:c6244087

blocks:: [[@km/silvery]]

Per /pro review. Phase 1 defaults-contract tests pin individual behaviors; extend to cross-entry-point parity — every entry point (run, createApp().run, render, createTermless, createTerm) must produce the same observable behavior when given identical options (including omitted profile). Catches drift between entry points.

