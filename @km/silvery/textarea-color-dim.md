---
id: "@km/silvery/textarea-color-dim"
aliases:
  - km-silvery.textarea-color-dim
  - km-silvery-textarea-color-dim
created_by: claude:1eb07bba
created_at: 2026-04-26T05:44:52Z
closed_at: 2026-04-26T06:38:43Z
close_reason: "Shipped: 1110d888 (silvery). color + dim props for muted body
  text. 3 tests. Session: km-session.0425-evening"
---

# [x] TextArea: color/dim prop so unfocused TextArea body renders muted @km/silvery #feature #P3 @claude:2405c72e

blocks:: [[@km/silvery]]

silvercodes CommandBox has two stacked TextAreas (queue + command). Today only the prompt glyph and divider title swap colors based on focusedRegion; the body text in the unfocused TextArea stays at full fg. Per TODO at apps/silvercode/src/components/CommandBox.tsx:118-121, add a color prop (or dim boolean) to silverys TextArea so the unfocused regions body renders at fg-muted. Acceptance: when focusedRegion=queue, command body is muted; when focusedRegion=command, queue body is muted. Implementation likely in vendor/silvery/packages/ag-react/src/ui/components/TextArea.tsx — pipe a color prop through to rendered Text spans.