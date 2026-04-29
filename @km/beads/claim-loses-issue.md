---
id: "@km/beads/claim-loses-issue"
aliases:
  - km-beads.claim-loses-issue
  - km-beads-claim-loses-issue
created_by: claude:da9990c5
created_at: 2026-04-28T01:45:37Z
closed_at: 2026-04-28T02:29:38Z
close_reason: Fixed in commit d14054dd6 (preserve data blob on update; remove
  obsolete assignee mirror). updateIssueFields now merges currentData when
  priority/type change, preserving id/aliases/short_id. Verified by inspecting
  packages/km-beads/src/mutations.ts:142-183 and
  apps/km-cli/src/commands/bd.ts:340-341 caller passing node.data through.
  Sister fix for close/drop in commit 3309b3512.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.claim-loses-issue
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-27T18:45:57Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [x] bd update --claim removes issue from indexable set @km/beads #bug #P1

blocks:: [[@km/beads]]

After 'bd update <id> --claim' on the /tmp/@km/_orphan/bd-sample-11544 fixture, the issue (silvercode/acp/rename) disappears from 'bd list' and resolveShortId() can no longer find it by canonical id or alias. The .md file on disk still has 'id:' and 'aliases:' frontmatter, but the storage row is no longer queryable by them. 

Repro:
  cd /tmp/@km/_orphan/bd-sample-11544
  bun km bd list                         # 3 issues shown
  bun km bd update silvercode/acp/rename --claim
  bun km bd list                         # 2 issues — rename gone
  bun km bd show silvercode/acp/rename   # Issue not found
  bun km bd show @km/silvercode/acp-rename # Issue not found

Likely root cause: updateNode with assigned_to + status+ task marker writes a partial 'data' patch that erases data.id and data.aliases. mutations.ts only emits a dataPatch when priority/type changed, but a task-marker change may take a separate path through repo.updateNode that overwrites the data blob.

Acceptance: claim preserves data.id + data.aliases; resolveShortId still finds the issue by both forms after claim.