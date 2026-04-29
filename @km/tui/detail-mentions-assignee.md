---
id: "@km/tui/detail-mentions-assignee"
aliases:
  - km-tui.detail-mentions-assignee
  - km-tui-detail-mentions-assignee
created_by: claude:fcaad2fa
created_at: 2026-02-18T13:39:00Z
closed_at: 2026-02-18T14:03:07Z
---

# [x] Detail pane: Mentions shows assignee (should be filtered out) @km/tui #bug #P3

Detail pane shows 'Mentions: @bjorn-stabell' even when that person is the assignee (already shown in Assigned field). The code in MetadataTable filters nonAssigneeMentions but it's not matching — likely because node.assigned_to differs from the mention string (e.g., 'bjørn-stabell' vs 'bjorn-stabell' or different format).