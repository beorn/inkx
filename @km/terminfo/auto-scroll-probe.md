---
id: "@km/terminfo/auto-scroll-probe"
aliases:
  - km-terminfo.auto-scroll-probe
  - km-terminfo-auto-scroll-probe
created_by: Bjørn Stabell
created_at: 2026-04-02T17:21:37Z
---

# [ ] terminfo.dev probe: auto-scroll-to-bottom behavior on output while scrolled up @km/terminfo #feature #P2

Most terminals auto-scroll to bottom when new output arrives while the user is scrolled up in the main buffer. This varies by terminal and is a key factor in the inline rendering dilemma. Add a probe that tests: 1) does output while scrolled up yank to bottom? 2) does synchronized output affect this? 3) any terminal setting to disable it? Track per-terminal.