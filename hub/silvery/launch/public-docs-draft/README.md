# Sterling-aware public doc drafts

Internal drafts for silvery.dev's 12 theme-related pages, rewritten for Sterling (silvery 0.19.0).

**Status**: DRAFT, awaiting 0.19.0 ship. Bead `km-silvery.sterling-public-docs`.

## Promotion path

These files are organized to mirror `vendor/silvery/docs/*` exactly. On 0.19.0 ship:

1. `bd update km-silvery.sterling-public-docs --claim`
2. Copy each draft to the corresponding `vendor/silvery/docs/` path (1-to-1 tree mapping)
3. Walk through the `<!-- TODO: verify after 0.19.0 ships -->` comments at the bottom of each page and confirm against the shipped API — remove when verified, update text if the guess was wrong
4. `bun run docs:build` from `vendor/silvery/` to catch broken internal links
5. Run through the rendered pages on a local VitePress server for Vue-component compatibility (ThemeExplorer on `themes.md`)
6. Commit + push silvery; GH Pages workflow deploys to silvery.dev
7. Close the bead

Do NOT write directly into `vendor/silvery/docs/` before 0.19.0 — the currently-shipping content must stay 0.18.x-correct.

## Files

| Path                                | Status           | Source of truth                                                      | Notes                                                              |
|-------------------------------------|------------------|----------------------------------------------------------------------|--------------------------------------------------------------------|
| `guide/sterling.md`                 | **new**          | `hub/silvery/launch/sterling-introduction.md`, `design/v10-terminal/design-system.md` | Reference-context tightening of the blog post                      |
| `guide/styling.md`                  | **rewritten**    | `vendor/silvery/docs/guide/styling.md` (old 10 principles)           | Ten principles rebuilt around Sterling flat tokens                 |
| `guide/theming.md`                  | **rewritten**    | `vendor/silvery/docs/guide/theming.md`                               | Theme-as-value, ThemeProvider, runtime swap, DesignSystem packages |
| `guide/token-taxonomy.md`           | **rewritten**    | `vendor/silvery/docs/guide/token-taxonomy.md`                        | Channel-role-state grammar, every Sterling token                   |
| `guide/custom-tokens.md`            | **rewritten**    | `vendor/silvery/docs/guide/custom-tokens.md`                         | Token packs + writing a DesignSystem                               |
| `guide/color-schemes.md`            | **updated**      | `vendor/silvery/docs/guide/color-schemes.md`                         | 22-slot scheme, 84 catalog, derivation rules, auto-lift guardrails |
| `guide/the-silvery-way.md`          | **surgical**     | `vendor/silvery/docs/guide/the-silvery-way.md`                       | Principle 6 updated; other 9 untouched                             |
| `reference/theme.md`                | **rewritten**    | `vendor/silvery/docs/reference/theme.md`                             | Theme type (flat + nested), DesignSystem contract, derivation      |
| `reference/theming.md`              | **merged stub**  | `vendor/silvery/docs/reference/theming.md`                           | Redirects to `reference/theme.md` + migration notes                |
| `reference/style.md`                | **updated**      | `vendor/silvery/docs/reference/style.md`                             | `@silvery/ansi` chainable API + Sterling token resolution          |
| `components/ThemeProvider.md`       | **updated**      | `vendor/silvery/docs/components/ThemeProvider.md`                    | Props, nesting, runtime swap, cross-system adapters                |
| `themes.md`                         | **minor**        | `vendor/silvery/docs/themes.md`                                      | Updated tagline + cross-links; `<ThemeExplorer />` Vue component preserved |

## What needed the most work

Ranked by effort:

1. `guide/styling.md` — complete rewrite of the 10-principle rule book around `$fg-*` / `$bg-*` / `$fg-on-<role>`. Every code example, every smell table row, every decision-tree step changed.
2. `guide/theming.md` — shifted from "configure silvery's theme system" framing to "theme is a plain value you compute and pass in; ThemeProvider is the scoping primitive; DesignSystems are swappable packages."
3. `guide/token-taxonomy.md` — entire grammar changed (categorical `$red`/`$blue` ring removed in favour of channel-role-state; `$brand` moved to the input layer).
4. `guide/custom-tokens.md` — old doc was about per-app `defineTokens()`; new doc covers both token packs AND publishing a DesignSystem package.
5. `reference/theme.md` — reorganized around the Sterling flat+nested intersection type and the `DesignSystem` contract.

The other 7 are meaningful updates but not full rewrites.

## SEO pages (do NOT touch)

The user's instructions explicitly scope this work to the 12 theme pages above. Pages where silvery.dev's SEO surface matters (each has its own ranking signal) and are NOT part of this bead:

- `silvery-vs-ink.md`
- `silvery-vs-textual.md`
- `silvery-vs-blessed.md`
- `silvery-vs-bubble-tea.md`
- Any `getting-started/*` pages
- Any `examples/*` pages
- The root landing page

These stay on their current content until separate bead/PR work updates them.

## Cross-page link audit

Internal links I used across these drafts, for sanity-checking during promotion:

| From                              | To                                                 |
|-----------------------------------|----------------------------------------------------|
| every page's "See also"            | `/guide/sterling`, `/guide/styling`, `/guide/theming`, `/guide/token-taxonomy`, `/guide/color-schemes`, `/guide/custom-tokens`, `/reference/theme`, `/themes` |
| `guide/sterling`                  | external design spec link at `github.com/beorn/silvery/blob/main/docs/design/design-system.md` (the public mirror; internal spec lives in `hub/silvery/design/v10-terminal/design-system.md`) |
| `guide/the-silvery-way` principle 6 | `/guide/sterling`, `/guide/styling`, `/guide/token-taxonomy`, `/themes` |
| `reference/theming`               | Collapsed into `/reference/theme`                   |
| `components/ThemeProvider`        | `/guide/theming`, `/guide/sterling`, `/reference/theme`, `/guide/custom-tokens`, `./Box` |

## Consistency conventions across the drafts

- **Import path**: `import { run, design, schemes, ThemeProvider, useTheme } from "silvery"` for the user-facing surface; `@silvery/design` / `@silvery/ansi` for advanced / library-author cases.
- **Scheme lookup**: `schemes.nord` (barrel) and `getScheme("nord")` (runtime lookup). Guessed — flag if the shipped API differs.
- **Derivation entry points**: `design.deriveFromScheme(scheme)`, `design.deriveFromColor(color)`, `design.deriveFromSchemeWithBrand(scheme, brand)`, `design.deriveFromPair(light, dark)`, `design.theme({...})`.
- **Auto-detection**: `detectTermScheme()` — called internally by `run()` when no `theme` option is supplied.
- **Flat form is everyday**: every JSX example uses `$fg-accent` / `$bg-surface-subtle` / `$fg-on-error`; nested form shown only for programmatic access.
- **Typography presets** are unchanged (`<H1>`, `<Muted>`, `<Small>`, `<Code>`, …) — they still compose color + attr internally.

## Ambiguities flagged (TODO markers in drafts)

All drafts end with a `<!-- TODO: verify after 0.19.0 ships -->` comment. The most uncertain calls I made:

- **`design` barrel export name** — assumed `design` from `silvery` re-exports Sterling. Could also be `sterling` or `designSystem`.
- **`extend:` option on `deriveFromScheme`** vs a separate `defineTokens()` API. I went with `extend:` for token packs because it composes naturally with the `DeriveOptions` pattern.
- **Border tokens for semantic roles** (`$border-error`, `$border-warning`). The design spec mentions `border.default` / `.focus` / `.muted` as core; role-tinted borders are a natural extension but not explicitly enumerated. Flagged in `token-taxonomy.md`.
- **CLI style keys**: assumed `s["fg-accent"]("...")` bracket access works for hyphenated Sterling tokens. If the actual API camelCases (`s.fgAccent("...")`), flip the syntax in `reference/style.md`.
- **`pickColorLevel` / `bakeFlat` import paths** — placed in `@silvery/ansi` per design-system.md. Could be `@silvery/design` or a deeper subpath.
- **Deprecation/alias paragraph in `reference/theming.md`** — the old `$accent → $primary` aliases are listed as "removed in 0.19.0 per the clean break." If any alias survives for migration, reinsert.
- **`materialToSterling` adapter** — illustrated pattern, not a shipped import. The spec says "apps write an explicit adapter function"; confirm whether `@silvery/design-material` actually exposes one.

## What I did NOT draft

- Examples / playground pages.
- `silvery-vs-*` comparison pages.
- The landing page.
- Code (src) changes — this bead is docs-only. Source changes ride with `sterling-2a-data-layer` through `sterling-2d-release`.

## Deliverable summary

- 12 pages drafted (11 new/rewritten + 1 surgical-edits copy of `the-silvery-way`).
- 1 README (this file).
- All files match `vendor/silvery/docs/<path>` 1:1 — copy-in without renaming on promotion.
- VitePress-compatible markdown throughout (`::: tip`, `<Badge>`, `<script setup>` for `themes.md`).
- No `vendor/silvery/` changes — draft-only.
