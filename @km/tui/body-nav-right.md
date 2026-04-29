---
id: "@km/tui/body-nav-right"
aliases:
  - km-tui.body-nav-right
  - km-tui-body-nav-right
created_by: claude:a5c7f7de
created_at: 2026-02-14T21:57:00Z
closed_at: 2026-02-15T17:47:57Z
---

# [x] l from body column goes to board title instead of next column @km/tui #bug #P2

When pressing l from the virtual body/Description column of a .md file, cursor goes to board title first, then to the first structural column. Expected: l should go directly to the next column. Headless tests with item.paragraph() pass — may be specific to real file body content layout or ViewNavigation ordering.