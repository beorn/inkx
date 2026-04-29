---
id: "@km/terminfo/pro-review-content"
aliases:
  - km-terminfo.pro-review-content
  - km-terminfo-pro-review-content
created_by: claude:f8196c1c
created_at: 2026-03-26T05:44:43Z
closed_at: 2026-03-26T16:27:05Z
close_reason: P0 factual corrections done (VT510, escape sequence claims,
  xterm/Kitty over-crediting). P1 additions done (Why not terminfo, formal vs de
  facto, 15 glossary terms). P2 polish items tracked in
  km-terminfo.feature-history.
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] GPT Pro content review fixes: P0 factual corrections + P1 missing sections + P2 tone @km/terminfo #task #P2 @claude:f8196c1c

GPT 5.4 Pro reviewed /features, /standards, /glossary, /about pages ($7.20).

P0 — Factual:
- 'Every feature is an escape sequence' — false (wrapping, width are behaviors)
- 'Every escape sequence starts with ESC' — false (8-bit C1 forms)
- 'VT510 is DEC's final terminal' — wrong (VT520/VT525 followed)
- analysis.json arithmetic errors in missing-feature counts
- Over-crediting xterm/Kitty for inventions

P1 — Missing:
- 'Why not terminfo?' section on /about
- Formal vs de facto spec note on /standards
- Graphics category prose on /features
- Known limitations section (tmux/screen/ConPTY)
- Missing glossary terms (terminfo, termcap, ncurses, wcwidth, ZWJ, VS16, modifyOtherKeys, CSI u)

P2 — Tone:
- 'Any failure here is a bug' — too combative
- 'One person maintains the stack' — too sweeping
- 'Before Kitty, no terminal could...' — too absolute
- 'tested on every major terminal' — oversold

Full review: /tmp/llm-f8196c1c-review-these-terminfodev-pages-86x2.txt