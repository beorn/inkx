---
id: "@km/_orphan/bxast"
aliases:
  - km-bxast
created_by: claude:65d845d9
created_at: 2026-03-13T02:27:06Z
closed_at: 2026-03-13T02:33:58Z
close_reason: "False positive: silvery's Text backgroundColor semantics
  intentionally color text content only, not full layout width. The trailing
  clear correctly uses inheritedBg. Confirmed by existing test: 'Text-only
  backgroundColor colors text content but does not fill Box width'."
---

# [x] renderText trailing clear ignores text node explicit bg @km/_orphan #bug #P2

Trailing clear uses inheritedBg ?? null but should use style.bg ?? inheritedBg ?? null for text nodes with own backgroundColor.