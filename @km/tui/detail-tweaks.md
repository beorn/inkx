---
id: "@km/tui/detail-tweaks"
aliases:
  - km-tui.detail-tweaks
  - km-tui-detail-tweaks
created_by: claude:54aefa32
created_at: 2026-02-18T00:12:11Z
closed_at: 2026-02-18T07:51:19Z
owner: bjorn@stabell.org
assignee: claude:54aefa32
---

# [x] Detail pane: props formatting, content indent, title dedup @km/tui #task #P2 @claude:54aefa32

Detail pane and card display improvements for imported Asana data viewing:

## Tasks
1. **Strip metadata/blockid from card display** — getDisplayContent() returns raw node.content which includes created:: and ^blockid. Apply stripForDisplay() to all content return paths in TreeNode.tsx getDisplayContent()
2. **Detail pane content raw rendering** — Content section should show raw text (not indented, not markdown-rendered). User says 'render it raw for now'
3. **Detail pane subtasks as outline** — Instead of truncated subtask list, render KNode children like an outline (indented tree). No premature truncation.
4. **Grey out props for completed tasks** — start/due dates and other props should be dimmed when task is completed (no red due date on done tasks)
5. **Comment filter in convert path** — DONE: Added filterSystemComment call in convert.ts
6. **Comment filter regex fix** — DONE: Fixed splitIntoBlocks regex for \u00AD separator
7. **Comment filter tests** — IN PROGRESS: Background agent creating test fixtures