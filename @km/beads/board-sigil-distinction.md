---
id: "@km/beads/board-sigil-distinction"
aliases:
  - km-beads.board-sigil-distinction
  - km-beads-board-sigil-distinction
created_by: claude:da9990c5
created_at: 2026-04-28T01:34:36Z
closed_at: 2026-04-28T01:49:21Z
close_reason: Obsolete. The assignee surface now reads node.assigned_to (the
  structural KNode column) instead of inferring from data.mentions[0]. The
  parser-side question of whether @issue should land in mentions at all is moot
  for this concern — no bd consumer reads mentions for assignee anymore.
  Resolved in commit 47087a563.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.board-sigil-distinction
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-27T18:34:40Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [x] Parser: distinguish board sigil from person mention @km/beads #bug #P2

blocks:: [[@km/beads]]

km currently treats every @<word> in content as a 'mention' of an entity (data.mentions). Board sigils like @issue, @memory, @<board> are intended as kind tags, not assignee references. nodeToIssue picks mentions[0] as assignee, so every issue displays @issue as the assignee.