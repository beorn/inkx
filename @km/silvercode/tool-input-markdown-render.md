---
id: "@km/silvercode/tool-input-markdown-render"
aliases:
  - km-silvercode.tool-input-markdown-render
  - km-silvercode-tool-input-markdown-render
created_by: claude:1eb07bba
created_at: 2026-04-26T05:49:56Z
closed_at: 2026-04-26T06:01:07Z
close_reason: "Implemented in 59e50f180: SessionCard paddingRight=2,
  ToolCallBlock single-line collapsed via wrap=truncate, markdown-bearing tool
  inputs render via MarkdownView, MarkdownTable adds light row dividers when >=3
  rows. Visual tests (77) all green."
started_at: 2026-04-26T05:57:32Z
owner: bjorn@stabell.org
assignee: claude:bc3eb794
dependencies:
  - issue_id: km-silvercode.tool-input-markdown-render
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T22:54:00Z
    created_by: claude:bc3eb794
    metadata: "{}"
---

# [x] Tool input markdown render: optional markdown rendering inside expanded tool-call input args @km/silvercode #feature #P4 @claude:bc3eb794

blocks:: [[@km/silvercode]]

When tool-call inputs are expanded, args are rendered as plain text. Add optional markdown rendering for input args so prompts/descriptions display with formatting (bold, code, lists). Polish bead from session.