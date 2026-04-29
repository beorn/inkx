---
id: "@km/silvery/flag-emoji-garble"
aliases:
  - km-silvery.flag-emoji-garble
  - km-silvery-flag-emoji-garble
created_by: claude:65d845d9
created_at: 2026-03-13T12:02:40Z
closed_at: 2026-03-13T12:02:48Z
close_reason: "Fixed: Added isFlagSequence() detection to wrapTextSizing for OSC
  66 wrapping, and cursor re-sync to bufferToAnsi after wide chars. Both fresh
  and incremental render paths now handle flag emoji correctly. Verified in TTY
  at 220x50 with Asana launch-academy vault — j+l+h round-trip clean, no
  garble."
owner: bjorn@stabell.org
assignee: claude:65d845d9
---

# [x] Flag emoji (🇨🇦) causes cursor drift garble at wide terminals @km/silvery #bug #P2 @claude:65d845d9

Bug: After j+l at 200+ cols with flag emoji in title, first column shows duplicate card content, stale borders, and overlapping cards.

Root cause: xterm.js and some terminals treat flag emoji (regional indicator sequences like 🇨🇦) as two width-1 chars instead of one width-2 char. bufferToAnsi had no cursor re-sync after wide chars, so the initial full render created terminal state shifted by 1 column per flag emoji. Subsequent changesToAnsi incremental renders used CUP positioning, so changed cells were correct but unchanged cells retained the shifted positions from the initial render — creating visible garble.

Fix: Two complementary fixes in output-phase.ts:
1. Added flag emoji detection (isFlagSequence) to wrapTextSizing — wraps flag emoji in OSC 66 to force width 2 on terminals supporting text sizing protocol.
2. Added cursor re-sync to bufferToAnsi after every wide char — emits explicit CUP to correct cursor position, matching the existing re-sync in changesToAnsi. This is the primary fix for terminals without OSC 66.