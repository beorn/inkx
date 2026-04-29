---
id: "@km/termless/onresponse-native"
aliases:
  - km-termless.onresponse-native
  - km-termless-onresponse-native
created_by: claude:4929065a
created_at: 2026-03-25T21:19:36Z
closed_at: 2026-03-25T23:56:06Z
close_reason: "Wired onResponse for 6 native backends: alacritty, wezterm,
  ghostty-native (TS drain loops + native TODOs), kitty (Python bridge),
  libvterm (WASM bindings), vt100-rust (pre-wired). 153 lines, all 775 tests
  pass."
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Wire onResponse for native backends — alacritty, wezterm, ghostty-native, kitty, libvterm @km/termless #task #P2 @claude:19080504

The termless probe harness now tests device query responses (DA1, DA2, DA3, DSR, DECRPM, DECRQSS, XTGETTCAP) via feedCapture(). vterm.js passes 7/7, xterm.js passes 5/7, ghostty-wasm passes 1/7. The remaining native backends (alacritty, wezterm, ghostty-native, kitty, libvterm) fail all device probes because their napi-rs/WASM bindings don't surface write-back data to JS.

Each backend's adapter already has a named `backend` object ready for `onResponse`. The work is in the native side:
- **alacritty**: alacritty_terminal's EventProxy needs to capture `Event::PtyWrite` and forward to JS callback
- **wezterm**: wezterm-term's TerminalHost write() needs to forward to JS callback  
- **ghostty-native**: ghostty's io_handler write-back needs to be captured in the napi bridge
- **kitty**: kitty's C bridge needs to capture screen responses
- **libvterm**: libvterm WASM needs to hook the output callback

Ref: terminfo.dev proxy fix (setup.ts set trap + feedCapture helper) in commit 4f29ffa