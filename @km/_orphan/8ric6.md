---
id: "@km/_orphan/8ric6"
aliases:
  - km-8ric6
created_by: claude:ceb7c9cb
created_at: 2026-03-24T18:57:46Z
closed_at: 2026-03-24T22:10:42Z
close_reason: "Fixed: buffer.setCell now maintains wide/continuation pair
  consistency. When a border │ overwrites a CJK char's continuation cell, the
  wide flag on the main cell is cleared (and vice versa). Commit b91e3ca
  (silvery), 9e884c18 (km)."
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] fix: card borders broken on initial app render @km/_orphan #bug #P2 @claude:ceb7c9cb

Sometimes when starting km view, card borders render incorrectly — missing or garbled round border characters on first draw. Visible in screenshot 2026-03-24 at 11.56.38. May be a silvery incremental rendering issue where the first render doesn't correctly output border characters.