---
id: "@km/inkx/pua-ansi-size"
aliases:
  - km-inkx.pua-ansi-size
  - km-inkx-pua-ansi-size
created_by: claude:23485adf
created_at: 2026-02-24T11:47:05Z
closed_at: 2026-03-07T20:15:21Z
close_reason: "Measured: 0.8% total frame overhead (257 bytes on 31KB frame, 35
  PUA chars on 200x70 screen). Per-char is 4.3x but total impact is negligible.
  OSC 66 spec has no region/persistent mode — per-char wrapping is unavoidable.
  textSizing is already opt-in (off by default). No action needed."
---

# [x] Find way to not triple ANSI size with PUA - enable for entire buffer? @km/inkx #task #P1

PUA characters wrapped in OSC 66 escape sequences triple the ANSI output size. This is a massive overhead — need to find a way to batch or buffer-wide enable PUA sizing instead of per-character wrapping. Approaches to explore: (1) enable text sizing for entire buffer region rather than per-char, (2) cache known PUA widths and skip re-measurement, (3) only measure on first encounter then use cached width for subsequent frames.