# Theme System v2 — making it truly great

**Status: SHIPPED 2026-04-18.** All 9 v2 child beads closed under epic `km-silvery.theme-system-v2`. The km-tui follow-up `km-tui.coloroverride-purge` (36 sites → silvery's `color="inherit"` cascade) also shipped. See per-section status notes below.

Follow-up to the Path G design system (terminal-color-strategy.md). The v1 landed 16 beads: OKLCH math, ColorScheme rename, invariants, monochrome attrs, fingerprint, generators, catalog (84 schemes), custom tokens, dim deprecation, fake-cursor, public docs, standalone detect library, storybook, backdrop-fade.

This doc captures what's left to make the system feel *complete* and *ergonomic*, synthesizing /big analysis + user decisions on 2026-04-18.

## Principles (unchanged)

- OKLCH-native color math
- Scheme = 22-slot terminal data; Theme = derived semantic tokens
- Tier-based rendering (truecolor / 256 / ansi16 / mono)
- Sophistication-as-positioning — "schema engineering" is a feature, not a bug

## What changes in v2

### P1 — Token names align with Primer / silvery.dev

Ink-style compound names (`muted`, `mutedbg`, `disabledfg`, `focusborder`, `inputborder`) become Primer-style:

- `muted` → `fg-muted`
- `mutedbg` → `bg-muted`
- `disabledfg` → `fg-disabled`
- `focusborder` → `border-focus`
- `inputborder` → `border-input`
- `surfacebg` → `bg-surface`
- `popoverbg` → `bg-popover`
- `inversebg` → `bg-inverse`
- `selectionbg` → `bg-selected`
- `cursorbg` → `bg-cursor` (or kept as `cursor-bg` — bikeshed)

Token strings keep the `$` sigil convention. `$primary`, `$fg`, `$bg`, `$error`, `$success` stay (those ARE the Primer names). The rename is for the compound hybrids only.

Blast radius: ~200 refs across silvery + km. Mechanical. Keep Ink-compat aliases on the Theme type for one release cycle to reduce churn.

### P2 — ThemeProvider accepts a whole token bag

Current API:

```tsx
<ThemeProvider theme={derivedTheme} customTokens={myExtras}>
```

Two props, two registries, asymmetric. Custom tokens live parallel to theme, never composable.

New API:

```tsx
<ThemeProvider tokens={{...partialOrFull}}>
```

- Accepts a sparse bag (merged over the default theme) OR a complete one (ignore defaults).
- Custom tokens (derivation or brand) live in the same bag — `$primary`, `$my-app-brand`, `$priority-p0` are the same thing from the API's POV.
- Internally, resolution order: `tokens` prop → scheme-derived defaults → hard-coded fallback.
- Migration: current `theme=` and `customTokens=` props deprecated; new `tokens=` is the supported path. Runtime-merge both for one release.

### P3 — Brand tokens as part of the standard set (Apple-style)

Every theme ships a brand token family:

```ts
interface BrandTokens {
  brand: string                      // primary identity anchor
  "brand-hover": string              // +0.04 L
  "brand-active": string             // +0.08 L
  // Auxiliary brand hues for categorization (NOT status):
  "brand-red": string
  "brand-orange": string
  "brand-yellow": string
  "brand-green": string
  "brand-teal": string
  "brand-blue": string
  "brand-purple": string
  "brand-pink": string
}
```

Default derivation (when app doesn't override):

- `$brand` — scheme.primary (declared) → probed cursor (if chromatic + distinct) → most-chromatic cool slot → most-chromatic any slot → hardcoded fallback (existing brand cascade).
- `$brand-hover/-active` — ±0.04L / ±0.08L in OKLCH, gamut-mapped.
- `$brand-<hue>` — scheme's accent ring (red, orange, yellow, green, teal, blue, purple, pink) via ensureContrast against `$bg`. These are auxiliary category accents, NOT semantic states. Apps use them for tag colors, calendar events, diff highlights, etc.

App override:

```tsx
<ThemeProvider tokens={{ brand: "#5B8DEF", "brand-hover": "#7BA4F2" }}>
```

Override just `$brand` → the auxiliary ring still auto-derives (hue-rotated around the app's brand). Override the whole ring → pin every color.

This is the Apple system-color model: the OS ships defaults, apps override identity anchors, the system auto-generates state variants. Terminal equivalent.

### P4 — Monochrome tier wired end-to-end

The `DEFAULT_MONO_ATTRS` + `monoAttrsFor` + `deriveMonochromeTheme` infrastructure exists but the output phase doesn't use it. When `colorLevel === "none"`, the renderer should emit SGR attrs per-cell based on the token it was painting.

Implementation:

- Output phase resolves the source token for each cell (track it through render phase).
- At mono tier, look up `monoAttrsFor(theme, token)` and emit those SGR codes instead of color.
- Backdrop-fade already handles its mono case (no-op); extend the same tier-dispatch pattern to all token resolution.

Result: a silvery app at `SILVERY_COLOR=mono` preserves hierarchy via bold/italic/underline/inverse even though no color is emitted.

### P5 — Typography presets as theme tokens

Current: `<H1>`, `<H2>`, `<Small>`, `<Muted>`, `<Strong>` are React components that internally pair color + attrs.

Better: typography is a token family alongside colors.

```tsx
<Text variant="h1">Title</Text>
<Text variant="body-muted">Context</Text>
<Text variant="fine-print">Footnote</Text>
```

Variant resolution:

```ts
interface Variants {
  h1: { color: "$primary", bold: true }
  h2: { color: "$accent", bold: true }
  h3: { bold: true }
  body: {}
  "body-muted": { color: "$fg-muted" }
  "fine-print": { color: "$faint" }  // ← new token, pre-dimmed at truecolor
  strong: { bold: true }
  em: { italic: true }
  link: { color: "$link", underline: true }
  key: { color: "$accent", bold: true }
  code: { backgroundColor: "$bg-muted" }
  kbd: { backgroundColor: "$bg-muted", color: "$accent" }
}
```

Apps extend via `tokens={{ variants: { hero: { color: "$brand", bold: true } } }}`.

The `<H1>` React components stay (semantic HTML parity) and become thin wrappers over `<Text variant="h1">`. Backwards-compatible.

### P6 — `color="inherit"` / `color="currentColor"` — retire colorOverride

Current km-tui `colorOverride` context is a hack for "inline text should adapt to the parent's cursor-row highlight."

New: Text components accept `color="inherit"` meaning "use the nearest ancestor's computed color." Resolved by walking the AgNode tree at render time (cheap — each cell knows its rendering parent).

This also enables `currentColor`-style composition for borders, underlines, etc. — an inline `<Text underline underlineColor="currentColor">` underlines in whatever color the surrounding text ended up resolving to.

Migration: km-tui's 3 `colorOverride` usages (InlineText, InlineWikiLink, link-interaction) drop the context param. Text with `color="inherit"` Just Works.

### P7 — State variants

`$primary-hover`, `$primary-active`, `$fg-hover`, `$fg-active`, `$bg-selected-hover`, etc. Promised in the design spec, not shipped.

Derivation: +0.04L (hover) and +0.08L (active) in OKLCH. Same gamut-mapping rules.

Silvery's hover infrastructure (Kitty mouse protocol + useModifierKeys) already tracks per-component hover state. The missing piece is the token names — once they exist, `<Text color="$primary" hoverColor="$primary-hover">` or `style={{ color: "$primary", "&:hover": { color: "$primary-hover" } }}` patterns follow.

### P8 — TypeScript-enforced tokens + test matchers

```ts
type ThemeToken =
  | "$fg" | "$bg" | "$primary" | "$accent"
  | "$fg-muted" | "$fg-disabled" | "$bg-muted" | "$bg-surface"
  | "$border" | "$border-focus" | "$border-input"
  | "$success" | "$warning" | "$error" | "$info"
  | "$cursor" | "$bg-cursor" | "$selection" | "$bg-selected"
  | "$link" | "$faint"
  | "$brand" | "$brand-hover" | "$brand-active"
  | `$brand-${"red"|"orange"|"yellow"|"green"|"teal"|"blue"|"purple"|"pink"}`
  | `$${string}`  // escape hatch for custom tokens

type TextColor = ThemeToken | "inherit" | "currentColor" | (string & {})
```

`(string & {})` keeps string-assignable (tailwind trick — preserves autocomplete while allowing hex literals).

Test matchers:

```ts
expect(cell).toHaveToken("$cursor-bg")  // semantic, survives color-math changes
expect(cell).toResolveToken("$primary", "#BD93F9")  // pinned value check
expect(app.card("buy milk")).toUseToken("fg", "$fg")
```

### P9 — `createThemedApp({ catalog })` one-line boot

Today:

```tsx
const { theme } = await detectScheme({ catalog: Object.values(builtinPalettes) })
const app = createApp(store)
pipe(app, withTerminal, withTheme(theme), withReact(<App />))
await app.run()
```

5 lines, easy to get wrong. Wanted:

```tsx
await createThemedApp({ catalog: allSchemes }, <App />).run()
```

Composes the standard stack: detectScheme → ThemeProvider → terminal → react → focus → dom-events. Apps that need custom composition keep using `createApp + pipe`; apps that just want "render this React tree with a detected theme" get the short form.

## Execution order (dependency-ordered)

1. **Primer rename** (P1) — foundational, mechanical. Everything downstream uses new names.
2. **Tokens prop on ThemeProvider** (P2) — the new API surface.
3. **Brand tokens in standard set** (P3) — depends on P2's spread API.
4. **Mono tier wiring** (P4) — standalone, self-contained in output phase.
5. **Typography variants as tokens** (P5) — depends on P2's spread API.
6. **color="inherit"** (P6) — standalone, depends on nothing else.
7. **State variants** (P7) — nice-to-have, depends on P1's naming.
8. **TypeScript tokens + test matchers** (P8) — depends on final token names.
9. **createThemedApp** (P9) — depends on P2's API settling.

Each gets its own bead under `km-silvery.theme-system-v2` epic.
