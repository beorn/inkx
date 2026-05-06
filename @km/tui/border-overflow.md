---
mentions:
  - km
  - claude
id: "@km/tui/border-overflow"
aliases:
  - km-tui.border-overflow
  - km-tui-border-overflow
created_by: claude:a5c7f7de
created_at: 2026-02-14T22:54:15Z
closed_at: 2026-02-14T23:00:53Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Card overflow: embed indicator in bottom border (dimmed pattern + count) @km/tui #feature #P2 @claude:a5c7f7de

Instead of adding any content for overflow indication, modify the card's bottom border to show overflow. Combine two approaches:

**Approach 6 (shadow/fade)**: Replace the bottom border line with a dimmed repeating pattern when content overflows
**Approach 7 (count in border)**: Embed +N into the bottom border: e.g. ╰──⋯+3⋯──╯

This replaces the current position:absolute ⋯ overlay in TreeNode.tsx.

Implementation options:

- Option A: Render card without bottom border, manually render custom bottom line
- Option B: Modify inkx to support custom bottom border content/override
- Option C: Use position:absolute to overlay the bottom border with custom content

The indicator should only appear when there are hidden children (overflow). When no overflow, the normal border renders.

