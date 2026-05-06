---
mentions:
  - km
id: "@km/tui/test-theme"
aliases:
  - km-tui.test-theme
  - km-tui-test-theme
created_by: claude:e7c823b8
created_at: 2026-02-26T16:54:39Z
closed_at: 2026-02-26T17:48:57Z
owner: bjorn@stabell.org
---

# [x] TUI tests: set explicit theme to decouple from default theme changes @km/tui #task #P3

Currently @km/tui tests assert raw ANSI color indices (e.g. toBe(3) for yellow, toBe(8) for gray). Any theme token value change cascades into dozens of test updates.

Fix: Add a TEST_THEME_COLORS mapping table in test helpers that maps $token names to ANSI color indices. Tests reference the table instead of magic numbers:

```ts
// helpers/theme.ts
export const TC = {
  "\$selected": 3,
  "\$selectedfg": 0,
  "\$text3": 8,
  "\$separator": 8,
  "\$error": 1,
  // ...
} as const

// in tests:
expect(cell.bg).toBe(TC['\$selected'])
```

One table to update when theme changes, instead of hundreds of scattered magic numbers. Optionally also set a hardcoded frozen test theme so tests don't depend on the default theme at all.

