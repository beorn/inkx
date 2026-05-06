---
mentions:
  - km
  - claude
id: "@km/tui/detail-pane-v2"
aliases:
  - km-tui.detail-pane-v2
  - km-tui-detail-pane-v2
created_by: claude:fcaad2fa
created_at: 2026-02-18T13:39:15Z
closed_at: 2026-02-19T16:17:18Z
owner: bjorn@stabell.org
assignee: claude:fcaad2fa
---

# [x] Detail pane v2: match Asana quality — attachments, bullet formatting, subtasks as tasks @km/tui #feature #P2 @claude:fcaad2fa

Comparing our detail pane with Asana's shows major gaps:

**Missing from detail pane:**

- Attachments section (Asana shows links, Google Drive files, images)
- Rich text formatting in description (bullet points, links, indentation)
- Subtasks rendered as actual subtask cards with status/assignee/due (Asana shows a subtask list with checkboxes, assignees, due dates)
- Section headers within subtask list (e.g., 'Maybe someday')

**Styling issues:**

- Description text is plain — no bullet points, no bold/italic, no links
- Body content runs together instead of structured paragraphs

**Architecture question: unify node view types.**
Currently we have multiple ways to render a node:

1. Card view (TreeNode.tsx) — compact card in board column
2. Detail pane (DetailPane.tsx) — side panel with metadata + content
3. Zoomed column view — when you Enter into a section
4. Folder detail pane — outline of folder contents

Could the detail pane reuse the same rendering pipeline as cards (TreeNode/ColumnItems) for the content area? This would ensure consistency and reduce code duplication. The detail pane would be: metadata header + card-style content rendering.

See Asana screenshots at ~/Desktop/Screenshot 2026-02-18 at 13.30.49.png and 13.30.55.png for reference.

