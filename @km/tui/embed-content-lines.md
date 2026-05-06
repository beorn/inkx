---
mentions:
  - km
  - claude
id: "@km/tui/embed-content-lines"
aliases:
  - km-tui.embed-content-lines
  - km-tui-embed-content-lines
created_by: claude:f8196c1c
created_at: 2026-03-28T00:33:16Z
closed_at: 2026-03-28T01:38:48Z
close_reason: "Fixed: body paragraphs (type=p, item=false) now render without
  bullet prefix and dimmed. isBody flag propagated through NodeChildren →
  TreeNode → FoldAwareChild → FoldedChildRow."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Body paragraphs render as bullet items instead of inline body text in cards @km/tui #bug #P1 @claude:f8196c1c

Paragraph children of tasks (type=p, item=false) render with bullet markers like sub-items, instead of as plain dimmed body text. This makes body content visually identical to sub-tasks.

Root cause: TreeNode renders ALL children through the same path — computeBulletIcon + buildPrefix. Paragraph nodes get fold markers (· or ●) even though they're body text, not items.

Fix: In TreeNode, detect paragraph children (type=p, item=false, no task_status) and render them differently:

- No bullet prefix (or just indentation)
- Dimmed text color
- wrap instead of truncate
- Not counted toward maxContentLines (they're body content, not sub-items)

Affects all cards, not just embeds. Most visible on @next board where transcluded tasks have body paragraphs.

