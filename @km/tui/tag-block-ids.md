---
id: "@km/tui/tag-block-ids"
aliases:
  - km-tui.tag-block-ids
  - km-tui-tag-block-ids
created_by: claude:8f007ba9
created_at: 2026-02-20T22:36:38Z
closed_at: 2026-02-20T23:33:12Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Tag files show bare numeric GIDs instead of resolved task titles @km/tui #bug #P1 @claude:8f007ba9

In the detail pane / board view, tag files (#home, #w, #norway, etc.) show bare numeric block IDs instead of resolved task titles.

**Screenshot**: 2026-02-20 22:35:09

**What's shown**: Checkmarks/boxes followed by long numeric IDs (e.g., 1213738..., 0952808...)
**What should show**: Task titles (e.g., "Clean-up after trip", "Fix EPD", etc.)

**Root cause**: Tag file items are embed references `![[^GID]]` in heading lines. The markdown looks correct:
```
## [x] Clean-up after trip ![[^1138180707609595]]
```

But the TUI is rendering only the numeric GID, not the full title. Either:
1. The parser creates separate embed/link nodes that only carry the GID as content
2. The inline text pipeline doesn't hide block refs in this context
3. The smart resolver isn't being called for these references

Related: @km/tui/detail-render (P1, in_progress) — other detail pane rendering issues