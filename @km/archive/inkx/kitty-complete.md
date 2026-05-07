---
mentions:
  - km
  - claude
id: "@km/inkx/kitty-complete"
aliases:
  - km-inkx.kitty-complete
  - km-inkx-kitty-complete
created_by: claude:d3a7049b
created_at: 2026-02-20T13:42:59Z
closed_at: 2026-02-20T13:55:15Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Complete Kitty keyboard protocol support @km/inkx #task #P2 @claude:d3a7049b

Remaining gaps for full Kitty protocol support:

1. **Event types**: Parse event_type from CSI codepoint;modifiers:event_type u (1=press, 2=repeat, 3=release). Currently regex captures it but value is discarded.
2. **Higher flags**: Enable flags beyond 1 (disambiguate). Add flag 2 (report events) and flag 8 (all keys). Configurable via enableKittyKeyboard(flags).
3. **Protocol detection**: Query terminal with CSI ? u, parse response to detect support level.
4. **Test driver kitty mode**: app.press() should use keyToKittyAnsi() when kitty mode is active, so super modifier works in tests.
5. **Hyper modifier**: Parse bit 16 (hyper) in addition to existing shift/alt/ctrl/super.

