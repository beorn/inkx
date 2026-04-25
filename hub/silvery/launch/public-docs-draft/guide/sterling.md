---
title: Sterling
description: Silvery's default design system — Primer grammar, Material vocabulary, terminal scheme input, 84 themes out of the box.
---

# Sterling

<p class="page-tagline">Silvery's default design system — Primer grammar, Material vocabulary, terminal scheme input.</p>

Sterling is the design system Silvery ships with. It turns a terminal color scheme (Nord, Catppuccin, Tokyo Night — 84 bundled, or your own) into a full Theme of ~50 semantic tokens, preserving the user's palette instead of regenerating it from a seed.

Most apps never see the name. `import { run } from "silvery"` wires Sterling up by default.

```ts
import { run } from "silvery"
await run(<App />)
// Internally: theme = sterling.deriveFromScheme(detectTermScheme())
```

## At a glance

- **~80% Primer** — grammar (`fg-*` / `bg-*` / `-hover` / `-active`), `fg-on-<role>` pairs, surface hierarchy, state variants.
- **Material vocabulary** — `error` / `warning` / `success` / `info` / `accent`, not Primer's `danger` / `attention` / `severe`.
- **Preservative derivation** — 22-color terminal scheme → ~50 tokens via OKLCH. Nord stays Nord.
- **Flat tokens as the everyday surface** — `$fg-accent`, `$bg-surface-subtle`, `$fg-on-error`.
- **Structured shape under the hood** — `theme.accent.hover.bg`, typed and iterable.
- **Multi-target** — same Theme object consumed by terminal today, canvas and web next. See [positioning brief](/guide/the-silvery-way).

## The everyday surface

Flat `$token` strings in JSX:

```tsx
<Text color="$fg-accent">Selected</Text>
<Box backgroundColor="$bg-surface-subtle">Sidebar</Box>
<Text color="$fg-on-error" backgroundColor="$bg-error">Deploy failed</Text>
<Alert variant="error">Something went wrong</Alert>
```

Tokens read **channel-role-state** order — matches Primer and CSS custom property conventions:

| Token | Reads as |
|---|---|
| `bg-accent` | background of accent |
| `bg-accent-hover` | background of accent, in hover state |
| `fg-on-error` | foreground when on an error fill |
| `border-focus` | focus-state border |

Full grammar in [Token Taxonomy](./token-taxonomy).

## The structured form

The same Theme is a plain JS object. The flat `$`-strings and the nested properties reference the same hex strings:

```ts
theme.accent.bg                          // "#88C0D0" on Nord
theme.accent.hover.bg                    // OKLCH +0.04L shift
theme["bg-accent"] === theme.accent.bg   // true — same reference, not a copy
theme["bg-accent-hover"] === theme.accent.hover.bg
```

Use the nested form when you iterate programmatically or want typed discovery in an IDE:

```ts
for (const [state, pair] of Object.entries(theme.accent)) {
  // "fg", "bg", "fgOn", "hover", "active"
}
```

Full details in [Theming](./theming#two-shapes-one-object).

## Roles

Sterling ships six semantic roles plus surface + border primitives:

| Role      | What it means                      | Has state variants? |
|-----------|------------------------------------|---------------------|
| `accent`  | interactive brand / links / focus  | yes (hover, active) |
| `info`    | neutral information                | bg state only       |
| `success` | completed, passing                 | bg state only       |
| `warning` | caution, deprecation               | bg state only       |
| `error`   | failure, invalid                   | bg state only       |
| `muted`   | secondary text, captions           | no                  |

Plus:

- `surface.default` / `.subtle` / `.raised` / `.overlay` — z-depth hierarchy
- `border.default` / `.muted` / `.focus`
- `cursor.fg` / `cursor.bg`
- `fg-on-<role>` — text color when placed on a role's fill

Each role has a `bg` (fill), `fg` (text color as standalone), and `fgOn` (text on the fill). Only `accent` emits `fg.hover` / `fg.active` — status-role text isn't interactive.

## What Sterling does NOT ship

Each omission is deliberate.

**No `destructive` role.** A "Delete" button is an intent, not a status. `<Button variant="destructive">` aliases to `error` by default at the component layer. Keeps `error` / `destructive` / `danger` from drifting into four slightly different reds.

**No urgency axis.** No `priority="high"`, no `severe` / `catastrophic` color role. Urgency is conveyed by component choice (`<Toast>` vs `<Banner>` vs `<Dialog>` vs inline `<Alert>`), position, and content — not by tokens.

**No `brand` as a public role.** `brand` is a theme **input** (passed to `deriveFromSchemeWithBrand(scheme, brand)`). Components consume `accent`. Prevents the "which blue is which" drift.

Rationale: a small, opinionated vocabulary ages better than a big permissive one. Full reasoning in the [design spec](https://github.com/beorn/silvery/blob/main/docs/design/design-system.md).

## Derivation in one paragraph

Sterling takes a 22-color terminal scheme (ANSI 0–15 + base fg/bg + 4 semantic slots) and computes ~50 semantic tokens in OKLCH. `error.fg` = `scheme.red`, `warning.fg` = `scheme.yellow`, `accent.fg` = `scheme.primary`, surfaces blend bg 5/8/12% toward fg, hover/active states shift OKLCH ±0.04 / ±0.08L adaptively. Every text/bg pair runs a WCAG AA contrast check and auto-lifts user schemes that fall short. Catalog schemes (the 84 bundled) hard-fail in CI if they don't pass. Full rules in [Color Schemes](./color-schemes) and the [design spec](https://github.com/beorn/silvery/blob/main/docs/design/design-system.md#derivation-rules-default-preservative).

## Comparisons

| Axis                    | Sterling (default)        | Primer                   | Material 3              | shadcn                         |
|-------------------------|---------------------------|--------------------------|-------------------------|--------------------------------|
| Grammar                 | `fg-*` / `bg-*` / `-hover`| Same                     | camelCase `onPrimary`   | flat CSS vars                  |
| Vocabulary              | error / warning / success | danger / attention       | error / warning         | destructive / muted            |
| Input shape             | 22-color terminal scheme  | designer JSON            | 1 seed color            | curated light/dark pair        |
| Derivation              | **Preservative** OKLCH    | hand-curated             | generative HCT          | none (curated)                 |
| Token shape             | Nested JS + flat keys     | flat CSS vars            | nested JS               | flat CSS vars                  |
| Runtime swap            | yes                       | —                        | yes                     | via CSS vars                   |
| Auto-detect from env    | **yes (OSC 10/11)**       | —                        | Android wallpaper only  | —                              |

Full matrix in the [design spec](https://github.com/beorn/silvery/blob/main/docs/design/design-system.md#appendix-a--10-system-comparison-informs-vocabulary-choice).

## Swapping Sterling for another system

Design systems are packages:

```ts
import { run } from "silvery"
import { material } from "@silvery/design-material"

const theme = material.deriveFromColor("#FF6A00")
await run(<App />, { theme })
```

Officially-maintained alternatives: `@silvery/design-material`, `@silvery/design-primer`, `@silvery/design-polaris`. Community: `@silvery-community/*`. Writing your own is publishing a package that exports a `DesignSystem` object — see [Custom Tokens](./custom-tokens).

## See also

- [Styling](./styling) — the ten principles for shiny Silvery apps, rewritten around Sterling's flat tokens.
- [Theming](./theming) — `ThemeProvider`, nested themes, runtime swap.
- [Token Taxonomy](./token-taxonomy) — channel-role-state grammar, every Sterling token and when to reach for it.
- [Color Schemes](./color-schemes) — 22-color scheme shape, 84-scheme catalog, auto-detect.
- [Custom Tokens](./custom-tokens) — writing your own DesignSystem.
- [`@silvery/design` reference](/reference/theme) — the Theme type and DesignSystem contract.

<!-- TODO: verify after 0.19.0 ships — confirm `material.deriveFromColor` signature, `@silvery/design-polaris` package name, and the exact `sterling` export path. -->
