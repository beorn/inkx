---
title: Custom Tokens
description: Extend Sterling with app-specific tokens, or publish your own DesignSystem as an @silvery/design-* package.
---

# Custom Tokens

Sterling's tokens cover common UI roles. For app-specific needs — priority levels, category colors, brand overlays — or for ecosystems with different vocabularies (`critical`/`caution`, `onPrimary`), Silvery exposes two extension points:

1. **Token packs** — add tokens to Sterling without replacing it.
2. **Custom DesignSystems** — ship a whole alternative, published as `@silvery/design-<name>` or `@silvery-community/<name>`.

This page covers both.

## Token packs — extend Sterling

Use when you need a handful of extra tokens alongside the default Sterling set. Token packs live at the theme layer and resolve during `deriveFromScheme()`.

### Derivation tokens — follow the scheme

```ts
import { design, schemes, blend } from "silvery"

const theme = design.deriveFromScheme(schemes.nord, {
  extend: {
    "fg-priority-p0": (scheme) => scheme.brightRed,
    "fg-priority-p1": (_scheme, theme) => blend(theme["fg-warning"], theme.bg, 0.2),
    "fg-priority-p2": (_scheme, theme) => theme["fg-muted"],
  },
})
```

Use for: priority levels, status subtypes, category-specific accents — anything that should adapt when the scheme changes.

### Brand tokens — fixed hex + fallbacks

Use when the token is part of your app's identity and must never drift. Every brand token carries an `ansi16` fallback so it renders on legacy terminals.

```ts
const theme = design.deriveFromScheme(schemes.nord, {
  extend: {
    "bg-km-brand":   { hex: "#5B8DEF", ansi16: "brightBlue", attrs: ["bold"] },
    "fg-km-logo":    { hex: "#9FB7C9", ansi16: "cyan" },
  },
})
```

Use for: logos, signature chrome, anything branded. Don't use for body text, state colors, or selection/cursor — derive those instead.

### Naming conventions

- **Every custom key starts with a channel prefix** — `fg-*`, `bg-*`, `border-*`, `cursor-*`. Keeps the grammar consistent.
- **Namespace app-scope tokens** — `fg-km-brand`, `bg-acme-logo`. Avoids collision when multiple packages stack on one Theme.
- **Don't reuse Sterling's keys.** Sterling throws `DesignSystemError` if you shadow a built-in.

### Using extended tokens

Once registered, they appear on the Theme like any other:

```tsx
<Text color="$fg-priority-p0">High priority</Text>
<Box backgroundColor="$bg-km-brand">
  <Text color="$fg-on-km-brand">Branded chrome</Text>
</Box>
```

For the nested form, token-pack entries live under a `custom` namespace — flat remains the everyday form.

## Writing your own DesignSystem

Use when your vocabulary or derivation diverges enough from Sterling that a token pack isn't enough — e.g. Material's `onPrimary` naming, or Polaris's `critical` / `caution`.

### The contract

A DesignSystem is any object matching `DesignSystem<Input>`:

```ts
import type { DesignSystem, Theme, ThemeShape, ColorScheme, FlattenRule } from "@silvery/design"

export interface DesignSystem<Input = unknown> {
  readonly name: string
  readonly shape: ThemeShape

  /**
   * Framework-level flatten rule:
   *   - true         → Sterling-style `bg-accent` / `fg-on-error`
   *   - FlattenRule  → custom (e.g. Material's `onPrimary`)
   *   - false / omit → nested-only
   */
  readonly flatten?: boolean | FlattenRule

  defaults(mode?: "light" | "dark"): Theme
  theme(partial: Partial<Theme>): Theme

  deriveFromScheme?(scheme: ColorScheme): Theme
  deriveFromColor?(color: string): Theme
  deriveFromPair?(light: ColorScheme, dark: ColorScheme): { light: Theme; dark: Theme }
  deriveFromSchemeWithBrand?(scheme: ColorScheme, brand: string): Theme
}
```

### `defineDesignSystem()`

Wrap your object with `defineDesignSystem()` to get framework integration — specifically, automatic flat-projection via `bakeFlat`:

```ts
import { defineDesignSystem } from "@silvery/design"

export const my = defineDesignSystem({
  name: "my",
  shape: MY_SHAPE,
  flatten: true,              // ← Sterling-style default rule
  defaults(mode) { return buildDefaults(mode) },
  theme(partial) { return fillPartial(partial) },
  deriveFromScheme(scheme) { return derive(scheme) },
})
```

`defineDesignSystem` runs your nested-only `derive*` outputs through `bakeFlat` — every derivation method returns a Theme with both nested roles and flat hyphen keys on the **same object**, referencing the **same strings** (not copies). The whole Theme is frozen.

You never call `bakeFlat` yourself. It's a framework feature, not a design-system feature.

### Custom flatten rule

Alternative systems whose convention differs from Sterling pass a `FlattenRule`:

```ts
// Material-style: `onPrimary`, camelCase
import type { FlattenRule } from "@silvery/design"

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1)

const materialRule: FlattenRule = (path) => {
  const last = path[path.length - 1]!
  if (last === "fgOn") return `on${cap(path[0]!)}`
  if (last === "fg" || last === "bg")
    return `${last === "fg" ? "text" : "surface"}${cap(path[0]!)}`
  return null
}

export const material = defineDesignSystem({
  name: "material",
  flatten: materialRule,
  // ...
})
```

Returning `null` skips a leaf — useful for metadata fields.

Systems that don't want flat-projection at all omit `flatten` (or set it to `false`) — their Themes stay nested-only.

### `bakeFlat` — the primitive

For advanced cases (custom derivation pipelines, tooling), `bakeFlat` is directly available from `@silvery/ansi`:

```ts
import { bakeFlat } from "@silvery/ansi"

const frozen = bakeFlat(myNestedTheme)              // Sterling default rule
const frozen = bakeFlat(myNestedTheme, customRule)  // custom
```

Input: any nested-POJO theme with hex-string leaves. Output: same object with flat keys written + frozen.

### Publishing your DesignSystem

Packaging is the same as any npm library:

```json
{
  "name": "@my-scope/design-sunset",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs"
    }
  },
  "peerDependencies": {
    "@silvery/design": "*"
  }
}
```

Usage:

```ts
import { run } from "silvery"
import { sunset } from "@my-scope/design-sunset"

await run(<App />, { theme: sunset.deriveFromColor("#FF6A00") })
```

Official packages live under `@silvery/design-*` (`@silvery/design-material`, `@silvery/design-primer`, `@silvery/design-polaris`). Community packages use `@silvery-community/*`. Pick a scope and publish.

## Cross-system boundary — adapters, not fallbacks

`@silvery/ui` is wired to Sterling's token shape. Placing it inside a `ThemeProvider` whose theme came from a different DesignSystem **fails fast with a clear error** — the token shapes don't match.

If you need to mix systems in one app, write an explicit adapter at the boundary:

```ts
import type { Theme as SterlingTheme } from "@silvery/design"
import type { MaterialTheme } from "@silvery/design-material"

export function materialToSterling(material: MaterialTheme): SterlingTheme {
  return {
    // Hand-map tokens. Visible, loud, no silent drift.
    "bg-accent":   material.colorScheme.primary,
    "fg-on-accent":material.colorScheme.onPrimary,
    "bg-error":    material.colorScheme.error,
    "fg-on-error": material.colorScheme.onError,
    // ...
  }
}
```

Then:

```tsx
<ThemeProvider theme={materialToSterling(materialTheme)}>
  <App />
</ThemeProvider>
```

No hidden TokenResolver, no fallback chain. Design systems are swappable per scope; adapters live at the boundary; errors are loud.

## Anti-patterns

- **Don't re-declare Sterling's tokens with custom logic.** Compose a new Theme (via `design.theme({ ... })`) or write a DesignSystem instead.
- **Don't ship a brand token without `ansi16` fallback.** SSH / legacy terminals will drop your color entirely.
- **Don't mix `derive` and `hex` on the same custom token.** Pick one — follow the scheme, or don't.
- **Don't ship a shared library with un-namespaced custom tokens.** `fg-brand` from package A and package B collide.

## See also

- [Sterling](./sterling) — what the default DesignSystem looks like.
- [Token Taxonomy](./token-taxonomy) — the channel-role-state grammar to match.
- [Theming](./theming) — `ThemeProvider` + runtime swap.
- [Color Schemes](./color-schemes) — what `scheme` carries at derivation time.
- [`@silvery/design` reference](/reference/theme) — DesignSystem contract, Theme type.

<!-- TODO: verify after 0.19.0 ships — confirm `extend:` option on deriveFromScheme (vs a separate `defineTokens` API), exact `DesignSystemError` name, `FlattenRule` signature, adapter pattern code. -->
