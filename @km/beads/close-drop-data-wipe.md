---
mentions:
  - km
id: "@km/beads/close-drop-data-wipe"
aliases:
  - km-beads.close-drop-data-wipe
  - km-beads-close-drop-data-wipe
created_by: claude:da9990c5
created_at: 2026-04-28T01:54:57Z
closed_at: 2026-04-28T02:29:38Z
close_reason: Fixed in commit 3309b3512. closeIssueFields/dropIssueFields now
  accept currentData and merge it into the data write, preserving
  id/aliases/short_id/mentions/tags when a reason is set. CLI callers in
  apps/km-cli/src/commands/bd.ts read node.data and pass it through. 3 new tests
  in packages/km-beads/tests/mutations.test.ts pin the invariant. 22/22 tests
  pass.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.close-drop-data-wipe
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-27T18:54:57Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-beads
---

# [x] bd close / bd drop wipe data.id, aliases via partial updates.data write @km/beads #bug #P2

blocks:: [[@km/beads]]

closeIssueFields and dropIssueFields in mutations.ts have the same structural flaw that @km/beads/claim-loses-issue had: when --reason is passed, they emit updates.data = { closeReason / dropReason }, which the storage layer treats as a full replacement, wiping data.id, aliases, short_id, tags, mentions, etc.

Fix: accept currentData in closeIssueOptions / dropIssueOptions, merge into the partial. Symmetric to the fix in commit d14054dd6.

Repro: cd /tmp/@km/_orphan/bd-sample-11544; bun km bd close <id> --reason='done'; check json_extract(data, '$.id') in state.db.

