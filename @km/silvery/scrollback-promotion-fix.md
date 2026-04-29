---
id: "@km/silvery/scrollback-promotion-fix"
aliases:
  - km-silvery.scrollback-promotion-fix
  - km-silvery-scrollback-promotion-fix
created_by: Bjørn Stabell
created_at: 2026-04-01T07:28:34Z
closed_at: 2026-04-01T07:52:16Z
close_reason: "Fixed. Tests were designed for inline mode but emulator path now
  defaults to fullscreen (alternateScreen: true). Added { alternateScreen: false
  } to all 8 run() calls. All pass."
---

# [x] 4 scrollback promotion tests failing — border preservation + blank screen @km/silvery #bug #P2

Pre-existing failures in scrollback-promotion.test.tsx:
- fully promoted boxes lose border characters
- promoted boxes lose bottom border before entering scrollback
- screen goes blank after Enter presses (small + very small terminals)

These are inline rendering bugs, not caused by the emulator path changes.