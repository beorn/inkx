---
mentions:
  - km
  - claude
id: "@km/silvercode/message-stream-right-margin"
aliases:
  - km-silvercode.message-stream-right-margin
  - km-silvercode-message-stream-right-margin
created_by: claude:bc3eb794
created_at: 2026-04-26T05:54:42Z
closed_at: 2026-04-26T06:01:07Z
close_reason: "Implemented in 59e50f180: ChatPane paddingRight=2, ToolCallBlock
  single-line collapsed via wrap=truncate, markdown-bearing tool inputs render
  via MarkdownView, MarkdownTable adds light row dividers when >=3 rows. Visual
  tests (77) all green."
started_at: 2026-04-26T05:57:27Z
owner: bjorn@stabell.org
assignee: claude:bc3eb794
dependencies:
  - issue_id: km-silvercode.message-stream-right-margin
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T22:54:58Z
    created_by: claude:bc3eb794
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] Message stream lacks right margin/gutter against side panel @km/silvercode #bug #P3 @claude:bc3eb794

blocks:: [[@km/silvercode]]

In silvercode TUI, message stream content (especially wrapped tool-command blocks like 'Bash bd create ...') extends all the way to the side panel edge with no visual gutter. Should have a 2-space margin between message stream's right edge and the Sessions/Todos/Agents side panel for readability. Affects all message types but most visible on long wrapped tool commands. Screenshot: ~/Desktop/Screenshot 2026-04-25 at 22.53.48.png

