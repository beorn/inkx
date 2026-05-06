---
mentions:
  - km
id: "@km/tui/multi-project"
aliases:
  - km-tui.multi-project
  - km-tui-multi-project
created_by: claude:fcaad2fa
created_at: 2026-02-18T15:17:22Z
closed_at: 2026-02-18T22:37:53Z
owner: bjorn@stabell.org
---

# [x] Detail pane shows only one project — should show all projects with sections @km/tui #bug #P2

Asana shows a task belongs to multiple projects with section context: 'FAMILY SPRINT (Waiting)' + '[Fam] Estate (Immigration)'. Our detail pane only shows Projects: #fam-estate. Missing: the FAMILY SPRINT project membership and section context for each project. The data exists in the repo (the node has parent_id in a column under FAMILY SPRINT, and has a +fam-estate tag). Need to resolve all project memberships and show them with their section names.

