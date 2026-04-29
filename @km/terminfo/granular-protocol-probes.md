---
id: "@km/terminfo/granular-protocol-probes"
aliases:
  - km-terminfo.granular-protocol-probes
  - km-terminfo-granular-protocol-probes
created_by: claude:27beac99
created_at: 2026-03-29T05:53:49Z
closed_at: 2026-03-29T05:57:57Z
close_reason: "11 new probes: 5 kitty keyboard flags (disambiguate,
  report-events, report-alternate, report-all-keys, report-text), 4 kitty
  graphics sub-features (transmit, display, animation, unicode-placeholders), 2
  OSC 52 variants (read, write). 38 annotations. Feature count now 164. Pushed
  124ca97."
owner: bjorn@stabell.org
assignee: claude:27beac99
---

# [x] Granular protocol probes: Kitty keyboard flags, Kitty graphics sub-features, mouse modes, OSC clipboard variants @km/terminfo #feature #P2 @claude:27beac99

Break down monolithic protocol probes into per-flag/sub-feature granularity.

Kitty Keyboard (5 flags — CSI > flags u):
- extensions.kitty-keyboard.disambiguate (flag 1)
- extensions.kitty-keyboard.report-events (flag 2)
- extensions.kitty-keyboard.report-alternate (flag 4)
- extensions.kitty-keyboard.report-all-keys (flag 8)
- extensions.kitty-keyboard.report-text (flag 16)

Kitty Graphics (sub-capabilities from APC query):
- extensions.kitty-graphics.transmit (a=t)
- extensions.kitty-graphics.display (a=p)
- extensions.kitty-graphics.animation (a=f)
- extensions.kitty-graphics.unicode-placeholders (U=1)

Mouse Protocols (already partially covered, ensure granular):
- Verify existing mouse mode probes cover SGR, urxvt, X10, button-event, all-motion, pixel

OSC Clipboard:
- extensions.osc52-read (query back)
- extensions.osc52-write (set only)

Each probe: term implementation sends CSI > flags u with specific flag, verifies terminal responds correctly for that flag level. Headless uses capability flags where available.