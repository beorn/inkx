---
mentions:
  - km
  - claude
id: "@km/tui/raw-id-tasks"
aliases:
  - km-tui.raw-id-tasks
  - km-tui-raw-id-tasks
created_by: claude:d697f216
created_at: 2026-02-25T11:24:02Z
closed_at: 2026-02-25T13:22:03Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] All embedded links (wikilinks, blockrefs) must resolve to target titles @km/tui #bug #P1 @claude:d697f216

Block references like ^1210156063601370 (Asana GIDs) and wikilinks like [[^nodeId]] should resolve to their target node's display title everywhere they appear — cards, detail pane, inline text. Currently they show raw IDs as underlined text.

Requirements:

- InlineWikiLink: if target doesn't resolve, show a fallback like the raw target (without ^) or 'linked task'
- InlineBlockRef: currently renders null (hidden). If it's the only content in a line (e.g., 'See ^GID'), it should try to resolve and show the title
- Asana GIDs (numeric) should resolve via repo.resolveNode() or repo.getNode()
- ULIDs like (01KJ4BKE) appearing as text should also resolve

Visible in screenshots: 'See ^1210156063601370' shown as underlined raw number, '(01KJ4BKE)' as truncated raw ID.

