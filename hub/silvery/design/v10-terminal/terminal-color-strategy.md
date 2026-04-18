# Terminal Color Strategy

Silvery's color / theme / scheme system. This spec covers tokens, themes, auto-detection, accessibility invariants, and per-target rendering across terminal / canvas / web.

Companion: [docs/ref/ansi-color-detection.md](../../../../docs/ref/ansi-color-detection.md) for km's tap tool (on/off NO_COLOR/FORCE_COLOR).

## Positioning

Silvery's aesthetic differentiator over Ink / Bubbletea / Lipgloss is **depth of theming**. We ship a design system that adapts to the user's terminal, validates its own accessibility, and holds up across terminal / canvas / web render targets. "Just works everywhere, looks right in every theme" is the pitch — the sophistication below is what makes it true.

## Architecture — five layers

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1 — Tokens (target-neutral)                           │
│   20 semantic names + 16 ansi, OKLCH values                 │
└─────────────────────────────────────────────────────────────┘
                        ↑ theme assigns values
┌─────────────────────────────────────────────────────────────┐
│ Layer 2 — Theme catalog (30+ bundled, + user-authored)      │
│   Pick one OR author a 20-token object                      │
└─────────────────────────────────────────────────────────────┘
                        ↑ auto-detect CAN produce a theme
┌─────────────────────────────────────────────────────────────┐
│ Layer 3 — Auto-detect (opt-in, the killer feature)          │
│   probe → fingerprint → derive → fallback, with confidence  │
└─────────────────────────────────────────────────────────────┘
                        ↓ feeds into
┌─────────────────────────────────────────────────────────────┐
│ Layer 4 — Accessibility invariants (every theme validated)  │
│   AA contrast, gamut mapping, per-tier re-check             │
└─────────────────────────────────────────────────────────────┘
                        ↓ tokens flow to
┌─────────────────────────────────────────────────────────────┐
│ Layer 5 — Renderers (per target)                            │
│   terminal   → SGR, tier-quantized                          │
│   canvas     → ctx.fillStyle + font                         │
│   web        → CSS oklch() custom properties                │
└─────────────────────────────────────────────────────────────┘
```

Each layer is a selling point. Layers 1–2 are "pick a theme and go." Layer 3 is "auto-adapts to your terminal." Layer 4 is "readable by construction." Layer 5 is "works beyond the terminal."

## Canonical rules

Two opinionated defaults that run through the whole system:

- **OKLCH everywhere for color math.** Hex/sRGB is serialization only. OKLCH gives perceptually uniform `L`, meaningful `C`, and clean hue rotation — blend and contrast operations produce deterministic, designer-intended results across RGB/HSL.
- **Components never emit raw SGR or palette indices.** They request semantic tokens (`fg-muted`) and semantic text roles (typography presets like `<H1>`, `<Small>`, `<Em>`, `<Link>`). The token system decides concrete rendering at each tier; the presets encapsulate allowed attr bundles.

---

## Layer 1 — Tokens

Target-neutral. Same token set drives terminal / canvas / web. Values are OKLCH; renderers serialize.

### Naming — silvery.dev-aligned

Layer prefix (`text-` / `bg-` / `border-`) + semantic role. Kebab-case. Borrowed from Polaris exactly: `critical` (not danger/error), `caution` (not warning), `secondary` (not muted), `subdued` (fine print), `brand` (primary accent).

### Interactive state suffixes

**Silvery is more web-like than conventional TUIs** — it supports mouse hover (via Kitty mouse protocol) and click-active states. Interactive tokens carry `-hover` and `-active` variants matching Polaris exactly. Non-interactive (structural) tokens have no state variants.

### Text — static (10)

| Token | Role |
|---|---|
| `fg-default` | body text |
| `fg-muted` | meta, captions, de-emphasized |
| `fg-subtle` | tertiary / fine print (used by `<Small>`) |
| `fg-disabled` | clearly inactive |
| `fg-inverse` | text on dark strips / status bars |
| `fg-on-fill` | text on ANY filled surface |
| `fg-danger` | error text (static; state-semantic but doesn't hover) |
| `fg-warning` | warning text |
| `fg-success` | success text |
| `fg-info` | info text |

### Text — interactive (2 × 3 states = 6)

| Token family | Hover / Active |
|---|---|
| `fg-link` / `-hover` / `-active` | hyperlinks |
| `fg-accent` / `-hover` / `-active` | brand-colored text used interactively |

### Backgrounds — static (5)

| Token | Role |
|---|---|
| `bg-default` | app background |
| `bg-surface-secondary` | alt rows, nested (one step above surface) |
| `bg-overlay` | modals, popovers, tooltips (non-interactive) |
| `bg-inverse` | dark strips, status bars |
| `bg-selected` | selection highlight |

### Backgrounds — interactive (6 × 3 states = 18)

| Token family | Hover / Active |
|---|---|
| `bg-surface` / `-hover` / `-active` | cards, hoverable list rows |
| `bg-fill-accent` / `-hover` / `-active` | primary button, active tab |
| `bg-fill-danger` / `-hover` / `-active` | destructive button, error banner |
| `bg-fill-warning` / `-hover` / `-active` | warning button/banner |
| `bg-fill-success` / `-hover` / `-active` | confirm button/banner |
| `bg-fill-info` / `-hover` / `-active` | info banner |

### Borders (4)

| Token | Role |
|---|---|
| `border-default` | card outlines, dividers |
| `border-secondary` | quiet separators |
| `border-focus` | focus ring |
| `border-danger` | error input outline |

### Cursor (2)

| Token | Role |
|---|---|
| `cursor-fill` | cursor fill color — the cursor block itself (matches terminal cursorColor) |
| `cursor-text` | text under cursor when cursor is a block (matches terminal cursorText; universal formula = bg-default) |

### Categorical (16)

| Token | Role |
|---|---|
| `ansi[0..15]` | raw ANSI access for charts, categorical series, multi-hue data |

### Token counts

| Group | Count |
|---|---|
| Text static | 10 |
| Text interactive (2 × 3) | 6 |
| Backgrounds static | 5 |
| Backgrounds interactive (6 × 3) | 18 |
| Borders | 4 |
| Cursor | 2 |
| Categorical ANSI | 16 |
| **Total** | **61** |

Polaris-scale, supporting silvery's full web-like interaction model.

### State derivation — hover / active

Hover and active variants derive from the base token deterministically in OKLCH:

- **Hover**: shift `L` by **±0.04** (dark themes: brighter; light themes: darker). Preserves `C` and `H`.
- **Active**: shift `L` by **±0.08** (double the hover shift — visibly "pressed"). Preserves `C` and `H`.

Themes override per-state explicitly if the default math doesn't fit the scheme's intent. Silvery-originals override slightly for brand polish; imported themes (Dracula, Tokyo Night, etc.) use the defaults unless the designer tunes them.

### Token value shape

```ts
interface TokenValue {
  oklch: { L: number; C: number; H: number }
  // attrs carried only at monochrome tier — see Layer 5
}
```

OKLCH is canonical; hex is computed on demand via `toHex()`. Gamut-mapped to sRGB deterministically (reduce C, preserve L+H until in-gamut).

---

## Layer 2 — Theme catalog

A theme is a 20-token object (+ optional ansi[16]). Silvery bundles 30+. Apps pick one or author their own.

### Bundled set

| Tier | Themes |
|---|---|
| **Silvery originals** | `silvery-dark` (default), `silvery-light` |
| **Dark** | `dracula`, `tokyo-night`, `tokyo-night-storm`, `solarized-dark`, `gruvbox-dark`, `nord`, `catppuccin-mocha`, `catppuccin-frappe`, `catppuccin-macchiato`, `monokai`, `one-dark`, `github-dark`, `rose-pine`, `rose-pine-moon`, `everforest-dark`, `kanagawa`, `ayu-mirage`, `night-owl`, `palenight` |
| **Light** | `solarized-light`, `gruvbox-light`, `catppuccin-latte`, `one-light`, `github-light`, `rose-pine-dawn`, `everforest-light`, `ayu-light`, `tokyo-night-light` |

~30 themes × 20 tokens = ~600 OKLCH values. Bundle overhead: <10KB. Cheap — ship them.

Each theme is **silvery-flavored**, not a raw port of the terminal scheme. The designer maps the upstream palette to silvery's 20-token vocabulary. `dracula` means "a silvery theme inspired by Dracula," not a byte-for-byte copy.

### Authored themes

Users provide a partial object; silvery derives missing tokens from the Core:

```ts
import { setTheme, themeFrom, oklch } from "silvery/theme"

setTheme(themeFrom({
  "bg-default": oklch(0.24, 0.02, 230),
  "fg-default": oklch(0.90, 0.01, 80),
  "bg-fill-accent": oklch(0.60, 0.20, 260),
  // extended + on-X tokens derived automatically
}))
```

Missing Extended tokens derive via formulas (see Layer 4 Invariants). Missing `on-X` pairs resolve via `contrastFg()`.

### Brand colors

Apps add brand tokens via `defineTokens()`:

```ts
defineTokens({
  "km-brand": { oklch: oklch(0.65, 0.156, 263), ansi16Fallback: "brightBlue" },
  "km-shine": { oklch: oklch(0.85, 0.17, 100), ansi16Fallback: "brightYellow" },
})
```

Brand tokens sit alongside theme tokens, scope per-app, never override built-ins. Used for logos, signature chrome, identity touches — NOT for semantic roles (use `primary`/`accent` for those).

See bead `km-silvery.theme-custom`.

---

## Layer 3 — Auto-detect (opt-in, the killer feature)

Probes the user's terminal and produces a theme that feels native. Returns confidence metadata per slot + overall, so apps can display "Using detected Dracula theme (exact)" or fall back gracefully.

### Extraction point: `ColorScheme` (cross-framework reusable)

Layer 3 decomposes into two halves:

1. **`detectScheme()` — produces a 22-slot `ColorScheme`.** Terminal-native, framework-agnostic. Extractable to `@silvery/theme-detect` standalone library. Usable by Ink apps, Bubbletea apps, any TUI/CLI that wants to consume the user's terminal palette.
2. **`schemeToTheme()` — maps `ColorScheme` → silvery's 20-token `Theme`.** Silvery-specific. Stays in silvery.

Apps that want full silvery integration call `autoDetect()` (composes both halves). Apps that want just the raw palette call `detectScheme()`.

```ts
// Silvery-specific: full theme with confidence metadata
import { autoDetect } from "silvery/theme"
const { theme, scheme, source, confidence, adjustments } = await autoDetect({ timeout: 200 })

// Framework-agnostic: just the terminal's palette
import { detectScheme } from "@silvery/theme-detect"
const { scheme, source, confidence } = await detectScheme({ timeout: 200 })
// scheme: { black, red, ..., foreground, background, cursorColor, ... }
```

### API shape — overall confidence + per-slot provenance

```ts
interface DetectionResult {
  theme: Theme                    // from autoDetect only
  scheme: ColorScheme              // always
  source: "probed" | "fingerprint" | "formula" | "declared"  // overall
  confidence: "exact" | "fuzzy" | "derived" | "fallback"     // overall
  adjustments: ThemeAdjustment[]   // any invariant repairs done
  slotSources?: Record<SlotName, SlotSource>  // optional: per-slot provenance
}
interface SlotSource {
  source: "probed-osc" | "fingerprint" | "formula" | "default"
  value: string   // OKLCH
  deltaE?: number // distance from probed/expected (fuzzy matches)
}
```

Simple overall summary for most apps; per-slot provenance for debugging and advanced UIs.

### Probe order (100% / 86% / 71% / 43% support)

1. `OSC 10` → foreground (100% support)
2. `OSC 11` → background (100%)
3. `OSC 12` → cursor (86%)
4. `OSC 4;N` → 16 ANSI (71%)
5. `OSC 17` / `OSC 19` → selection bg/fg (43%, best-effort with DA1 sentinel)

Skip `cursorText` (always = bg, 100% universal formula).

### Four-tier fill strategy

Sources mixed and matched per slot; confidence reported per token.

| Tier | Source | When |
|---|---|---|
| A | Full OSC probe | All probes succeeded |
| B | Fingerprint match | Probed 18 slots match a cataloged theme (ΔE sum < 30 AND per-slot ΔE < 8) |
| C | Formula derivation | Probed but no fingerprint — derive cursor/selection from fg/bg via OKLCH blends |
| D | Declared fallback | Probing failed (SSH/tmux/CI/piped) — use declared or `silvery-dark`/`silvery-light` |

### Fingerprint matching — calibrated, not fragile

Per /pro's guidance (avoid false-positive plausibly-wrong UI):

- **Exact match**: hash(fg + bg + ansi[0..15]) O(1) against catalog hashes
- **Fuzzy match requires BOTH**: ΔE sum < 30 AND per-slot max ΔE < 8 (prevents one outlier from killing a match; prevents overall "close enough" false positives)
- **Confidence reported**: "exact" / "fuzzy" / "none" — apps can surface

### Formula derivations (Tier C)

Scheme-aware — inherit the user's probed fg/bg tint:

| Token | Formula |
|---|---|
| `cursor-fill` | scheme.cursor if chromatic + contrast-safe + hue not near state (red/green/yellow); else `fg-default` |
| `cursor-text` | `bg-default` (100% universal) |
| `selection-bg` | `blend(bg, fg, 0.20)` in OKLCH |
| `selection-fg` | `fg-default` (76% exact across real schemes) |
| `fg-muted` | `blend(fg, bg, 0.4)` + AA contrast enforced |
| `fg-subtle` | `blend(muted, bg, 0.4)` — one step below muted |

### Brand cascade (for `primary`)

```
primary =
  1. scheme.primary (explicit declaration)
  2. probed cursor — if chromatic (C > 0.05) AND ΔH(cursor, fg) > 20° AND contrast-safe
  3. most chromatic "cool" ANSI slot (blue/magenta/cyan family) — avoids state-color collision
  4. most chromatic ANSI slot overall
  5. hardcoded default (yellow dark / blue light)
```

Cursor as primary is a GUARDED HINT, not the default — only promotes when the cursor is both chromatic and semantically safe (not red/green/yellow range).

### Scheme generators — for power users

Apps can synthesize themes from partial input:

```ts
generateTheme({ fg, bg })                              // minimum
generateTheme({ fg, bg, primary })                     // seeded
generateTheme({ fg, bg, accents: { red, green, ... } }) // explicit overrides
generateTheme({ baseHue, isDark })                     // AI-friendly
```

Uses: brand-seeded themes, AI-generated themes, Tier C enhancement. See bead `km-silvery.theme-generators`.

---

## Layer 4 — Accessibility invariants

Every theme (bundled OR auto-detected OR authored) runs through a validator at load. Failures either throw (strict mode) or auto-adjust (lenient mode, default).

### Minimum targets

Terminal text is monospace body size — WCAG's "large text" 3:1 exception does NOT apply. All text tokens target 4.5:1 by default; softer thresholds only for truly decorative content.

| Pair | Target | Why |
|---|---|---|
| `fg-default` on `bg-default` | AA (4.5:1) | body text |
| `fg-muted` on `bg-default` | AA (4.5:1) | secondary text is still body-size |
| `fg-subtle` on `bg-default` | AA (4.5:1) | fine print but still readable |
| `fg-disabled` on `bg-default` | DIM (3:1) | intentionally quiet |
| `fg-accent` on `bg-default` | AA (4.5:1) | brand emphasis text |
| each state `fg-X` on `bg-default` | AA (4.5:1) | state text readable |
| `fg-on-fill` on each `bg-fill-X` | AA (4.5:1) | button labels |
| `border-focus` on `bg-default` AND `bg-surface` AND `bg-overlay` | 3:1 each | focus ring visible on any surface |
| `bg-surface` vs `bg-default` | ΔL ≥ 0.03 | elevation distinguishable |
| `bg-overlay` vs `bg-default` | ΔL ≥ 0.08 | modal clearly elevated |
| `bg-selected` vs `bg-default` | ΔL ≥ 0.15 + preserves `fg-default` at 4.5:1 | selection distinct + readable |
| `cursor-fill` vs `bg-default` | ΔE₂₀₀₀ ≥ 20 (OKLCH) | cursor visible |
| `cursor-text` on `cursor-fill` | 4.5:1 | character under block cursor readable |

### Per-tier re-check

A theme that passes AA in OKLCH can fail after 256-color quantization or ANSI16 slot-fallback. Invariants are re-checked at emit time for the output tier; auto-adjust (lenient) or fail (strict) per config.

### Repair policy — what Layer 4 may touch

Invariant repair is bounded: **never mutate probed fg/bg/ansi slot values.** Those are the user's terminal theme and must pass through unchanged to preserve native feel.

| Repairable | Off-limits |
|---|---|
| Derived semantic tokens (`fg-muted`, `fg-subtle`, `border-focus`, state surfaces) | Probed fg, bg |
| Tier-specific render outputs (quantized hexes, ANSI16 slot choices) | Probed 16 ANSI |
| Formula-derived cursor/selection if they failed contrast | Declared theme values (user opt-in to silvery-dark etc.) |

When a repair fires, it's recorded in `ThemeAdjustment[]` for auditing.

### Gamut mapping (OKLCH → sRGB)

OKLCH can represent colors outside the sRGB gamut. Deterministic rule:

1. Convert OKLCH → sRGB
2. If any channel is outside [0, 1], reduce `C` by 5%; preserve `L` and `H`
3. Repeat until in-gamut

Predictable, hue-preserving, perceptually smooth.

### State redundancy (not color-only)

Components must use icon/glyph/prefix alongside color for state. `$error` as `✗ Failed` with red fg; `$success` as `✓ Saved` with green fg. Never color-only — fails colorblind users and NO_COLOR.

See bead `km-silvery.theme-invariants`.

---

## Layer 5 — Renderers per target

Tokens are target-neutral. Each renderer translates for its medium.

### Terminal renderer

| Tier | Emission |
|---|---|
| truecolor | SGR 38;2;R;G;B from token.toHex() |
| 256 | quantize token.oklch → nearest cube/ramp/ANSI16 (deterministic math) |
| ANSI 16 | nearest-hue slot (from probed or default ANSI16 palette) |
| monochrome | no color SGR; emit per-token attrs (bold/dim/italic/underline/inverse) |
| plain | no SGR at all (color OR attrs) — pure text output |

#### NO_COLOR vs monochrome vs plain

Three distinct "no color" modes:

| Mode | What's emitted | When triggered |
|---|---|---|
| **monochrome** | Attrs only (bold, dim, underline, inverse, italic). No color SGR. | `NO_COLOR=*`, `TERM=dumb`, `SILVERY_COLOR=mono` |
| **plain** | Nothing — no SGR, no attrs. Pure text. | `!isatty(stdout)`, `SILVERY_COLOR=plain` |
| **no-ansi-strict** | Nothing, not even attrs. | `SILVERY_STRIP_ALL=1` (opt-in override) |

`NO_COLOR=1` means "do not use color" per [no-color.org](https://no-color.org). Attrs like bold/italic/underline are NOT color; preserving them is within spec. Silvery's default on `NO_COLOR` is **monochrome** (preserves hierarchy via attrs). Apps that want true zero-SGR set `SILVERY_STRIP_ALL=1` or pipe through a stripper.

#### Tier detection

```
SILVERY_COLOR env var → forced tier (dev/test)
NO_COLOR=* → monochrome (attrs preserved)
TERM=dumb → monochrome
!isatty(stdout) → plain (no SGR at all)
COLORTERM ∈ {truecolor, 24bit} → truecolor
TERM ends -256color → 256
TERM matches iterm|vte*|*-truecolor → truecolor
Windows Terminal → truecolor
else → ANSI 16
```

Also respect `FORCE_COLOR`, `CLICOLOR`, `CLICOLOR_FORCE` — standard cross-tool env vars.

#### 256-color quantization

The 256-color space has three regions:

| Indices | Region | Math |
|---|---|---|
| 0–15 | ANSI 16 (themeable) | user's probed/default scheme slots |
| 16–231 | 6×6×6 cube (fixed RGB) | `rgb(r×51, g×51, b×51)`, index = 16 + 36r + 6g + b |
| 232–255 | Greyscale ramp (fixed) | `rgb(n, n, n)`, n = 8 + (index-232)×10 |

Quantization: pick minimum ΔE2000 across all 256 candidates, emit `SGR 38;5;<idx>`.

#### Monochrome attrs theme (per-token table)

Preserves hierarchy when color is unavailable. Each token has an attrs mapping:

| Token | attrs |
|---|---|
| `fg-default`, `bg-*`, `border-default` | `[]` |
| `fg-muted`, `fg-subtle` | `["dim"]` |
| `fg-accent` | `["underline"]` |
| `fg-danger` | `["bold", "inverse"]` |
| `fg-warning` | `["bold"]` |
| `fg-success` | `["bold"]` |
| `fg-info` | `["italic"]` |
| `border-focus` | `["bold"]` |
| `bg-selected` | `["inverse"]` |
| `cursor-fill` | `["inverse"]` |

Universally-supported SGR subset: bold, dim, italic, underline, inverse, strikethrough. Plus bold-as-bright compatibility note: some terminals conflate bold with bright palette — accept the overlap.

See bead `km-silvery.theme-mono`.

### Canvas renderer (v2.0)

```ts
ctx.fillStyle = theme.get("bg-default").toHex()
ctx.font = typography.get("H1").canvasFont   // "bold 16px ui-monospace"
```

No capability tiers — canvas is always truecolor. Attrs map to canvas equivalents: bold → `ctx.font` weight, underline → `ctx.drawLine`, inverse → paint bg rect first.

### Web renderer (v3.0)

```css
:root {
  --fg-default: oklch(0.90 0.01 230);
  --bg-default: oklch(0.24 0.00 90);
  /* ... */
}
```

Browser renders natively via CSS Color 4. Fallback for older browsers: `@supports not (color: oklch(0 0 0))` → `toHex()`.

See bead `km-silvery.theme-multi-target`.

---

## Cross-cutting decisions

### The `scheme.primary` metadata field

Themes optionally declare `primary` as an explicit brand color. This is **metadata, not a 23rd token** — it's the input to the brand cascade, not something components consume directly. Components consume `bg-fill-accent` / `fg-accent` / `border-focus`, which derive from `primary`.

### Dynamic theme changes

Users can switch terminal themes live. Silvery supports `setTheme(newTheme)` at runtime; all components re-render with new token values on next frame. Auto-detect can be re-triggered:

```ts
await setTheme(await autoDetect())
```

### Backdrop fade (separate feature)

When a modal is open, content behind it fades via a render-time cell transform — not a theme concern. The renderer applies `blend(cell.fg, cell.bg, fadeAmount)` to the backdrop region; modal itself renders with full colors on top.

Default: ModalDialog has `fade={0.5}` on by default. Escape hatch: `<ModalDialog fade={0}>`.

See bead `km-silvery.backdrop-fade`.

### Fake cursors in silvery

Silvery renders its own cursors (SelectList rows, TextInput insertion points, Board active cards, Omnibox selected rows). These use `$cursor-fg` / `$cursor-bg` so they match the user's terminal cursor color. See bead `km-silvery.theme-fake-cursor`.

---

## Scheme — the 22-slot terminal palette (Layer 3 internal)

The user's terminal exposes 22 configurable slots (16 ANSI + 6 semantic: fg, bg, cursorColor, cursorText, selectionFg, selectionBg). This `ColorScheme` type exists internally as the auto-detect intermediate representation. Apps never construct one; they consume the derived `Theme`.

### Cross-tool conventions for the 16 ANSI slots

Drawn from git, vim, ls/eza, bat, grep, syntax highlighters, test runners:

| Slot | Convention |
|---|---|
| black, white | default bg / default fg |
| red, green, yellow | errors, success, warnings/metadata |
| blue | directories, info, links |
| magenta, cyan | special/media, symlinks/strings |
| black-bright | muted, de-emphasized |
| bright-variants | emphasis (critical errors, staged changes, search matches, keywords, function names) |
| white-bright | titles, emphasis |

### Neutral ladder — hierarchy without color

ANSI 16 provides four native neutrals; `dim` extends the ladder. Combined with the 2 semantic neutrals (fg/bg) and typography presets:

| Expression | Role |
|---|---|
| `bg-default` | app floor |
| `black` | slot-level darkest |
| `brightBlack` | standard muted tier |
| `fg-subtle` (≈ `brightBlack + dim`) | fine print, via `<Small>` |
| `fg-muted` | secondary text |
| `fg-default` / `white` | baseline |
| `brightWhite` | emphasis, titles |

## Industry reference

- [termstandard/colors](https://github.com/termstandard/colors) — `COLORTERM` reference
- [marvinh.dev — terminal colors](https://marvinh.dev/blog/terminal-colors/) — graceful-degradation
- [charmbracelet/lipgloss](https://github.com/charmbracelet/lipgloss) — 4-tier profile model
- [jvns.ca — terminal colours are tricky](https://jvns.ca/blog/2024/10/01/terminal-colours/) — why probing fails
- [no-color.org](https://no-color.org) — the one cross-tool standard
- [Material Design 3](https://m3.material.io/foundations/design-tokens) — role-first tokens with on-X pairs
- [GitHub Primer primitives](https://primer.style/primitives/) — type-prefix naming (fg-/bg-/border-)

## Related

- km's [docs/ref/ansi-color-detection.md](../../../../docs/ref/ansi-color-detection.md) — on/off detection for km's tap tool
- [vendor/silvery/docs/guide/styling.md](../../../../vendor/silvery/docs/guide/styling.md) — public styling guide
- [hub/silvery/design/silvery-dev-design-system.md](../silvery-dev-design-system.md) — Polaris-structured web design system

### Beads (15 open under `km-silvery.design-system`)

Layer 1 — Tokens
- `theme-dim-deprecate` — remove dimColor prop from Text/Box
- `theme-fake-cursor` — wire fake cursors to cursor-fg

Layer 2 — Catalog
- `theme-catalog` — 30+ bundled themes (authored, silvery-flavored)
- `theme-custom` — defineTokens for brand colors + authored theme support

Layer 3 — Auto-detect
- `theme-auto-detect` — probe + fingerprint + derive, with confidence metadata
- `theme-generators` — synthesize from partial input (fg/bg, brand, accents)
- `scheme-rename` — ColorPalette → ColorScheme refactor

Layer 4 — Invariants
- `theme-invariants` — AA contrast + gamut mapping enforced at load

Layer 5 — Renderers
- `theme-mono` — monochrome attrs theme (accessibility feature)
- `theme-multi-target` — canvas + web renderers
- `theme-storybook` — browse themes + live token inspection

Infrastructure
- `color-oklch` — migrate @silvery/color to OKLCH-native
- `backdrop-fade` — render-time fade for modals (not a theme concern)
- `theme-public-docs` — silvery.dev + terminfo.dev content

## Open questions

1. **Catalog size**: 30 themes OK, or push to 50 matching every popular terminal preset?
2. **Attrs in monochrome** — the per-token table above assumes opinionated defaults; should themes be able to override (e.g., Dracula's mono mapping differs from Solarized's)?
3. **`generateTheme()` API shape** — proposed four entry points (fg/bg, fg/bg/primary, accents{}, baseHue) — right level of flexibility?
