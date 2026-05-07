# Theming reference

> This page has been merged into reference/theme.
> 
> The separate "theming" reference page existed to describe $-token shorthand, <ThemeProvider>, useTheme, and per-subtree overrides. With Sterling, all of that lives alongside the Theme / DesignSystem types on one page.

## Jump to the relevant section

| Looking for                          | Now lives at                            |
| ------------------------------------ | --------------------------------------- |
| Theme type                           | reference/theme — Theme                 |
| DesignSystem contract                | reference/theme — DesignSystem          |
| ThemeProvider                        | components/ThemeProvider                |
| useTheme()                           | reference/theme — useTheme              |
| $-token shorthand                    | reference/theme — resolveThemeColor     |
| Per-subtree override via <Box theme> | reference/theme — Per-subtree override  |
| Color level degradation              | guide/theming — Color level degradation |
| Built-in bundled schemes             | guide/color-schemes                     |
| CLI styling helpers                  | reference/style                         |

## Migration from v0.18 and older

Older docs had separate `reference/theme.md` (Theme type) and `reference/theming.md` (`$`-tokens, `ThemeProvider`, overrides). That split pre-dated Sterling and existed to keep the Theme reference small.

Sterling's Theme unifies the flat `$`-token form and the nested role form on the same object. The old `theming.md` reference described alias behavior (`$accent` → `$primary`, `$muted` → `$text2`) that silvery 0.19.0 removes in a clean break. Tokens and types now live on one reference page.

See the [silvery 0.19.0 changelog](https://github.com/beorn/silvery/blob/main/CHANGELOG.md) for the complete before/after migration map.

