---
id: "@km/_orphan/wsc4n"
aliases:
  - km-wsc4n
created_by: claude:c9beade3
created_at: 2026-03-13T23:21:16Z
closed_at: 2026-03-13T23:45:55Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] termless: backends fabricate unsupported state instead of null/unknown @km/_orphan #bug #P1 @claude:c9beade3

Found by GPT 5.4 Pro review (2026-03-13).

Files: packages/xtermjs/src/backend.ts:299-337, packages/ghostty/src/backend.ts:296-345, packages/wezterm/src/backend.ts:230-242, src/types.ts:66-78
Classification: P1

xterm reports cursorVisible: true and cursor style 'block' unconditionally; WezTerm hardcodes visibility; Ghostty always returns 'block' and never updates title. Makes assertions silently wrong.

Suggested fix: Return null or 'unknown' for unsupported values, or gate behind capabilities so matchers can fail fast or skip.