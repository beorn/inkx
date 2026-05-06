---
mentions:
  - km
  - claude
id: "@km/inbox/7dfxf"
aliases:
  - km-7dfxf
  - "@km/_orphan/7dfxf"
created_by: claude:73d7a332
created_at: 2026-03-11T07:23:37Z
closed_at: 2026-03-11T08:26:23Z
close_reason: "Fixed by output-phase cursor tracking rewrite (cc8251f). ╰ bottom
  borders are preserved - both on screen and in scrollback. Tests updated:
  scrollback-promotion.test.tsx, ai-chat.test.tsx verify borders survive in
  combined screen+scrollback text."
owner: bjorn@stabell.org
assignee: claude:73d7a332
---

# [x] Fix scrollback promotion truncating bottom borders (╰) @km/_orphan #bug #P2 @claude:73d7a332

When ScrollbackList promotes frozen content to terminal scrollback in inline mode, the bottom border character (╰) is missing from the scrollback buffer. The ╭ and │ characters survive but ╰ does not.

Reproduction: run ai-chat example with --fast, advance 4 times via Enter, check term.scrollback.getText() — has ╭ but not ╰.

Likely in output-phase.ts handleScrollbackPromotion() or the scrollback content generation in useScrollback. The frozen content string may be truncated at terminal height before the bottom border line is included.

