# Styling

_Colors, typography, and component defaults for the shiniest Silvery apps_

Silvery ships with **Sterling** — a design system that turns your terminal's color scheme into ~50 semantic tokens. You style with flat `$` tokens (`$fg-accent`, `$bg-surface-subtle`) and let the framework handle hierarchy, contrast, and tier-aware rendering.

If you want the full backstory, read the [Sterling guide](./sterling). This page is the practical rulebook — ten principles plus a quick reference.

## 1. Don't Specify Colors

Most Silvery components already use the correct semantic colors by default. **The best color code is no color code.**

| Component              | What's automatic                                                              |
| ---------------------- | ----------------------------------------------------------------------------- |
| `<Text>`               | `$fg` text color                                                              |
| `<TextInput>`          | `$border-input` → `$border-focus` on focus, cursor                            |
| `<TextArea>`           | `$border-input` → `$border-focus` on focus                                    |
| `<ModalDialog>`        | `$bg-surface-raised` bg, `$border-default` border, `$fg-accent` title         |
| `<CommandPalette>`     | `$bg-surface-raised` bg, `$border-default` border                             |
| `<Toast>`              | `$bg-surface-overlay` bg, `$border-default` border                            |
| `<SelectList>`         | inverse for selection, `$fg-muted` for disabled                               |
| `<Alert variant="…">`     | Tone → `$bg-<tone>-subtle` + `$fg-<tone>`                                     |
| `<Button variant="…">`    | Tone → `$bg-<tone>` + `$fg-on-<tone>`                                         |
| `<ErrorBoundary>`      | `$border-error`                                                               |
| `<Divider>`            | `$border-muted`                                                               |
| `<ProgressBar>`        | `$fg-muted` empty portion                                                     |
| `<Spinner>`            | `$fg`                                                                         |
| `<H1>`, `<H2>`, `<H3>` | `$fg-accent` / bold / bold — see presets below                                |
| `<Muted>`              | `$fg-muted`                                                                   |
| `<Small>`              | `$fg-muted` (pre-dimmed)                                                      |
| `<Code>`               | `$bg-surface-subtle` background                                               |
| `<Blockquote>`         | `$border-muted` + italic                                                      |

::: tip Shiny

```tsx
<ModalDialog title="Confirm">
  <Text>Are you sure?</Text>
</ModalDialog>

<TextInput borderStyle="round" />

<SelectList items={items} />

<Alert variant="success">Deployed</Alert>

<Divider />

<ProgressBar value={75} total={100} />
```

Zero color props. The modal gets the raised surface, the right border, accent title. The input handles focus transitions on its own. `<Alert>` picks tone-appropriate bg + fg.
:::

::: danger Tarnished

```tsx
<Box backgroundColor="$bg-surface-raised" borderColor="$border-default" borderStyle="round">
  <Text color="$fg-accent" bold>Confirm</Text>
  <Text color="$fg">Are you sure?</Text>
  <TextInput borderColor={focused ? "$border-focus" : "$border-input"} />
</Box>

<Alert variant="success" color="$fg-success">OK</Alert>  // Alert resolves tone internally
<Divider color="$border-muted" />                      // default already
```

Rebuilding what the component already does.
:::

→ [Components guide](/guides/components) · [Theming](./theming)

## 2. Build Hierarchy with Color + Typography

TUIs can't vary font size — bold, dim, and italic are the only typographic tools. Use intentional combinations of color + weight.

| Level           | Style                 | Visual effect                           |
| --------------- | --------------------- | --------------------------------------- |
| H1 — Page title | `$fg-accent` + bold   | Colored, bold — maximum emphasis        |
| H2 — Section    | bold                  | Bright, bold — distinct from H1         |
| H3 — Group      | bold                  | Same as H2 at slightly tighter tracking |
| Body            | `$fg`                 | Default                                 |
| Meta / caption  | `$fg-muted`           | Secondary                               |
| Fine print      | `$fg-muted` (Small)   | Captions, footnotes                     |
| Disabled        | `$fg-disabled`        | Clearly inactive                        |

::: tip Rule — `dim` is a rendering detail, not a design primitive

**Don't write `dim` in app or component code.** Ever. `dim` is an SGR modifier with [uneven support](https://terminfo.dev/extensions) across terminals — exactly what semantic tokens exist to hide.

Use semantic tokens:

- **`$fg-muted`** — meta, captions, hints, secondary info. The canonical "grey". Use by default.
- **`<Small>`** — fine print. Resolves to a pre-dimmed hex at truecolor; the renderer emits SGR 2 at ANSI 16 / mono.
- **`$fg-disabled`** — clearly inactive. Faded for contrast, not for "less important."
- **None of the above** — primary body text. `$fg` is inherited; don't set it.

Where `dim` IS allowed (inside the token system only):

1. `<Small>` preset — the canonical composition
2. Monochrome derivation — dim / bold / italic are the only expressive channels at mono tier
3. Renderer realization at ANSI 16 tier

Where `dim` is **forbidden**:

- `<Text dimColor>`
- `<Box dim>` inline props
- Manual `$fg-muted + dimColor` pairing
- Any view expressing rendering details rather than semantic meaning
:::

::: tip Typography presets

```tsx
import { H1, H2, H3, Muted, Small, Lead, Code, Blockquote, P, LI } from "silvery"

<H1>Settings</H1>                       // $fg-accent + bold
<H2>General</H2>                         // bold
<H3>Appearance</H3>                      // bold
<P>Use dark colors for the UI.</P>       // plain body
<Muted>Requires restart</Muted>          // $fg-muted
<Small>Last updated 2 hours ago</Small>  // pre-dimmed
<Lead>Welcome to the app</Lead>          // italic
<Code>npm install silvery</Code>         // $bg-surface-subtle
<Blockquote>Less is more.</Blockquote>   // │ + italic
<LI>First item</LI>                      // • bullet
```

Zero color props. The easiest way to get correct hierarchy.
:::

::: tip `<Text variant=…>` resolves from the theme

Variants are theme entries — `h1`, `h2`, `h3`, `body`, `body-muted`, `fine-print`, `strong`, `em`, `link`, `key`, `code`, `kbd` come built in. `<H1>` / `<H2>` / … are thin wrappers over `<Text variant="…">`.

```tsx
<Text variant="h1">Settings</Text>              // = H1
<Text variant="body-muted">Context</Text>       // $fg-muted
<Text variant="kbd">⌘K</Text>                    // $bg-surface-subtle + $fg-accent + bold
```

Apps extend the variant table via `<ThemeProvider variants={{ hero: { color: "$fg-accent", bold: true } }}>`. Caller props win over variant.
:::

## 3. Use Tokens for Meaning, Not Decoration

Every `$`-token carries semantic weight. When you borrow status colors for decoration, you train users to ignore them.

::: tip Shiny

```tsx
<Text color="$fg-success">✓ Tests passed</Text>
<Text color="$fg-error">✗ Build failed</Text>
<Text color="$fg-accent">❯</Text>                // interactive prompt
<Link href={url}>documentation</Link>             // auto $fg-accent + underline
<Text color="$fg-warning">⚠ Rate limit exceeded</Text>
<Text color="$fg-info">ℹ 3 items updated</Text>
```

Each color matches its meaning.
:::

::: danger Tarnished

```tsx
<Text color="$fg-success">Agent</Text>          // name ≠ success
<Box outlineColor="$fg-success">                // decorative border ≠ success
<Text color="$fg-error">Delete</Text>           // missing icon — error or button?
<Text color="$fg-accent">Loading...</Text>       // status ≠ interactive chrome
```

Status-as-decoration drowns real status signals.
:::

## 4. Always Pair Surfaces

Every fillable surface has a matching text token. Set both or set neither — never gamble on contrast.

::: info `<Box theme={theme}>` handles pairing automatically

`<Box theme={t}>` auto-inherits `$fg` for descendant text and auto-fills `$bg` as the background. Just set `theme` and the layout props.
:::

| Background role       | Text token             | Use for                          |
| --------------------- | ---------------------- | -------------------------------- |
| `$bg`                 | `$fg`                  | Default app background           |
| `$bg-surface-subtle`  | `$fg`                  | Hover rows, inline muted chips   |
| `$bg-surface-raised`  | `$fg`                  | Panels, dialogs, cards           |
| `$bg-surface-overlay` | `$fg`                  | Tooltips, dropdowns, toasts      |
| `$bg-accent`          | `$fg-on-accent`        | Primary fills — buttons, chips   |
| `$bg-error`           | `$fg-on-error`         | Error fills                      |
| `$bg-warning`         | `$fg-on-warning`       | Warning fills                    |
| `$bg-success`         | `$fg-on-success`       | Success fills                    |
| `$bg-info`            | `$fg-on-info`          | Info fills                       |

Surface subtle / raised / overlay share the same `$fg`. Status fills and accent fills each have their own `$fg-on-<role>`.

::: tip Shiny

```tsx
<Box backgroundColor="$bg-surface-raised">
  <Text>Dialog content</Text>
</Box>

<Box backgroundColor="$bg-accent">
  <Text color="$fg-on-accent">Deploy</Text>
</Box>

<Box backgroundColor="$bg-error">
  <Text color="$fg-on-error">Build failed: missing dependency</Text>
</Box>
```

Each background is paired with its text token. Contrast is guaranteed across all themes.
:::

::: danger Tarnished

```tsx
<Box backgroundColor="$bg-accent">
  <Text>Deploy</Text>                           // $fg on $bg-accent — will break
</Box>

<Box backgroundColor="$bg-surface-raised">
  <Text color="$fg-on-accent">Wrong token</Text> // fgOn is for role fills only
</Box>
```

A token designed for one surface placed on another means contrast is unpredictable.
:::

## 5. Add Redundant Signals for Status

Color-blind users can't distinguish red from green. At ANSI 16, `$fg-warning` and `$fg-accent` may be the same yellow. **Always pair status colors with icons or text labels.**

| Role      | Icon convention |
| --------- | --------------- |
| `success` | ✓ ✔ ◆           |
| `warning` | ⚠ △             |
| `error`   | ✗ ✘ ●           |
| `info`    | ℹ ○             |

::: tip Shiny

```tsx
<Text color="$fg-success">✓ Tests passed</Text>
<Text color="$fg-error">✗ 3 failures</Text>
<Text color="$fg-warning">⚠ Unsaved changes</Text>
<Text color="$fg-info">ℹ Documentation updated</Text>
```

Works in monochrome. Works for color-blind users. The icon carries meaning without color.
:::

::: danger Tarnished

```tsx
<Text color="$fg-error" bold>FAILED</Text>      // color-only
<Badge variant="success" />                         // empty badge — a green dot
```

Color alone isn't enough.
:::

## 6. Use `$fg-accent` for Emphasis, Not Noise

`$fg-accent` is the canonical link-like / interactive-highlight role. Use it for:

- Headings (via `<H1>`)
- Selected / active items
- Links (via `<Link>` — automatic)
- "New" / "Beta" badges when you want attention without status implication

Don't use it for:

- Body text (use `$fg`)
- Decoration (use a surface token)
- Success / error communication (use `$fg-success` / `$fg-error`)

::: tip Shiny

```tsx
<Text bold color="$fg-accent">NEW</Text>
<Text color="$fg-accent">●3</Text>
<Text bold color="$fg-accent">BETA</Text>
<Text bold color="$fg-accent">→</Text>
```
:::

## 7. Let Components Handle Borders

Three border tiers — structural, interactive, focused — and components handle transitions automatically. You just set `borderStyle`.

| Tier                    | Token            | Applied by                      |
| ----------------------- | ---------------- | ------------------------------- |
| Structural              | `$border-default`| Box (automatic default)         |
| Interactive (unfocused) | `$border-input`  | TextInput, TextArea             |
| Focused                 | `$border-focus`  | TextInput, TextArea             |
| Muted divider           | `$border-muted`  | Divider                         |

::: tip Shiny

```tsx
<TextInput borderStyle="round" />              // $border-input → $border-focus

<Box borderStyle="single">                     // $border-default
  <Text>Panel</Text>
</Box>
```
:::

::: danger Tarnished

```tsx
<Box borderColor={focused ? "blue" : "gray"} borderStyle="round">
  <TextInput />
</Box>

<Box borderColor="$fg-accent" borderStyle="round">
  <Text>Panel</Text>                           // accent border for structure
</Box>
```

Manual focus switching breaks on every theme.
:::

## 8. Keep Palette Colors for Data

`$color0`–`$color15` are for **categorization** — tags, calendar colors, chart series, syntax highlighting. They're the 16 ANSI slots from the user's terminal scheme, unthemed, carrying no semantic meaning beyond "this is category N."

::: tip Shiny

```tsx
// Tag labels — assign colors by category
<Text color="$color1">bug</Text>
<Text color="$color4">feature</Text>
<Text color="$color5">docs</Text>
<Text color="$color2">enhancement</Text>

// Git diff
<Text color="$color2">+ added line</Text>
<Text color="$color1">- removed line</Text>
<Text color="$color3">~ modified line</Text>

// Syntax highlighting
<Text color="$color4">const</Text> <Text color="$color6">name</Text> <Text>=</Text> <Text color="$color2">"silvery"</Text>
```

Data categories — each tag / diff line / syntax token gets a consistent palette slot.
:::

::: danger Tarnished

```tsx
<Text color="$color1">Error: file not found</Text>   // status — use $fg-error
<Text color="$fg-success">enhancement</Text>          // tag — use $color2
```

Palette for UI chrome strips it of its data-categorization role. Semantic tokens for tags trains users to see "bug" as an error state.
:::

### Assignment strategies

- **Static mapping** — "bug" always gets `$color1`. Best for known, stable categories.
- **Dynamic mapping** — `$color${i % 16}`. Best for user-created categories (tags, labels).
- **Avoid `$color0` and `$color7`** — `$color0` (black) may be invisible on dark themes; `$color7` (white) on light themes. Prefer `$color1`–`$color6` and `$color8`–`$color14`.

## 9. Color Inheritance and Mixing

### `color="inherit"`

Skip a component's default color, inherit from the parent:

```tsx
<Text color="$fg-error">
  Error:{" "}
  <Link color="inherit" href="...">details</Link>   // inherits $fg-error
</Text>
```

Essential for `<Link>` inside colored containers like status bars.

### State variants

Every interactive token has `-hover` and `-active` companions — derived in OKLCH (±0.04L / ±0.08L) so they stay in-palette.

```tsx
<Text color={hovered ? "$fg-accent-hover" : "$fg-accent"}>Click me</Text>
<Box backgroundColor={pressed ? "$bg-accent-active" : "$bg-accent"}>…</Box>
```

Available interactive-surface variants: `$bg-accent-hover/-active`, `$bg-error-hover/-active`, `$bg-warning-hover/-active`, `$bg-success-hover/-active`, `$bg-info-hover/-active`, `$bg-surface-subtle-hover`, `$bg-surface-raised-hover`.

Only `accent` emits `fg-*-hover/-active`. Status text isn't interactive — it doesn't hover.

### `mix()`

Blend two colors:

```tsx
<Box backgroundColor="mix($bg, $bg-error, 15%)">
  <Text color="$fg-error">✗ Build failed — 3 errors</Text>
</Box>

<Text color="mix($fg-accent, $fg-muted, 50%)">Blended</Text>
```

Supports tokens, named colors, and hex. Amount is 0–100% or 0.0–1.0.

::: tip Shiny

```tsx
<Box backgroundColor="$bg-surface-raised">
  <Text>Status: </Text>
  <Link color="inherit" href="/docs">docs</Link>
</Box>
```

`inherit` lets the link blend into its surface instead of forcing `$fg-accent`.
:::

## 10. Use `<Backdrop>` to Dim a Region

`<Backdrop fade={n}>` is a render-time fade: every cell its rect covers has `fg` and `bg` blended toward the theme neutral (dark for dark themes, light for light).

```tsx
// Dim the board while a side panel is open
<Backdrop fade={0.7}>
  <Board />
</Backdrop>
<SidePanel />   // crisp
```

`fade` is 0–1: 0 is passthrough, 1 fully converges to the neutral. `0.4`–`0.7` is typical for "active but background" regions.

### Tiers

| Tier            | Behavior                                     |
| --------------- | -------------------------------------------- |
| truecolor / 256 | OKLab blend toward neutral — perceptually uniform |
| ANSI 16         | SGR 2 stamped on cells — single-channel      |
| mono            | no-op — borders carry separation             |

::: tip Shiny — modal variant

For modals, prefer `fade` on `ModalDialog` / `PickerDialog`:

```tsx
<ModalDialog title="Confirm" fade={0.4}>
  <Text>Are you sure?</Text>
</ModalDialog>
```

Fades everything outside the dialog automatically.
:::

::: danger Tarnished

```tsx
const [fade, setFade] = useState(0)
useEffect(() => { /* animate fade up to 0.7 in a 50ms loop */ }, [])
```

`Backdrop` is a render-time transform, not an animation primitive. Instant transitions (modal open/close) are fine; animated loops are not.
:::

## Quick reference

### Decision tree

**"What color should this element use?"**

1. **Standard component for this?** → use it, don't specify colors
2. **Body text?** → `$fg` (default — don't specify)
3. **Secondary / supporting?** → `$fg-muted`
4. **Disabled?** → `$fg-disabled`
5. **Heading?** → `<H1>` / `<H2>` / `<H3>` presets
6. **Hyperlink?** → `<Link>` (auto-styled) or `$fg-accent` + underline
7. **Status signal?** → `$fg-<tone>` + icon
8. **Pop against body?** → `$fg-accent`
9. **Structural border?** → don't specify (`$border-default` is automatic)
10. **Input border?** → set `borderStyle` (auto `$border-input` / `$border-focus`)
11. **Elevated surface?** → `$bg-surface-raised` + `$fg`
12. **Role fill (button / chip / alert)?** → `$bg-<role>` + `$fg-on-<role>`
13. **Data category?** → `$color0`–`$color15`
14. **Should inherit parent's color?** → `color="inherit"`
15. **Derived / tinted?** → `mix(color1, color2, amount)`
16. **None of the above?** → `$fg` or `$fg-muted`

### Smell summary

| Smell                                         | Meaning                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| `color="$fg"`                                 | Writing the default — remove it                      |
| `color="red"` or `"#hex"`                     | Hardcoded — use a `$`-token                          |
| `$fg-success` / `$fg-error` for headings      | Status for hierarchy — use `$fg-accent` or presets   |
| `borderColor={focused ? ... : ...}`           | Manual focus — let the component handle it           |
| `backgroundColor` without matching text       | Unpaired surface — add `$fg-on-<role>` or `$fg`      |
| `$fg-success` / `$fg-error` without icon     | Color-only status — add redundant signal             |
| `dim` / `dimColor` in view code               | Rendering detail — use `$fg-muted` / `<Small>`       |
| Palette colors for UI chrome                  | Palette is for data; use `$border-*` / `$fg-accent`  |
| Specifying colors a component already handles | Fighting the framework — remove                      |
| Hardcoded hex for a tinted surface            | Use `mix($bg, $token, N%)`                           |
| `<Link>` in colored container forcing `$fg-accent` | Use `color="inherit"`                           |

### Contrast guarantees

`deriveFromScheme()` enforces minimum contrast ratios on every text/bg pair — auto-lifting OKLCH L (preserving hue + chroma) until the target is met. For user-authored schemes the lift is silent; for the 84 bundled schemes, failure blocks CI.

| Pair                                                                 | Target    | Rationale                            |
| -------------------------------------------------------------------- | --------- | ------------------------------------ |
| Body text (`$fg`) on `$bg` / `$bg-surface-*`                         | 4.5:1 (AA)| Primary text must be readable         |
| Muted text (`$fg-muted`) on `$bg`                                    | 4.5:1     | Secondary text must be readable       |
| Disabled text (`$fg-disabled`) on `$bg`                              | 3.0:1     | Intentionally dim but visible         |
| Role text (`$fg-accent`, `$fg-error`, …) on `$bg`                    | 4.5:1     | Colored text on the root bg           |
| `$fg-on-<role>` on `$bg-<role>`                                      | 4.5:1     | Role fills                            |
| `$border-default` on `$bg`                                           | 1.5:1     | Faint structural dividers             |
| `$border-input` on `$bg`                                             | 3.0:1     | WCAG 1.4.11 non-text minimum          |

Derivation uses adaptive OKLCH L-shifts (±0.04 / ±0.08) for hover/active, and falls back to chroma reduction near the luminance endpoints.

### Terminal notes

- **No transparency** — every color is solid. Use `$bg-surface-subtle` for hover tints, not opacity.
- **ANSI 16 fallback** — status colors may collapse onto the same ANSI slot. Always pair with icons.
- **Progressive enhancement** — the same vocabulary works at truecolor / 256 / ANSI 16 / mono.
- **Vibrancy** — Apple-style super-saturated colors don't translate to terminals. Let the theme bring vibrancy; keep component code solid.

## See also

- **[Sterling](./sterling)** — overview of the default design system.
- **[Theming](./theming)** — `ThemeProvider`, runtime swap, nested themes.
- **[Token Taxonomy](./token-taxonomy)** — channel-role-state grammar, every token Sterling ships.
- **[Color Schemes](./color-schemes)** — the 22-slot scheme model and the 84 bundled themes.
- **[Custom Tokens](./custom-tokens)** — writing your own DesignSystem.
