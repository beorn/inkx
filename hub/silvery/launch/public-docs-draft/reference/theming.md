# Theming reference

> **This page has been merged into [`reference/theme`](/reference/theme).**
>
> The separate "theming" reference page existed to describe `$`-token shorthand, `<ThemeProvider>`, `useTheme`, and per-subtree overrides. With Sterling, all of that lives alongside the Theme / DesignSystem types on one page.

## Jump to the relevant section

| Looking for                          | Now lives at                                                                |
|--------------------------------------|------------------------------------------------------------------------------|
| `Theme` type                          | [`reference/theme` — Theme](/reference/theme#theme)                         |
| DesignSystem contract                 | [`reference/theme` — DesignSystem](/reference/theme#designsysteminput)       |
| `ThemeProvider`                       | [`components/ThemeProvider`](/components/ThemeProvider)                     |
| `useTheme()`                          | [`reference/theme` — useTheme](/reference/theme#usetheme)                   |
| `$`-token shorthand                   | [`reference/theme` — resolveThemeColor](/reference/theme#resolvethemecolor) |
| Per-subtree override via `<Box theme>`| [`reference/theme` — Per-subtree override](/reference/theme#per-subtree-override-via-box-theme) |
| Color level degradation               | [`guide/theming` — Color level degradation](/guide/theming#color-level-degradation) |
| Built-in bundled schemes              | [`guide/color-schemes`](/guide/color-schemes#the-bundled-catalog-84-schemes) |
| CLI styling helpers                   | [`reference/style`](/reference/style)                                        |

## Migration from v0.18 and older

Older docs had separate `reference/theme.md` (Theme type) and `reference/theming.md` (`$`-tokens, `ThemeProvider`, overrides). That split pre-dated Sterling and existed to keep the Theme reference small.

Sterling's Theme unifies the flat `$`-token form and the nested role form on the same object. The old `theming.md` reference described alias behavior (`$accent` → `$primary`, `$muted` → `$text2`) that silvery 0.19.0 removes in a clean break. Tokens and types now live on one reference page.

See the [silvery 0.19.0 changelog](https://github.com/beorn/silvery/blob/main/CHANGELOG.md) for the complete before/after migration map.
