---
id: "@km/tui/detail-pane-render"
aliases:
  - km-tui.detail-pane-render
  - km-tui-detail-pane-render
created_by: claude:fcaad2fa
created_at: 2026-02-18T11:57:44Z
closed_at: 2026-02-18T22:38:08Z
owner: bjorn@stabell.org
---

# [x] Detail pane: render body/subitems as column, show attachment links @km/tui #feature #P2

Detail pane improvements:

1. **Strip metadata from title**: content field includes raw metadata markers (@assignee, due::, created::, completed::, +tag). Strip them for display — show only the clean title text. Root cause: ast2nodes.ts:340 sets content=text without stripping parsed metadata.

2. **Task marker in title**: Show task status icon (▢/◧/■/▣) before the title, same as card view. Use getStatusIcon() from text/index.ts.

3. **Projects on one line**: Show all projects the node belongs to on a single line like tags (e.g., Projects: Biz, Fam Travel, PA).

4. **Render body/subitems as column**: Body content (blockquotes) and child items should render like a column view (TreeNode-style), not raw text.

5. **Attachment links**: Show attachments as clickable/readable links, not raw URLs.