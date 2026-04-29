---
id: "@km/tui/attachment-timestamps"
aliases:
  - km-tui.attachment-timestamps
  - km-tui-attachment-timestamps
created_by: claude:36393b5d
created_at: 2026-02-18T22:32:49Z
closed_at: 2026-02-19T06:38:25Z
---

# [x] Set created/modified time on downloaded attachments from Asana timestamps @km/tui #feature #P2 @claude:36393b5d

When downloading Asana attachments and files during import, set the file's created_at and modified_at timestamps to match the Asana metadata (created_at from the attachment API response). Currently downloaded files get the current timestamp, losing the original date information. Use utimes() or similar to set file timestamps after download.