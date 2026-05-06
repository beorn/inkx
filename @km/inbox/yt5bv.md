---
mentions:
  - km
  - claude
id: "@km/inbox/yt5bv"
aliases:
  - km-yt5bv
  - "@km/_orphan/yt5bv"
created_by: claude:b509d761
created_at: 2026-02-10T07:11:05Z
closed_at: 2026-02-10T08:38:13Z
owner: bjorn@stabell.org
assignee: claude:b509d761
---

# [x] Card text wraps past border into adjacent cards (DMV Updates) @km/_orphan #bug #P2 @claude:b509d761

Text in card child nodes with wrap='wrap' can wrap past the card border. The wrapped portion bleeds into the bottom border line. Example: 'Context: Found in inbox old DMV notices from 2019' wraps, and 'notices from 2019' appears embedded in the bottom border: ╰────notices from 2019───────────────╯. Root cause: TreeNode uses wrap='wrap' for multiline variant, but inkx bordered Box doesn't grow height to accommodate wrapped text lines. Fix: use wrap='truncate' for child nodes in cards view since they're previews, not full content.

