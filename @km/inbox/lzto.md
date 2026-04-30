---
id: "@km/inbox/lzto"
aliases:
  - km-lzto
  - "@km/_orphan/lzto"
created_at: 2026-01-20T10:38:18Z
closed_at: 2026-01-20T10:54:45Z
---

# [x] Add emoji/ZWJ sequence tests to inkx @km/_orphan #task #P1

Ensure emoji with Zero Width Joiner sequences render correctly.

Test cases:
- Simple emoji (😀, ❤️)
- Skin tone modifiers (👋🏽)
- ZWJ family sequences (👨‍👩‍👧‍👦)
- Flag sequences (🇺🇸)
- Emoji in truncation scenarios
- Emoji width calculation

These are known edge cases in terminal rendering.