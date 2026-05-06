---
mentions:
  - km
  - claude
id: "@km/termless/census-probe-bugs"
aliases:
  - km-termless.census-probe-bugs
  - km-termless-census-probe-bugs
created_by: claude:4929065a
created_at: 2026-03-23T22:13:37Z
closed_at: 2026-03-23T22:16:05Z
close_reason: Not probe bugs — real @xterm/headless limitations. See notes.
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Census probe bugs: scrollback accumulate + alt screen scrollback @km/termless #bug #P2 @claude:4929065a

Two suspicious census probe failures:

1. xterm.js AND ghostty both fail 'scrollback accumulates beyond screen height' — these are the two most mature backends, so the probe is likely wrong
2. vt100 AND vt100-rust both fail 'alternate screen has separate scrollback' — might be a real missing feature or probe issue

Need to investigate the probe code to determine if these are real backend bugs or probe bugs.

