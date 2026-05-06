---
mentions:
  - km
  - claude
id: "@km/terminfo/fundamentals"
aliases:
  - km-terminfo.fundamentals
  - km-terminfo-fundamentals
created_by: claude:f8196c1c
created_at: 2026-03-26T07:07:11Z
closed_at: 2026-03-26T07:25:57Z
close_reason: "5 fundamentals pages live: index, control characters, TTY
  architecture, stty, terminal detection. All with callouts, tables,
  cross-links."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Terminal Fundamentals pages: control characters, TTY architecture, stty, TERM @km/terminfo #feature #P4 @claude:f8196c1c

Educational reference pages covering terminal fundamentals that aren't escape sequences:

Pages:

- /fundamentals — index page: 'How Terminals Work'
- /fundamentals/control-characters — C0 controls (NUL, BEL, BS, TAB, LF, CR, ESC, DEL), ASCII table, what each does in a terminal
- /fundamentals/tty-architecture — PTY, kernel TTY discipline, shell, terminal emulator relationship diagram
- /fundamentals/stty — raw mode, canonical mode, echo, signal handling, cooked vs raw
- /fundamentals/term-detection — TERM, COLORTERM, DA1, DECRPM, terminfo, how apps discover capabilities

Content type: educational/reference (not feature matrix). Rich prose with diagrams, examples, glossary cross-links.

SEO value: 'ASCII control characters', 'what is raw mode', 'how does a PTY work', 'stty settings', 'TERM variable'.

Reinforces terminfo.dev as THE terminal reference site beyond just the compatibility matrix.

