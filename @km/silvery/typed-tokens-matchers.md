---
id: "@km/silvery/typed-tokens-matchers"
aliases:
  - km-silvery.typed-tokens-matchers
  - km-silvery-typed-tokens-matchers
created_by: Bjørn Stabell
created_at: 2026-04-18T17:45:11Z
closed_at: 2026-04-18T18:27:14Z
close_reason: "Types portion shipped in v0.18.0: ThemeToken / StandardThemeToken
  / ColorRingToken / BrandToken / PaletteToken / KnownThemeToken / TextColor /
  ColorKeyword exported from @silvery/ansi. (string & {}) tail preserves
  autocomplete. Matchers (toHaveToken, toResolveToken) deferred — needs
  @termless/test or silvery test helper extension. Full PARTIAL closure: types
  done, matchers tracked separately."
---

# [x] TypeScript-enforced ThemeToken union + test matchers @km/silvery #task #P3

blocks:: [[@km/silvery/theme-system-v2]]

Type-safe token strings + test assertions.\n\nTypes:\n  type ThemeToken = union of all known tokens + brand hues + variants\n  type TextColor = ThemeToken | 'inherit' | 'currentColor' | (string & {})\n\n(string & {}) keeps string-assignable while preserving autocomplete.\n\nTest matchers:\n  expect(cell).toHaveToken('$bg-cursor')\n  expect(cell).toResolveToken('$primary', '#BD93F9')\n  expect(app.card('x')).toUseToken('fg', '$fg')\n\nDepends on: token-rename-primer (needs final names)\nSpec: hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p8