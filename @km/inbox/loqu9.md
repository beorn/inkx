---
mentions:
  - km
  - claude
id: "@km/inbox/loqu9"
aliases:
  - km-loqu9
  - "@km/_orphan/loqu9"
created_by: claude:fed8de9e
created_at: 2026-03-29T05:20:47Z
closed_at: 2026-03-29T05:30:59Z
close_reason: "Fixed: shifted punctuation text normalization in Kitty key parsing"
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Normalize shifted punctuation in Kitty key parsing @km/_orphan #bug #P2 @claude:fed8de9e

When Kitty protocol sends Shift+1 (codepoint 49, shifted_codepoint 33), key.text is '1' instead of '\!'. matchHotkey('\!') also fails because key.name is '1' + shift. Fix: when shift is held, shiftedKey exists, and no explicit text, use shiftedKey as text. Also normalize key.name for shifted punctuation so matchHotkey works.

