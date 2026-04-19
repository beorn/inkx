# Silvery Design System (Sterling)

**Status**: canonical (2026-04-19). Single source of truth for silvery's design system — tokens, derivation, theming API, package layout, phased delivery. Replaces the sprawl that lived across `terminal-color-strategy.md`, `theme-system-v2-plan.md`, `theme-v4-multi-target-plan.md` (all archived in `hub/silvery/archive/theme/`).

**Prerequisite**: [docs/silvery-positioning-brief.md](../../../../docs/silvery-positioning-brief.md) — silvery is multi-target (terminal + web + canvas); this design system is built cross-platform-first.

**Sub-plans** (concrete implementation work): [color-inherit-plan.md](color-inherit-plan.md), [backdrop-fade-plan.md](backdrop-fade-plan.md).

---

# Part 1 — The model

## The flow

```
Inputs                     Function             Output         Consumer
─────────                  ────────             ──────         ────────
color scheme       ┐
                   ├──→   derive       ──→   Theme    ──→   @silvery/ui
design tokens      ┘      (preservative)
```

The **color scheme** (22-color palette like Nord, Catppuccin, etc.) and the **design tokens** (the semantic tokens that form the design system's vocabulary — `accent.bg`, `fg.muted`, `error.fg`, etc.) are co-inputs to a derivation function that produces a Theme. The Theme is then consumed by UI. Four things are swappable: the color scheme, the design tokens, the derivation, and the components.

## The code

**Default — one import, zero config:**

```ts
import { run } from "silvery"
await run(<App />)
// Internally: theme = design.deriveFromScheme(detectTermScheme())
```

**Explicit — theme is a plain value, computed outside and passed in:**

```ts
import { run, pipe, detectTermColorScheme, design } from "silvery"

// detectTermScheme() → auto-detected color scheme from the terminal's OSC 10/11 probe
// design.deriveFromScheme → turns that color scheme into a Theme using the default tokens
const theme = pipe(detectTermColorScheme(), design.deriveFromColorScheme)
await run(<App />, { theme })
```

The default `design` is **Sterling** — silvery's canonical design system (~80% Primer, with Material's vocabulary — see [Appendix C](#appendix-c--sterling-primer-vocabulary-and-derivation-delta)). Most apps never need to know this name; it only appears when you compare or swap systems.

**Different input shapes, same shape of output:**

```ts
const theme = design.deriveFromColor("#FF6A00")                    // seed color
const theme = design.deriveFromColorSchemeWithBrand(scheme, "#FF6A00")  // scheme + brand overlay
const theme = design.deriveFromColorPair(lightScheme, darkScheme)       // light/dark bundle
const theme = design.theme({                                        // explicit values + fill
  accent: { bg: "#FF6A00", fg: "#FFFFFF" },
  error:  { bg: "#B00020" },
})
```

**Swap the design-token system — alternatives are separate packages:**

```ts
import { material } from "@silvery/design-material"
const theme = material.deriveFromColor("#FF6A00")
await run(<App />, { theme })
```

Officially-maintained alternatives: `@silvery/design-material`, `@silvery/design-primer`, `@silvery/design-polaris`. Community: `@silvery-community/*`. Writing your own: publish a package exporting a `DesignSystem` object (see [contract](#design-system-contract)).

**Nested themes via `<ThemeProvider>` — the scoping primitive:**

```tsx
function App() {
  return (
    <Box>
      <Header />                                      {/* app theme */}
      <ThemeProvider theme={nordTheme}>
        <Sidebar />                                   {/* nord */}
      </ThemeProvider>
      <Main />                                        {/* back to app theme */}
      <ThemeProvider theme={material.deriveFromColor("#FF6A00")}>
        <Modal />                                     {/* material orange */}
      </ThemeProvider>
    </Box>
  )
}
```

`run({ theme })` is sugar for the root `<ThemeProvider>`. Real-world uses: theme pickers, per-pane theming, multi-tenant branding, hot-swap at runtime, high-contrast/invert panes.

**Components use `$`-tokens** — the flat form is the everyday surface:

```tsx
<Text color="$fg-accent">Selected</Text>
<Box backgroundColor="$bg-surface-subtle">Sidebar</Box>
<Text color="$fg-on-error" backgroundColor="$bg-error">Error!</Text>
<Alert tone="error">Something failed</Alert>     // resolves to tokens internally
```

Tokens read **channel-role-state** order (matches Primer / CSS var conventions). A nested `theme.accent.hover.bg` form is also available for programmatic access — see [Part 2 §Two shapes](#flat--the-user-facing-form).

## Principles

1. **Theme is a value, not a config knob.** Computed outside `run()`, passed in. Testable in isolation, cacheable, swappable at runtime.
2. **Design systems are packages.** `@silvery/design` ships Sterling (default); `@silvery/design-material` / `-primer` / community packages swap it. Each exports semantic tokens + defaults + derivation helpers as one namespace.
3. **`ThemeProvider` is the scoping primitive.** Everything else composes on top. `run({ theme })` just seeds the root — nest freely for modals, previews, multi-tenant branding, hot-swap.
4. **Cross-platform by construction.** Same Theme, same `<ThemeProvider>`, same components across terminal / canvas / DOM / React Native. Only the output phase differs.
5. **Preservative by default.** User-authored color schemes (Nord, Catppuccin) are sacred — Sterling's default derivation preserves the 22 input colors and only fills gaps. Generative derivations (Material-style from a seed) are supported as alternate modes.

## How to frame it

- **Like Tailwind** — silvery ships the substrate AND an opinionated default on top (Sterling). Swap via `@silvery/design-*`.
- **Like Material 3, but preservative.** Material generates from a seed; Sterling preserves the scheme. Both supported.
- **Unique among design systems**: 84 color schemes + auto-detection + runtime swap. No mainstream web system has this. Comes for free from targeting terminal first.

---

**↓ Reference detail below. Skip on first read.**

---

# Part 2 — Reference

## Design-system contract

A **design-token system** (the set of semantic tokens apps and components consume — `accent.bg`, `error.fg`, `surface.subtle`, etc.) is an object matching:

```ts
export interface DesignSystem<Input = unknown> {
  /** Display name (for tooling/docs). */
  readonly name: string

  /** The Theme shape this system produces (for TypeScript). */
  readonly shape: ThemeShape

  /** Raw defaults, no input required. */
  defaults(mode?: "light" | "dark"): Theme

  /** Fill partial theme values + defaults. */
  theme(partial: Partial<Theme>): Theme

  /** Standard derivations — each is optional. */
  deriveFromcolofScheme?(scheme: ColorScheme): Theme
  deriveFromColor?(color: string): Theme
  deriveFromColorPair?(light: ColorScheme, dark: ColorScheme): Theme
  deriveFromColorSchemeWithBrand?(scheme: ColorScheme, brand: string): Theme
}
```

`defineDesignSystem(...)` validates and returns a typed `DesignSystem`. Writing a new one is publishing a package that exports `DesignSystem`.

## Default design system (Sterling, in `@silvery/design`)

Grammar (from GitHub's Primer): `prefix-role-state-modifier`.

| Axis | Values |
|---|---|
| Prefix | `fg-*`, `bg-*`, `border-*`, `cursor-*` |
| Role | `accent`, `info`, `success`, `warning`, `error`, `muted`, `default` |
| Kind | `fill` (interactive surfaces), `surface` (containers), `on-<role>` (foreground on filled bg) |
| State | `-hover`, `-active`, `-selected`, `-disabled`, `-focus` |
| Emphasis | `-subtle`, `-muted`, `-emphasis` |
| Surface level | `default`, `subtle`, `raised`, `overlay` |

**Vocabulary**: 6 of 10 surveyed systems use `error`/`warning`/`success`/`info`. Polaris (`critical`/`caution`) and Primer (`danger`/`attention`) are opinionated outliers. Silvery synthesizes: **Primer grammar + Material/shadcn vocabulary** — no single system ships this combo.

**Structured shape** (TS object) rather than flat strings (CSS variables) — silvery isn't CSS-bound:

```ts
theme.error   = { fg, bg, fgOn, hover: { fg, bg }, active: { fg, bg } }
theme.accent  = { fg, bg, fgOn, border, hover, active }
theme.info    = { fg, bg, fgOn, hover, active }       // may alias accent in default Sterling
theme.success = { fg, bg, fgOn, hover, active }
theme.warning = { fg, bg, fgOn, hover, active }
theme.surface = { default, subtle, raised, overlay, hover }
theme.border  = { default, focus, muted }
theme.cursor  = { fg, bg }
```

Web-CSS export auto-flattens (`theme.error.hover.fg` → `--fg-error-hover`) at build time.

### Intent vs role — `destructive` at the component layer

Sterling's roles (`error`, `warning`, `info`, `accent`, `success`) are **status tokens**: they communicate *what's happening* (this is an error, this needs attention). But UIs also need **intent tokens** for *what this action will do*.

The classic case: a "Delete repository" button is not an error — it's a destructive action. Calling it `<Button tone="error">` sounds wrong in docs and code.

**Sterling provides `destructive` as a component-layer intent alias**, not a base color role:

```tsx
<Alert tone="error" />        // status: something failed
<Button tone="destructive" /> // intent: this will delete
<Callout tone="warning" />    // status: heads up
```

By default, `destructive` aliases to `error` (same hex values). Apps can override to diverge. This gives semantic correctness without palette sprawl.

**Why not make `destructive` a base color token?** It's not a distinct hue family — it's how you *describe* a color's purpose. Keeping it at the intent layer prevents a proliferation of near-duplicate tokens (`error`/`danger`/`critical`/`destructive` all red but subtly different), which is exactly the migration debt large design systems accumulate over time.

### Urgency is not a design-system concern

Sterling deliberately **does not** ship `severe` / `critical` / `catastrophic` as color roles, AND **does not** ship a `priority` / `importance` axis. Urgency isn't how users or designers think about colors — they think in terms of *what this UI is* (a toast, a dialog, an inline error) and *what it says* (copy, icon).

Urgency is expressed through **three mechanisms that aren't the design system**:

1. **Component choice** — `<Toast>` (transient, top-of-screen) ≠ `<Banner>` (dismissible header) ≠ `<Dialog>` (blocking) ≠ inline `<Alert>`. Picking the right component *is* the escalation.
2. **Position** — top-of-screen conveys more urgency than inline; center-modal conveys more than a corner toast.
3. **Content** — "Warning" vs "⚠️ Critical: data loss in 30 seconds" is a copy/icon concern, not a token concern.

No mainstream design system (Material, shadcn, MUI, Chakra, Ant) ships a separate urgency axis alongside color roles. Sterling follows the same pattern: one `tone` axis with 5 values (`error` / `warning` / `success` / `info` / `accent`), component APIs stay narrow, and apps compose escalation from component + position + content.

When someone asks "how do I show a *critical* error?" — the answer is "use a `<Dialog>` with `tone='error'`, not an inline `<Alert>`." Not "add `priority='high'`."

## Color scheme shape

A **color scheme** is a **22-color palette** following the terminal-standard layout: ANSI 0-15 + base fg/bg + 4 semantic slots (primary, accent, muted, selection). Pure hex, platform-neutral. Valid input for terminal (tier-quantized at output) OR web/canvas (hex directly).

Silvery ships **84 color schemes** — the famous terminal/editor palettes (Nord, Solarized, Catppuccin ×4, Dracula, Gruvbox, One Dark, Tokyo Night, Monokai, …). Users can: pick one (`scheme="nord"`), author one (supply 22 colors), or rely on auto-detection via OSC 10/11 terminal probe.

## Derivation rules (default, preservative)

| Token | Derivation |
|---|---|
| `error.fg` | `scheme.red` |
| `warning.fg` | `scheme.yellow` |
| `success.fg` | `scheme.green` |
| `info.fg` | `scheme.primary` (aliases `accent.fg` by default — distinct role, same hex) |
| `accent.fg` | `scheme.primary` |
| `accent.bg` | `scheme.primary` |
| `accent.hover.bg` | OKLCH `+0.04L` on `accent.bg` |
| `accent.active.bg` | OKLCH `+0.08L` on `accent.bg` |
| `accent.fgOn` | contrast-pick(fg, bg) for WCAG AA against `accent.bg` |
| `muted.fg` | blend(fg, bg, 0.5) |
| `surface.default` | `scheme.background` |
| `surface.subtle` | blend(bg, fg, 0.05) |
| `surface.raised` | blend(bg, fg, 0.08) |
| `surface.overlay` | blend(bg, fg, 0.12) |
| `border.focus` | `scheme.primary` |

Scheme authors can override specific tokens; OKLCH defaults cover 80%+. State variants (`-hover`, `-active`) shift ±0.04L / ±0.08L OKLCH; direction auto-flips for light vs dark schemes.

### Derivation guardrails (not just formulas)

Fixed OKLCH deltas are a good default, **not a law of nature**. They fail on:

- **Yellow schemes** — small L shifts in yellow produce invisible differences
- **Low-chroma schemes** — Nord's blues can collapse `warning` and `surface.subtle` into visual indistinguishability
- **Very dark / very light accents** — ±0.04L saturates at the luminance endpoints

**Therefore derivation MUST**:

1. Run **WCAG contrast checks** on every role pair (`fg`/`bg`, `fgOn`/`bg`, `border.focus`/`bg`) and adjust until AA 4.5:1 is met — not as a best-effort, as a hard invariant
2. **Adapt deltas per hue/chroma/luminance** — yellows and low-chroma schemes need wider shifts than blues
3. **Allow per-role override** in the scheme object — scheme authors can pin specific tokens when algorithmic derivation fails for their particular palette
4. **Never preserve source palette identity so hard that semantics become illegible**

"Users authored Nord" is a good principle. "Preserve Nord even when `warning` and `surface.subtle` collapse" is not.

## Package layout

```
Layer 1 — Primitives          design-system-agnostic
  @silvery/color              OKLCH math, blend, hex utils
  @silvery/ansi               terminal output, tier quantization, derivation
  @silvery/ag-term            terminal reconciler
  @silvery/ag-react           React reconciler + <ThemeProvider> + useTheme()
  @silvery/flexily            layout engine

Layer 2 — Design system       opinionated (the default)
  @silvery/design             ships Sterling — the canonical DesignSystem
  @silvery/schemes            the 84 color-scheme catalog (+ browse CLI)
  @silvery/typography         H1/H2/P/Lead/Muted/Small presets

Layer 2' — Alternative systems  opt-in; each is a separate package
  @silvery/design-material    Material-3 tokens + generative derivation
  @silvery/design-primer      real Primer tokens (danger/attention vocab)
  @silvery/design-polaris     Polaris tokens (critical/caution vocab)
  @silvery-community/*        community-authored, same contract

Layer 3 — Components          opinionated (consumes Layer 2)
  @silvery/ui                 SelectList, TextInput, ModalDialog, Tabs, ListView, …

silvery                        barrel of Layer 1 + @silvery/design + Layer 3
```

Composability test: `@silvery/color + @silvery/ansi + @silvery/ag-react + @silvery/design-polaris + @silvery/polaris-ui` works — Layer 1 is design-system-agnostic. Design systems and UI libraries can be published alongside silvery.

## Output targets

| Target | Conversion |
|---|---|
| Terminal truecolor | Theme hex → ANSI 24-bit |
| Terminal 256-color | Theme hex → nearest ANSI-256 |
| Terminal ANSI16 | Theme hex → nearest ANSI-16 slot |
| Terminal mono | Theme hex → attribute-only (bold/underline/reverse) |
| Web (DOM) | Theme hex → CSS `--token` variables |
| Canvas | Theme hex → direct fill colors |

Same Theme object across all targets; only the output phase differs.

---

# Part 3 — Phased delivery

Parent epic: `km-silvery.theme-v4`. Full bead tree + dependency graph lives in beads — this section is just the map.

## Critical path

```
preflight → 2a → 2b → 2c → 2d ─┬→ design-package-rename ───┐
                                ├→ public-docs              │
                                └→ storybook-mvp → full     │
                                                             ↓
                                              sterling-design-material (post-plateau)

stripInlineColors: orthogonal, any time after 2d
```

Each bead = one focused session. Seven serial + two parallel to plateau.

## Status

| # | Phase | Bead | Status |
|---|---|---|---|
| 1 | Hex-only Theme (preparatory) | `theme-v4-ansi16-hex` | ✓ shipped |
| — | Pre-flight decisions (D1-D6) | `sterling-preflight` | open — blocks 2a |
| 2a | Theme type + derivation + guardrails (additive) | `sterling-2a-data-layer` | open |
| 2b | `@silvery/ui` consumes new tokens | `sterling-2b-ui-components` | open |
| 2c | Batch-refactor km-tui ~145 sites | `sterling-2c-km-migration` | open |
| 2d | Delete legacy, ship silvery 0.19.0 (**BREAKING**) | `sterling-2d-release` | open |
| 3a | Internal package rescope (@silvery/theme slim) | `theme-v4-schemes-rescope` | ✓ shipped |
| 3b | Package rename → `@silvery/design` + `@silvery/schemes` | `design-package-rename` | open — after 2d |
| — | silvery.dev doc updates for 0.19.0 | `sterling-public-docs` | open — after 2d |
| 4 | km-tui `stripInlineColors` cleanup | `theme-v4-stripInlineColors` | open — orthogonal |
| 5 | `@silvery/design-material` reference impl | `sterling-design-material` | open — post-plateau |
| 6 | Backdrop standalone + Kitty overlay | `theme-v4-backdrop-standalone` + silvery main | ✓ shipped (calibration stable) |
| — | Storybook MVP (3-pane explorer) | `sterling-storybook-mvp` | open — after 2a |
| — | Storybook Full (derivation viz + audit + demos) | `sterling-storybook-full` | open — after MVP |

## What each sub-phase does

**Pre-flight** — lock the 6 open decisions (destructive as prop not role; info as distinct slot with same default hex; contrast guardrails tiered; flat+nested double-populate not Proxy; reuse theme-detect; clean break at 0.19.0). Output: `sterling-preflight.md`.

**2a Data layer (additive)** — new `@silvery/design/sterling` with the full Theme shape, OKLCH + WCAG guardrails, flat projection, derivationTrace. Legacy Theme fields still work.

**2b UI components** — `@silvery/ui` components (SelectList, TextInput, ModalDialog, Alert, Toast, Tabs) migrated to new tokens. km-tui unchanged.

**2c km-tui migration** — mechanical batch-refactor of ~145 call sites. No behavior change.

**2d Release** — delete all compat aliases, Theme type clean, ship silvery 0.19.0 with breaking-change notes.

**3b Package rename** — `@silvery/theme` → `@silvery/design` + `@silvery/schemes`. One-release compat façade, then delete.

**4 stripInlineColors** — km-tui cleanup, orthogonal.

**5 design-material** — publish `@silvery/design-material` as reference implementation. Validates the pluggable contract.

**Public docs** — update silvery.dev's 12 theme-related pages for the new Theme shape + Sterling name + flat-token primacy. Preserve SEO surface (each page has its own URL / ranking signal).

**Storybook MVP + Full** — interactive explorer at `vendor/silvery/examples/apps/storybook.tsx`. Three panes, live scheme swap, token click → derivation. Full adds visualizer + contrast audit + intent/urgency demos. Details in [storybook-design.md](storybook-design.md).

---

# Appendices

## Appendix A — 10-system comparison (informs vocabulary choice)

| System | Vendor | Reach | Grammar | Vocabulary | Uses `error`? |
|---|---|---|---|---|:-:|
| Material 3 | Google | Dominant on Android (~4M wk) | Medium | error/warning/success/info | ✓ |
| Carbon | IBM | Enterprise B2B | Good | error/warning/success/info | ✓ |
| Tailwind | Tailwind Labs | Dominant web utility (~15M wk) | N/A (color-first) | — | ✗ |
| shadcn/ui | shadcn | Hot 2024-2025 React choice | Good (CSS vars) | destructive/muted/accent | ✗ |
| Radix Colors | WorkOS | Foundational (shadcn base) | scale-based | — | ✗ |
| Chakra UI | Segun Adebayo | ~500K wk | Medium | error/warning/success/info | ✓ |
| Ant Design | Alibaba | ~1.2M wk; dominant in China | Medium | error/warning/success/info | ✓ |
| Claude Design | Anthropic | Internal; generated per-team | Generated | error/warning/success/info | ✓ |
| Polaris | Shopify | Shopify admin + apps | Good (opinionated) | critical/caution/subdued | ✗ |
| Primer | GitHub | github.com + fans (~120K wk) | **Excellent** | danger/attention/severe | ✗ |

**Conclusion**: Primer grammar + Material/shadcn vocabulary.

## Appendix B — derivation approaches compared

| Dimension | Material 3 | Ant Design | Silvery (default) |
|---|---|---|---|
| Input shape | 1 seed color | ~13 seed tokens | 22-color palette |
| Color math | HCT (Google) | CAM16-UCS | OKLCH |
| Token layers | 2 | 3 (seed/map/alias) | 2 |
| Output count | ~60-80 | ~400 | ~50 |
| Generates scales? | Yes | Yes | No (terminals ship scales) |
| Output aesthetic | Material-flavored | Ant-flavored | **Scheme-preserved** |
| User palette honored? | Partial (seed hue) | Partial (seed colors) | **Fully (22 colors intact)** |
| Runtime swap | ✓ | ✓ | ✓ |
| Auto-detect from env | ✓ (Android wallpaper) | ✗ | **✓ (terminal probe)** |
| Cultural fit | Android, Google | Enterprise admin | Terminal, themeable SaaS, white-label |

Material + Ant are **generative**. Silvery's default is **preservative** — but derivation is pluggable, so generative modes are supported as alternate derivations.

## Appendix C — Sterling: Primer vocabulary and derivation delta

**Sterling is ~80% Primer.** It takes Primer's grammar wholesale and its structural conventions (fg / bg / `fg-on-<role>` pairs, state variants, surface hierarchy, per-role emphasis levels). The deltas are deliberate:

| Aspect | Primer | Sterling | Reason |
|---|---|---|---|
| Grammar | `fg-*`, `bg-*`, `-hover`, `-active` | Same | Primer grammar is the best; no reason to deviate |
| Surface pairs | `canvas-default`, `canvas-subtle` | `surface.default`, `surface.subtle` | Same concept, `surface` reads better cross-platform |
| Success role | `success` | `success` | Same |
| Error role | **`danger`** | **`error`** | 6 of 10 major systems use `error`; ecosystem consensus |
| Warning role | **`attention`** | **`warning`** | Same reasoning |
| Critical role | `severe` | *(n/a — use `error`)* | Sterling collapses severity; apps use state, not a new role |
| Accent / brand | `accent` + separate brand | `accent` (default) + `brand` overlay | Simpler default; brand is opt-in |
| Structured vs flat | Flat CSS vars (`--fgColor-accent`) | **Structured JS objects** (`theme.accent.fg`) | Silvery isn't CSS-bound (see [Appendix D](#appendix-d--cross-platform-translation)) |
| Derivation input | Designer-authored JSON | **22-color terminal scheme** | Terminal culture — schemes are the input |
| Derivation style | Designer-curated light/dark pair | **Preservative OKLCH from scheme** | Users authored Nord; Sterling preserves Nord |
| State shift | `-hover` / `-active` hand-curated | **OKLCH ±0.04L / ±0.08L** | Terminals can't guess; OKLCH is a good default |

**What stays the same**: the structural shape of the system — roles, surfaces, state variants, pair convention, `fg-on-<role>` separation, emphasis levels. An app that reads Primer's style guide and applies it to silvery will mostly "just work" once the vocabulary substitution is done.

## Appendix D — Cross-platform translation

Sterling has **two first-class shapes on the same Theme object**. In practice, users interact with one: the **flat form** via `$token` strings in JSX. The nested form is the underlying data structure — discoverable, typed, used by advanced code — but not the everyday surface.

No namespace indirection: both forms live at the root of `theme`. Kebab-hyphen keys (`fg-accent`, `bg-surface-subtle`) never collide with plain role-name keys (`accent`, `error`, `surface`) — hyphens in the flat form keep them disjoint.

### Flat — the user-facing form

```tsx
// What almost every user writes almost all the time:
<Text color="$fg-accent">Click me</Text>
<Box backgroundColor="$bg-accent-hover">...</Box>
<Alert tone="error">Something failed</Alert>     // resolves to $fg-error + $bg-error-subtle
```

And programmatically — direct root access, no extra dot:

```ts
theme["fg-accent"]           // "#0969da"
theme["bg-accent-hover"]     // "#0550ae"
theme["fg-on-error"]         // "#ffffff"
theme["border-focus"]        // "#58a6ff"
```

Flat tokens follow **channel-role-state** order (matches Primer / CSS var conventions):

| Token | Reads as |
|---|---|
| `bg-accent` | "background of accent" |
| `bg-accent-hover` | "background of accent, in hover state" |
| `fg-on-error` | "foreground when on an error fill" |
| `border-focus` | "focus-state border" |

Tokens are short (≤ 3 segments), readable as English, and compose with `$` naturally — no dot chains to escape inside strings.

### Nested — the advanced / programmatic form

For code that iterates tokens, builds custom derivations, or needs typed access:

```ts
// Programmatic — autocomplete + type-safe
theme.accent.fg                    // "#0969da" — same reference as theme["fg-accent"]
theme.accent.hover.bg              // "#0550ae"
theme.surface.subtle               // "#f6f8fa"
theme.error.fgOn                   // "#ffffff"

// Iterate state variants for a role
for (const [state, pair] of Object.entries(theme.accent)) { /* ... */ }
```

### Both reference the same strings, both on the same object

```ts
theme.accent.bg === theme["bg-accent"]   // true — same reference, not a copy

// Optional filtered view for tooling (CSS export, flat-only iteration):
Object.entries(theme.flat)               // ~50 string entries, no role objects

// TypeScript models this as an intersection:
type Theme = FlatTokens & Roles          // ~50 hyphen keys + ~8 role objects
```

Both populated at derivation time; no runtime lookup penalty either way. The CSS export emits flat tokens as `--bg-accent-hover` 1:1.

**Flattening rule** (deterministic):

```
theme.{role}.{kind}              →  {kind}-{role}
theme.{role}.{kind}.{state}      →  {kind}-{role}-{state}
theme.{role}.{state}.{kind}      →  {kind}-{role}-{state}      (same, re-normalized)
theme.{role}.fgOn                →  fg-on-{role}
```

Example round-trip:

| Nested | Flat |
|---|---|
| `theme.accent.bg` | `bg-accent` |
| `theme.accent.fg` | `fg-accent` |
| `theme.accent.fgOn` | `fg-on-accent` |
| `theme.accent.hover.bg` | `bg-accent-hover` |
| `theme.accent.active.bg` | `bg-accent-active` |
| `theme.surface.subtle` | `bg-surface-subtle` |
| `theme.surface.subtle.hover` | `bg-surface-subtle-hover` |
| `theme.border.focus` | `border-focus` |
| `theme.error.bg` | `bg-error` |

### Why both? — each shape earns its keep

| Shape | Good at | Bad at |
|---|---|---|
| **Nested** | Discoverability in IDE (autocomplete `theme.accent.` shows `fg`, `bg`, `fgOn`, `hover`, `active`), type-safety of shape, programmatic iteration (`for (const [state, pair] of Object.entries(theme.accent))`) | Verbose for simple references; hard to use in string syntax |
| **Flat** | `$token` strings (`<Text color="$fg-accent">`), CSS var compatibility (`--bg-accent-hover`), shell-friendly logging/debugging, theme diffs | Opaque — no structural type information; `theme.flat["bg-accnt"]` typos silently fail (though TS string-literal types catch known keys) |

### How Sterling exposes both

Every `DesignSystem.deriveFrom*(…)` function returns a Theme where:
- The nested form is a plain object (JS-native, no Proxy magic)
- `theme.flat` is a frozen record populated at derive time (~50 keys)
- Both views reference the same string values (shared, not duplicated in memory)

```ts
const theme = design.deriveFromScheme(nord)

theme.accent.bg        // "#88C0D0" — nested
theme.flat["bg-accent"] // "#88C0D0" — same string, same reference

Object.keys(theme.flat).length  // ~50 — one entry per leaf token
```

### How the two shapes map to targets

| Runtime | Which shape | Why |
|---|---|---|
| Terminal (silvery) | Both — `$` strings resolve against flat; programmatic access reads nested | `<Text color="$fg-accent">` → flat lookup; custom hooks → nested |
| React Native | Nested primarily; flat available for `$`-style libs (Tamagui-compat) | JS-native consumption |
| Canvas | Nested (direct fill/stroke) | Programmatic rendering loops |
| DOM / Web | Flat form → CSS custom properties 1:1 (`--bg-accent-hover`) | CSS syntax is flat; no flattening rule mismatch |
| Figma / W3C Design Tokens | Both exported; nested for hierarchical browsing, flat for search | Tooling ecosystem |

---

**Below**: how Sterling's form translates to specific other design systems' shapes.

### Sterling → Primer (flat CSS variables)

Primer ships flat CSS variables; Sterling's structured form compiles to them at build time via deterministic flattening:

| Sterling (structured) | Primer-ish CSS var |
|---|---|
| `theme.accent.fg` | `--fgColor-accent` |
| `theme.accent.bg` | `--bgColor-accent-emphasis` |
| `theme.accent.fgOn` | `--fgColor-on-emphasis` |
| `theme.accent.hover.bg` | `--bgColor-accent-emphasis-hover` |
| `theme.surface.default` | `--bgColor-default` |
| `theme.surface.subtle` | `--bgColor-muted` |
| `theme.error.fg` | `--fgColor-danger` (Primer) / `--fgColor-error` (Sterling web) |
| `theme.border.focus` | `--borderColor-focus` |

The flattening rule: `theme.{role}.{kind}.{state?}` → `--{kind}Color-{role}-{state?}`. Silvery's web target emits these as CSS custom properties at the `<ThemeProvider>` root, matching Primer's convention without the vocabulary rename.

### Sterling → Material 3 (structured, different keying)

Material 3's token system is deeply structured but keys differently — pair convention is encoded in *names* (`onPrimary`) rather than nested objects:

| Sterling | Material 3 (Compose/Flutter) |
|---|---|
| `theme.accent.bg` | `colorScheme.primary` |
| `theme.accent.fgOn` | `colorScheme.onPrimary` |
| `theme.accent.fg` | *(no direct peer — Material uses `primary` for both)* |
| `theme.surface.default` | `colorScheme.surface` |
| `theme.surface.subtle` | `colorScheme.surfaceVariant` / `surfaceContainerLow` |
| `theme.error.bg` | `colorScheme.error` |
| `theme.error.fgOn` | `colorScheme.onError` |
| `theme.accent.hover.bg` | *(derived via state layers, not a token)* |

`@silvery/design-material` maps Sterling-shaped input → Material-shaped theme (or the inverse, depending on which direction you're bridging). Components wired to Sterling won't read from Material's theme directly — you pick one design system per ThemeProvider scope.

### Sterling → shadcn / Tailwind (flat CSS vars, scale-based)

shadcn ships flat kebab CSS vars backed by Radix color scales:

| Sterling | shadcn CSS var |
|---|---|
| `theme.accent.bg` | `--primary` |
| `theme.accent.fgOn` | `--primary-foreground` |
| `theme.surface.default` | `--background` |
| `theme.surface.subtle` | `--muted` |
| `theme.error.bg` | `--destructive` |
| `theme.error.fgOn` | `--destructive-foreground` |

Sterling's `fg`/`bg`/`fgOn` triplet vs shadcn's `<role>` + `<role>-foreground` pair — shadcn collapses "fg" (text-role color) into just using `primary` and expects `bg: primary; color: primary-foreground`. Sterling keeps the triplet because text-accent (link color) and accent-fill (button color) legitimately diverge in dark mode.

### Sterling → Web (DOM / CSS)

```ts
// At <ThemeProvider theme={theme}> mount time, emit CSS vars on the host element:
function applyThemeToCSS(theme: Theme, root: HTMLElement) {
  for (const [path, value] of flattenTheme(theme)) {
    root.style.setProperty(`--${path.join("-")}`, value)
  }
}
// theme.accent.hover.bg → --accent-hover-bg: #0969da
```

Sterling shape → CSS custom properties → consumed by components via `var(--accent-bg)`. No CSS-in-JS required; stock browser behavior.

### Sterling → React Native (structured JS, no CSS)

React Native has no CSS; it consumes JS objects directly. **Sterling's structured shape is the native form for RN.** No translation step:

```tsx
// react-native component using Sterling
import { useTheme } from "@silvery/ag-rn"  // hypothetical RN reconciler

function AccentButton({ children, onPress }) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.accent.active.bg : theme.accent.bg,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 6,
      })}
    >
      <Text style={{ color: theme.accent.fgOn, fontWeight: "600" }}>{children}</Text>
    </Pressable>
  )
}
```

Compare to RN's existing design-system prior art:

| RN design system | Shape | Example |
|---|---|---|
| **Tamagui** | `$tokenName` string syntax, resolved at compile | `<Button theme="accent" />` |
| **Gluestack** | Nested JS tokens, scale-based (`colors.primary.500`) | `<Button action="primary" />` |
| **NativeBase** | Nested JS tokens, scale-based (`colors.primary.600`) | `<Button colorScheme="primary">` |
| **Dripsy** | Flat JS keys with Theme UI conventions | `sx={{ bg: "primary" }}` |
| **React Native Paper** | Material 3 tokens (`colors.primary`, `colors.onPrimary`) | `<Button mode="contained">` |
| **Sterling** (proposed) | **Nested JS tokens, role-structured** (`accent.bg`, `accent.fg`, `accent.hover.bg`) | `<Button color="$accent">` |

Sterling lands between Gluestack/NativeBase (scale-based, more granular) and Paper (Material 3, flatter). The role-structured shape is closer to Material's actual convention but with explicit state nesting. No one in RN ships this exact shape today — Sterling is novel in combining role + pair + state + emphasis as nested objects.

### Canvas

Canvas renderers read Sterling directly (same as terminal + RN):

```ts
ctx.fillStyle = theme.accent.bg
ctx.fillRect(x, y, w, h)
ctx.fillStyle = theme.accent.fgOn
ctx.fillText(label, x + 8, y + 16)
```

No intermediate step. This is the cleanest target — Sterling shape = the bytes the renderer consumes.

### Summary

| Runtime | Consumption |
|---|---|
| Terminal | Structured JS → tier-quantized ANSI at output phase |
| Canvas | Structured JS → direct fillStyle |
| React Native | Structured JS → direct StyleSheet values |
| DOM / Web | Structured JS → flattened to CSS custom properties at `<ThemeProvider>` root |
| Figma (future) | Structured JS ↔ W3C Design Tokens JSON (bidirectional) |

**CSS is the only target that requires a flatten step.** Everything else is native. That's why Sterling's structured form is the right default for silvery's multi-target story — the lowest-common-denominator shape isn't CSS's flat strings, it's JS objects.

## Appendix E — history

- **2026-04 early** — `terminal-color-strategy.md` (original, archived): Polaris-strict vocabulary (`critical`/`caution`/`subdued`). Rejected.
- **2026-04 mid** — `theme-system-v2-plan.md` (shipped, archived): pivoted to "Primer-style" grammar keeping `$error`/`$warning`/`$success`/`$info`. 9 beads closed under `km-silvery.theme-system-v2` by 2026-04-18.
- **2026-04-19 morning** — `theme-v4-multi-target-plan.md` (archived): added multi-target Phase 1-6.
- **2026-04-19 afternoon** — reframed the API: theme-as-value, design systems as packages, ThemeProvider as primary primitive, **Sterling** as the canonical name. Supersedes v4 Phase 3.
- **2026-04-19 consolidation** — this doc. Single source; older plans archived.

## Appendix F — brand discipline

`brand` is **a theme input, not a public semantic sibling of `accent`**. Apps override `brand` when constructing a Theme; they consume `accent` in components.

```ts
// At theme construction:
const theme = design.deriveFromSchemeWithBrand(scheme, { brand: "#FF6A00" })

// In components:
<Box bg="$accent.bg">   // ← components read accent, not brand
```

**Why**: if `brand` is exposed as a public role alongside `accent`, apps will misuse it as "the nicer blue/purple" — a second accent. Within months a codebase ends up with `<Button color="$accent">` and `<Button color="$brand">` used interchangeably, which is exactly the semantic drift Sterling exists to prevent.

**The rule**:
- Components: **consume `accent`**. Never reference `brand`.
- Theme construction: **brand IS the input** — derives `accent` by default, may also derive categorical highlights, brand surfaces, etc.
- Marketing / splash / onboarding surfaces: OK to reference `brand` directly — these are one-off theming contexts, not the app's default UI

`brand` is closer in spirit to `--hue-seed` in Material-3 than to `--primary` in shadcn.

## Appendix G — known failure modes (watch for these)

Three places Sterling is most likely to crack. These came out of Pro-review 2026-04-19; track over time:

1. **`error` becomes a trash bucket for all red UI** — destructive buttons, security notices, validation, account-risk all using `error`. Fix: `destructive` intent at the component layer (see §1.4).
2. **`accent` becomes a trash bucket for all blue UI** — brand, links, selected nav, info banners, neutral positive notices, focus-adjacent. Fix: `info` as a distinct role (default-aliased to `accent`, but semantically separate — see §1.1).
3. **One `<Alert>` to rule them all** — apps try to push "info callout" and "catastrophic error" through the same component with just a `tone` prop. Component ends up compromised for both. Fix: app-level discipline — pick the right component (Toast / Banner / Dialog / Alert) for the urgency level. Sterling deliberately provides no urgency axis; use component + position + content to convey escalation naturally.

Silvery will ship with `destructive` intent + `info` role. Apps that ignore these will feel the first two cracks within a year. The third is an app-architecture concern, not a token-design concern.

## Appendix H — open questions

1. **Structured vs flat tokens at runtime** — Phase 2 lands the structured shape (`theme.error.fg`). Public CSS export auto-flattens. Confirm the structured shape is workable in hot paths.
2. **Cross-design-system components** (silvery UI inside a `@silvery/design-material` ThemeProvider): fail-fast, fall back, or adapt? Current inclination: fail-fast with a clear error — mixing vocabularies is a design smell.
3. **Hot-swap performance**: every Theme swap invalidates every styled cell. Is memoization at the token level enough, or do we need subtree-level Theme caching?
4. **Scheme catalog inclusion policy** — 84 today, cap? WCAG is the current filter.
5. **Priority / importance axis naming** — which word? Scope of components that need it? Whether it's a per-component prop or part of a higher-level toast/alert context.
6. **Surface hierarchy for web/native** — `default` / `subtle` / `raised` / `overlay` is Sterling's v1. Material's `surfaceContainer*` ramp has 5 levels; do we need more before web lands, or refine on demand?

---

# Related docs

- [silvery-positioning-brief.md](../../../../docs/silvery-positioning-brief.md) — why silvery is multi-target
- [color-inherit-plan.md](color-inherit-plan.md) — `color="inherit"` / `currentColor` cascade primitive (sub-plan)
- [backdrop-fade-plan.md](backdrop-fade-plan.md) — Backdrop render-time cell transform (sub-plan; Phase 6 shipped)
- Public: [vendor/silvery/docs/guide/styling.md](../../../vendor/silvery/docs/guide/styling.md) — user-facing styling guide
- Public: [vendor/silvery/docs/guide/token-taxonomy.md](../../../vendor/silvery/docs/guide/token-taxonomy.md)
- Public: [vendor/silvery/docs/guide/color-schemes.md](../../../vendor/silvery/docs/guide/color-schemes.md)

Archived (history only, do not link from public docs):

- `archive/theme/terminal-color-strategy.md`
- `archive/theme/theme-system-v2-plan.md`
- `archive/theme/theme-v4-multi-target-plan.md`
