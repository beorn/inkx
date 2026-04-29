---
id: "@km/silvery/proto-reactive-theme"
aliases:
  - km-silvery.proto-reactive-theme
  - km-silvery-proto-reactive-theme
created_by: Bjørn Stabell
created_at: 2026-04-06T09:09:46Z
closed_at: 2026-04-06T09:59:51Z
close_reason: useColorScheme hook, ReactiveThemeProvider,
  COLOR_SCHEME_CAPABILITY, withTerminal creates detector. Auto-switches
  dark/light theme when Mode 2031 reports change. 11 tests. Silvery commit
  4e79cfd.
owner: bjorn@stabell.org
---

# [x] Mode 2031 → reactive theme switching (auto dark/light) @km/silvery #feature #P2

When Mode 2031 detects color scheme change, automatically switch silvery theme. useColorScheme() hook for apps that want to react. km gets auto-switching for free via ThemeProvider.

## Why
Currently dark/light is detected once at startup (macOS only). Mode 2031 enables reactive switching that works cross-platform including SSH.

## Depends on
@km/silvery/proto-startup-detect