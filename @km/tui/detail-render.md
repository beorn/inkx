---
id: "@km/tui/detail-render"
aliases:
  - km-tui.detail-render
  - km-tui-detail-render
created_by: claude:8f007ba9
created_at: 2026-02-20T16:53:21Z
closed_at: 2026-02-20T22:48:43Z
---

# [x] Detail pane rendering: bare links, partial bracket stripping, raw block IDs, ANSI artifacts @km/tui #bug #P1 @claude:8f007ba9

Multiple rendering issues in detail pane and board view after Asana import:

1. **Bare links**: URLs displayed as plain text, not styled as hyperlinks
2. **Partial bracket stripping**: `[tech]` renders as `ch]` — stripInlineRefs partially consuming square brackets
3. **Raw block IDs**: `^1202172587611250` visible in output instead of hidden
4. **ANSI artifacts**: text-pipeline.ts still uses ANSI escape sequences (chalk-style) for styling instead of inkx JSX components
5. **Autolink stripping**: `<URL>` autolinks deleted by HTML_TAG_REGEX (fix already in progress)

Root cause: text-pipeline.ts uses raw ANSI strings which break when truncated. Should use inkx `<Text>` components for all styling.

Screenshots: 2026-02-20 16:51:49, 16:51:08