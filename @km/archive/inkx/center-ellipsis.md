---
mentions:
  - km
  - claude
id: "@km/inkx/center-ellipsis"
aliases:
  - km-inkx.center-ellipsis
  - km-inkx-center-ellipsis
created_by: claude:a5c7f7de
created_at: 2026-02-14T22:54:55Z
closed_at: 2026-02-14T23:00:02Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Use center ellipsis (⋯) instead of regular ellipsis (…) for text truncation @km/inkx #feature #P2 @claude:a5c7f7de

When wrap="truncate" clips text, inkx currently appends … (U+2026, regular ellipsis). Change to ⋯ (U+22EF, midline horizontal ellipsis) for a vertically centered appearance.

This is in the inkx text rendering pipeline — likely in content-phase.ts or wherever wrap=truncate is implemented.

