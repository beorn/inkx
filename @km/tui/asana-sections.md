---
mentions:
  - km
  - claude
id: "@km/tui/asana-sections"
aliases:
  - km-tui.asana-sections
  - km-tui-asana-sections
created_by: claude:8f007ba9
created_at: 2026-02-20T16:55:32Z
closed_at: 2026-02-20T17:48:46Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Asana import: group items by assignee_section in detail pane @km/tui #feature #P2 @claude:8f007ba9

The Asana import captures assignee_section data (stored as asana_assignee_section in node metadata), but the markdown doesn't include section headers. In My Tasks views, items should be grouped under sections like 'Recently assigned', 'Today', 'Upcoming', etc.

Need to either:

1. Emit section heading nodes during markdown generation (import time)
2. Or group by asana_assignee_section at render time in the detail pane

Option 1 is preferred — the markdown should represent the structure.

