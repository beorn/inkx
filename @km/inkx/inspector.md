---
mentions:
  - km
  - claude
id: "@km/inkx/inspector"
aliases:
  - km-inkx.inspector
  - km-inkx-inspector
created_by: claude:ee8efc0f
created_at: 2026-02-23T01:22:20Z
closed_at: 2026-02-23T01:47:51Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] DevTools / Inspector for component debugging @km/inkx #feature #P3 @claude:ee8efc0f

Debug mode that shows component tree, focus path, render stats, and dirty regions. Inspired by Textual's devtools console. Could run in a second terminal window or activate via INKX_DEV=1 env var. Distinct from React DevTools — this is inkx-specific introspection for layout, rendering pipeline, and focus management.

