---
id: "@km/inkx/1-inkx-ghost-characters-when-re-rendering-shorter-co"
aliases:
  - km-inkx.1
  - km-inkx-1
  - "@km/inkx/1"
created_at: 2026-02-05T15:09:01Z
closed_at: 2026-02-05T15:44:35Z
assignee: claude:7a29df6e
---

# [x] inkx: ghost characters when re-rendering shorter content @km/inkx #bug #P3 @claude:7a29df6e

When switching between storybook sections in interactive mode, stray characters from the previous render appear at the right edge of content lines. Root cause: inkx doesn't clear to end-of-line when new content is narrower than previous frame. Visible in bun storybook interactive mode when navigating between sections of different widths.