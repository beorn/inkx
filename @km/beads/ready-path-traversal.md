---
mentions:
  - km
id: "@km/beads/ready-path-traversal"
aliases:
  - km-beads.ready-path-traversal
  - km-beads-ready-path-traversal
created_by: claude:da9990c5
created_at: 2026-04-28T01:34:41Z
closed_at: 2026-04-28T01:57:18Z
close_reason: The actual bug is in 'bd list --status <bd-flavor>'. The CLI
  accepts bd-flavor (open/in_progress/closed) but the underlying query DSL takes
  km-flavor (todo/wip/done), so 'bd list --status open' silently returned
  nothing. 'bd ready' itself works on path-form hierarchy. Fixed via
  normalizeStatus translation at the input boundary in shared-query.ts (commit
  pending).
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.ready-path-traversal
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-27T18:34:41Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-beads
---

# [x] bd ready: traverse path-form hierarchy and recognize file-level task_status @km/beads #bug #P2

blocks:: [[@km/beads]]

Today bd ready filters via the @issue board tag query (queryReady in queries.ts). With the path-form design where issues are file-level h-nodes (fstype:mdfile, parent_id pointing to a folder), the open epic at silvercode/acp.md doesn't show up — it has task_status=todo on the file node but the @issue sigil resolution treats it differently. Acceptance: bd ready returns all unblocked todo issues regardless of whether they live as inline tasks or file-level h-nodes; query understands path-prefix scoping (bd ready silvercode/ shows only silvercode descendants); help text mentions both forms work.

