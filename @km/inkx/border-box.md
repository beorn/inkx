---
id: "@km/inkx/border-box"
aliases:
  - km-inkx.border-box
  - km-inkx-border-box
created_by: claude:36393b5d
created_at: 2026-02-19T13:46:51Z
closed_at: 2026-02-19T16:56:18Z
owner: bjorn@stabell.org
---

# [x] Border-box model: text bleeds into right border of Box with borderStyle @km/inkx #bug #P2

inkx uses content-box model for bordered boxes — text is rendered as if the full width is available, causing it to bleed into the right border character. This forces consumers to manually subtract border width (width-2, paddingRight={1}, etc.) as workarounds.

The fix: inkx should implement border-box sizing where the usable content width automatically excludes border characters. A Box with width=40 and borderStyle='single' should have 38 chars of content width, not 40.

Related: @km/tui/card-border-bleed (closed with workaround, real fix deferred to inkx). Currently worked around with paddingRight={1} in CardColumn.tsx — should be removed once this is fixed.