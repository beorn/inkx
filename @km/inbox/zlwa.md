---
id: "@km/inbox/zlwa"
aliases:
  - km-zlwa
  - "@km/_orphan/zlwa"
created_at: 2026-01-25T02:05:15Z
closed_at: 2026-01-25T02:13:17Z
---

# [x] j/k navigation doesn't work in TUI board view @km/_orphan #bug #P1

User reports that pressing j/k keys does nothing when running `km view /tmp/tst-vault3`.

Expected: j/k should move cursor down/up between cards
Actual: No visible response to j/k keypresses

To reproduce:
1. km view /tmp/tst-vault3
2. Press j or k
3. Nothing happens

Need to investigate:
- Are keybindings registered?
- Is handler being called?
- Is state updating but not re-rendering?
- Are there cards to navigate between?