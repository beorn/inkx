---
id: "@km/tui/auto-theme"
aliases:
  - km-tui.auto-theme
  - km-tui-auto-theme
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:32:43Z
closed_at: 2026-03-04T16:23:53Z
---

# [x] Auto-detect light/dark terminal theme via OSC 10/11 @km/tui #feature #P2

Query terminal bg color on startup via queryBackgroundColor() + detectColorScheme(). Auto-switch between defaultDarkTheme and defaultLightTheme. Cache result to avoid startup latency.

Files: @km/tui theme.ts, tui.tsx, inkx terminal-caps.ts
Depends on: @km/silvery-legacy/osc-fg-bg