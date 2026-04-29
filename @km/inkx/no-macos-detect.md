---
id: "@km/inkx/no-macos-detect"
aliases:
  - km-inkx.no-macos-detect
  - km-inkx-no-macos-detect
created_by: claude:aee18a0e
created_at: 2026-02-27T12:56:17Z
closed_at: 2026-03-04T16:23:29Z
owner: bjorn@stabell.org
---

# [x] Remove macOS-specific detectMacOSDarkMode from inkx terminal-caps @km/inkx #bug #P2

inkx/src/terminal-caps.ts shells out to 'defaults read -g AppleInterfaceStyle' — this is platform-specific and doesn't belong in a terminal UI framework. Theme detection should use only terminal protocols (COLORFGBG, OSC 11, etc.). Move macOS detection to @km/tui (app layer) or remove entirely in favor of OSC 11.