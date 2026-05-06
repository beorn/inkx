---
mentions:
  - km
  - claude
id: "@km/tui/link-color"
aliases:
  - km-tui.link-color
  - km-tui-link-color
created_by: claude:d697f216
created_at: 2026-02-25T11:58:42Z
closed_at: 2026-02-25T12:33:21Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] Link styling: remove nested Text inside Link, use Link props for variants @km/tui #bug #P2 @claude:d697f216

InlineBareURL wraps content in <Text dim> inside <Link>, which conflicts with Link's own <Text color underline>. Two issues:

1. Nested <Text dim> overrides Link's color (both link types appear same background but different color)
2. Should not set styling for Text inside Link — rely on Link props instead

Fix: Add dim prop to Link component, pass it from InlineBareURL instead of wrapping in <Text dim>. Link handles all its own styling.

