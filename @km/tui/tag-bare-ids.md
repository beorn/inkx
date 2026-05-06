---
mentions:
  - km
id: "@km/tui/tag-bare-ids"
aliases:
  - km-tui.tag-bare-ids
  - km-tui-tag-bare-ids
created_by: claude:8f007ba9
created_at: 2026-02-20T07:43:18Z
closed_at: 2026-02-20T07:56:27Z
owner: bjorn@stabell.org
---

# [x] Tag columns show bare IDs instead of resolved task titles @km/tui #bug #P1

Tag files (#routine.md, #w.md, etc.) contain embed references like '## \![[^numericGID]]' pointing to tasks in other project files. The TUI shows these as bare truncated node IDs like '(01KHW46D)' instead of resolving them to task titles. Fix options: (1) During import: resolve embeds to inline content with task titles, or (2) During display: resolve link_to targets to show resolved content. Option 1 is simpler and more reliable — the converter already has access to all task data.

