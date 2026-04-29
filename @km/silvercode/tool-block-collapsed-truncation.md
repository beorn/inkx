---
id: "@km/silvercode/tool-block-collapsed-truncation"
aliases:
  - km-silvercode.tool-block-collapsed-truncation
  - km-silvercode-tool-block-collapsed-truncation
created_by: claude:1eb07bba
created_at: 2026-04-26T05:49:56Z
closed_at: 2026-04-26T06:01:07Z
close_reason: "Implemented in 59e50f180: SessionCard paddingRight=2,
  ToolCallBlock single-line collapsed via wrap=truncate, markdown-bearing tool
  inputs render via MarkdownView, MarkdownTable adds light row dividers when >=3
  rows. Visual tests (77) all green."
---

# [x] Tool block collapsed truncation: first-line wrap or configurable preview length instead of ellipsis @km/silvercode #feature #P3 @claude:bc3eb794

blocks:: [[@km/silvercode]]

When tool blocks are collapsed, current behavior truncates with ellipsis. Should instead show first-line wrap or configurable preview length so user can see meaningful content at a glance. Polish bead from session.