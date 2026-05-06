---
mentions:
  - km
id: "@km/tui/text-input"
aliases:
  - km-tui.text-input
  - km-tui-text-input
created_by: Bjørn Stabell
created_at: 2026-03-31T19:24:45Z
owner: bjorn@stabell.org
---

# [ ] Text input: pass-through architecture for shift/opt/IME/dead-keys @km/tui #feature #P2

Umbrella: km's text input should never reconstruct characters from key codes. Always pass through what the terminal sends. Children: shift-chars (in progress), dead-key composition, IME multi-char, multi-byte emoji.

