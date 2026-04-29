---
id: "@km/tui/inline-images"
aliases:
  - km-tui.inline-images
  - km-tui-inline-images
created_by: claude:8f007ba9
created_at: 2026-02-19T18:54:07Z
closed_at: 2026-02-19T19:04:43Z
---

# [x] Import: Asana inline images not downloaded @km/tui #bug #P2 @claude:8f007ba9

14 occurrences of https://asanausercontent.com URLs in task bodies. These are inline images from Asana's rich text notes. The attachment downloader only processes the ## Attachments section. Result: broken images in body + duplicate in Attachments section. Should download inline body images too, or replace with local paths.