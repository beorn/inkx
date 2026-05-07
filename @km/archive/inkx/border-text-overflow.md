---
mentions:
  - km
  - claude
id: "@km/inkx/border-text-overflow"
aliases:
  - km-inkx.border-text-overflow
  - km-inkx-border-text-overflow
created_by: claude:a5c7f7de
created_at: 2026-02-14T22:30:47Z
closed_at: 2026-02-14T23:02:23Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Text content bleeds into right border of Box with borderStyle @km/inkx #bug #P2 @claude:a5c7f7de

When a Box has borderStyle='round' (or any border), text content overflows into the right border column. CardColumn.tsx works around this with paddingRight={1}, which creates visible extra whitespace. The border should automatically reserve space for its own rendering without requiring explicit padding. This bug has been reported and worked around 3+ times — each time the workaround gets removed, text bleeds into borders. The fix belongs in inkx's layout pipeline.

