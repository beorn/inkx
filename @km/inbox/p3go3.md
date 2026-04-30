---
id: "@km/inbox/p3go3"
aliases:
  - km-p3go3
  - "@km/_orphan/p3go3"
created_by: claude:36393b5d
created_at: 2026-02-19T11:44:22Z
closed_at: 2026-02-19T11:48:13Z
owner: bjorn@stabell.org
---

# [x] inkx: OSC 8 hyperlinks corrupted in cell buffer @km/_orphan #bug #P1

OSC 8 hyperlink sequences from chalkx hyperlink() appear as visible garbage (]8;;URL) in terminal. Root cause: parseAnsiText() in unicode.ts only handles SGR, not OSC. Fix: add hyperlink to cell model, parse OSC 8 in parseAnsiText, emit in output phase.