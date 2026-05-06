---
mentions:
  - km
  - claude
id: "@km/tui/omnibox-search"
aliases:
  - km-tui.omnibox-search
  - km-tui-omnibox-search
created_by: claude:28b14b32
created_at: 2026-02-23T12:18:36Z
closed_at: 2026-02-23T12:34:11Z
owner: bjorn@stabell.org
assignee: claude:28b14b32
---

# [x] Omnibox: add vault-wide content search mode @km/tui #feature #P2 @claude:28b14b32

Merge the standalone 'search' dialog into the omnibox. The omnibox already does fuzzy matching over commands and goto locations — add vault-wide node title/content search as an additional mode. This eliminates a separate dialog and gives one 'go to anything' entry point. Remove the standalone search command after migration. The omnibox becomes: commands + goto locations + content search.

