---
mentions:
  - km
id: "@km/inbox/uv5o"
aliases:
  - km-uv5o
  - "@km/_orphan/uv5o"
created_at: 2026-01-20T10:37:49Z
closed_at: 2026-01-20T11:02:47Z
---

# [x] Test CJK/IME input handling in inkx @km/_orphan #bug #P0

Ink's #1 user pain point is CJK IME input (issue #759, 8+ reactions). Users report 200-500ms latency, character dropping, and cursor misalignment when typing Chinese/Japanese/Korean.

Actions needed:

1. Test inkx with actual CJK IME input (not just Unicode chars)
2. Test in terminal multiplexers (tmux, Zellij) - they have unique challenges
3. Consider implementing Synchronized Update Mode (CSI ? 2026h/l)
4. Test IME cursor positioning

Reference: https://github.com/vadimdemedes/ink/issues/759

