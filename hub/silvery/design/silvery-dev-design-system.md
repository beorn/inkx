# silvery.dev Design System — Locked Decisions

Session 2026-04-17. Captured from an iterative review using Anthropic's Claude Design, translated here as the canonical spec for silvery.dev's VitePress implementation and eventually `@silvery/design/bindings/web`.

**Source of truth going forward is this doc + the VitePress codebase, NOT Claude Design.** Claude Design was the exploration tool; implementation lives in our repo where CSS variables drive real dependency propagation.

---

## 1. Brand

### 1.1 Wordmark

- Name: `silvery`
- **Logo lockup usage**: always lowercase — `silvery`. The stylized brand mark.
- **Everywhere else** (headlines, prose, docs, meta, sentences): sentence case — `Silvery`. The readable product name.
- Precedent: airbnb, stripe, figma, notion — lowercase logo, capitalized in prose.

### 1.2 Icon

- Glyph: `>_` (terminal prompt with cursor underscore)
- Container: rounded square (radius ~20% of side)
- Interior padding: consistent — do NOT nudge `>_` to align with external elements
- `>_` strokes: ~18-22% of container side (chunky enough to hold chrome gradient without losing silhouette)

### 1.3 Lockup geometry (icon + wordmark)

- Reference proportion: the NAV·32PX variant (what felt balanced during review)
- Wordmark font: **Rubik Bold 700**
- Wordmark fill: solid silver (no per-letter gradient)
- Vertical alignment: wordmark baseline ≈ bottom of `>` and `_` inside the icon (approximate — "close enough" is final; see 1.6)
- Tracking: tight, roughly `-0.03em`
- Wordmark x-height ≈ 50-58% of icon height (approximate — tuned by eye)

### 1.4 Sizes

| Size | Icon | Use |
|---|---|---|
| **HERO** | 72px | Marketing hero, top of landing page |
| **NAV** | 32px | Header nav, breadcrumbs |
| **APP ICON** | 68px | Favicon, social avatar, app icon — icon only, no wordmark |

### 1.5 Chrome gleam

- Unified diagonal chrome sweep, ~30-45° from upper-left to lower-right
- Applied to silver surfaces ONLY: wordmark fill + any chrome-bezel element (terminal frame in hero)
- NOT applied to: typography body, CTAs, feature cards, terminal interior, anything non-silver
- Animation: single page-wide sweep, ~1.5s duration, fires on page load and every ~25s of idle
- Timing: elements further right in the viewport light up later — reads as one directional light source moving across the scene

### 1.6 Known imperfection (accepted)

The wordmark baseline doesn't perfectly align with the `_` underscore inside the icon. This is a real geometric constraint: moving the `_` breaks the icon's internal padding; making `>_` taller breaks the icon's proportions; shrinking the wordmark enough to align breaks its typographic proportions. **Close is final.**

---

## 2. Typography

### 2.1 Three-family system

| Role | Font | Source |
|---|---|---|
| **Brand voice** (wordmark, display, headings) | **Rubik** | Google Fonts |
| **Reading** (body, meta, UI labels) | **Inter Tight** | Google Fonts |
| **Code + tagline + UI chrome** | **JetBrains Mono** | Google Fonts |

Load via `@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');` in the VitePress theme head.

### 2.2 Token scale

| Token | Font | Weight | Size | Tracking | Line-height |
|---|---|---|---|---|---|
| `HERO-LG` | Rubik | 700 | 72px (display) | -0.03em | 1.1 |
| `HERO-TEXT` | Rubik | 500 | clamp(28px, 4vw, 44px) | -0.015em | 1.2 |
| `TAGLINE` | JetBrains Mono | 400 | 15px | 0 | 1.5 |
| `H1` | Rubik | 500 | 36px | -0.02em | 1.2 |
| `H2` | Rubik | 500 | 28px | -0.015em | 1.3 |
| `H3` | Rubik | 400 | 22px | -0.01em | 1.4 |
| `H4` | Rubik | 400 | 18px | 0 | 1.4 |
| `Body` | Inter Tight | 400 | 16px | 0 | 1.6 |
| `Meta` | Inter Tight | 400 | 14px | 0 | 1.5 |
| `Code inline` | JetBrains Mono | 400 | 0.9em (relative) | 0 | inherit |
| `Code block` | JetBrains Mono | 400 | 14px | 0 | 1.5 |

### 2.3 Rationale

- Rubik's slightly rounded letterforms pair with the `>_` icon's rounded strokes — "drawn by the same hand"
- Inter Tight for reading — optimized neutral sans, doesn't compete with the brand voice
- JetBrains Mono for code and the tagline — developer-recognizable, reinforces silvery's terminal identity

---

## 3. Color

### 3.1 Brand palette

```
--color-silver        #c0c0c0   (bright silver — dark mode wordmark)
--color-silver-dark   #6a7080   (darker silver — light mode wordmark)
--color-charcoal      #2d2d2d   (deep charcoal — icon interior)
--color-accent        #5a6a85   (cold silver-blue — primary CTA, link hover)
--color-ts-blue       #3178c6   (TypeScript blue — reserved for TS-specific refs)
```

### 3.2 Semantic (terminal-metallurgic-tinted, not generic SaaS)

```
--color-success       #9fb8a3   (aged mint-silver, verdigris feel)
--color-warning       #c79a58   (muted brass — oxidized silver tone)
--color-danger        #b4614a   (rust-red with brown undertone — not fire-engine)
--color-info          #7a9bc0   (cold silver-blue, slightly darker than --color-accent)
```

### 3.3 Surfaces + text

```
Light mode
--bg-default     #fafafa   (near-white off-white)
--bg-surface       #f0f0ef   (subtle card background)
--fg-default          #1a1a1a
--fg-muted            #6a6a6a

Dark mode
--bg-default     #0d1117   (GitHub-dark territory — not pure black)
--bg-surface       #161b22
--fg-default          #e6e6e6
--fg-muted            #9a9a9a
```

### 3.4 Rejected

- VitePress default indigo-violet accent (too SaaS-generic)
- Vercel's crisp black + one gradient (too Vercel)
- Apple-ish cool neutrals (too Apple)
- AI-startup purple
- Tsdown's warm gold/orange (too casual)

---

## 4. Spacing

Scale: `4, 8, 12, 16, 24, 32, 48, 64, 96, 128` (px). Use `var(--space-N)` pattern.

### 4.1 Corner radii

```
--radius-sm   4px    (badges, callout chips)
--radius-md   8px    (cards, buttons)
--radius-lg   12px   (terminal window, modals)
--radius-pill 999px  (pill CTAs)
```

### 4.2 Elevation / Depth

Minimal shadow use. Prefer 1px hairline borders over shadows. Where depth is needed:

```
--shadow-subtle   0 1px 2px rgba(0,0,0,0.04)   (card lift on hover only)
```

No drop shadows on: feature cards at rest, callouts, hero elements.

---

## 5. Hero

### 5.1 Layout

- Full viewport width, auto height
- Split horizontally: **left 40%** = typography block, **right 60%** = silvery terminal
- Vertical alignment: typography and terminal share a vertical center
- Gutter between halves: `var(--space-24)` minimum — no overlap
- Full-width background: frozen chrome gleam band at 5% opacity diagonal

### 5.2 Left column (typography)

```
"Silvery"                          ← HERO-LG (capital S — sentence case)
"React for modern terminal apps."  ← HERO-TEXT
"Powerful apps. Polished UIs.
 Proudly terminal.|"               ← TAGLINE with blinking cursor
                                     at END of LAST line only

[ Get started ]  [The Silvery Way]  [GitHub]
(pill primary)     (ghost)           (ghost w/ icon if desired)
```

Get started: text-only, no icon. Rounded pill, silver-blue fill.
The Silvery Way: ghost (transparent bg, muted border).
GitHub: ghost, may include GitHub logo svg (real brand mark is OK).

### 5.3 Right column (silvery terminal) — macOS Terminal.app fidelity

- **Chrome bezel**: ~3-4px uniform border on all 4 sides, chrome gradient with the unified gleam sweep
- **Title bar**: ~28-32px height, slightly lighter than interior, thin `var(--fg-muted)` separator below
  - macOS traffic lights left-aligned: red `#FF5F57`, yellow `#FEBC2E`, green `#28C840`, ~12px each, 8px gap, 12px left inset
  - Title text: `silvery-agent — ~/app` in JetBrains Mono, faint muted, left-aligned immediately after the green traffic light (~8px right of it)
- **Interior**: dark background (stays dark even in light-mode site — terminals are dark)
- **Content** (ANSI fidelity — NO gradients, shadows, rounded highlights, or web styles inside):
  ```
  > build me a landing page for silvery
  ✓ reading docs/index.md
  ✓ drafting hero copy
  ✓ generating feature card grid
  ⏳ rendering typography tokens
  ⏳ applying chrome bezel gleam
  → compiled 12 components in 340ms
  → dev server ready · http://localhost:3000
  ❯
  ```
- All text: **JetBrains Mono**, one size (14px), line-height **1.1-1.2**
- Colors: prompts `>`/`❯` muted; `✓` solid green (semantic success); `⏳`/`→` default fg; command and output default fg
- **No cursor inside the terminal** (the tagline's blinking cursor is the only one on the page)
- Left padding: 12-16px
- No row backgrounds, no pill badges, no rounded corners on interior elements, no glows

### 5.4 Strictly rejected in hero

- Chemistry-themed `[ag]`, `[ts]` tiles (tried — viewers don't decode it)
- Arrows between elements in the anchor
- Cartoon illustrations of the mascot
- Gradient-heavy painterly hero art
- Linear/Vercel-style gradient blobs
- Any decoration beyond: wordmark + tagline + CTAs on left, one terminal on right, subtle gleam band in back

---

## 6. Components

### 6.1 Feature Card (landing page grid)

```
Bold Feature Title             ← Rubik Medium
Short 2-3 line description     ← Inter Tight body
where specific facts live
inline in the prose.
Benchmarks >                   ← JetBrains Mono, muted,
                                 primary on hover
```

- Title is the hero of each card — **NOT** numbers, **NOT** pull-quote metrics
- `>` glyph (not `→`) for the arrow link — echoes the silvery `>_` icon
- Hover: 1px border shift from muted to primary, subtle chrome gleam sweep
- No drop shadows, no Swiss 01/02/03 numbering, no big-metric promotion

### 6.2 Ecosystem Cards ("Built on silvery")

- 4 cards at launch: **Flexily** / **Termless** / **terminfo.dev** / **Loggily**
- Each card: real logo (fetch from each site) + wordmark + 1-line plain-English caption + `site.dev >` link in JetBrains Mono
- No "SIBLING PROJECT" labels
- No sponsor/social-proof row

### 6.3 Callouts (standard++)

Standard types — conventional labels, conventional glyphs, silvery-tinted colors:

| Type | Glyph | Color family |
|---|---|---|
| info | ℹ | info (cold silver-blue) |
| tip | 💡 | tip (aged mint) |
| note | (none) | neutral muted |
| success | ✓ | success (mint-silver) |
| warning | ⚠ | warning (brass) |
| danger | ⛔ | danger (rust) |
| deprecated | (strikethrough) | faded brown-gray |

Style: filled tinted block (`rgba(accent, 0.18-0.22)` dark / `0.08-0.12` light), small glyph top-left, UPPERCASE tracked type label in JetBrains Mono meta-size, then body content. **NO left stripe, NO outer border.** Just the filled block.

Silvery-specific editorial additions, used sparingly (1-2 per docs page):

| Type | Glyph | Color family | Meaning |
|---|---|---|---|
| **shiny** | ✨ | success (green) | "this is the silvery way" — idiomatic, recommended |
| **tarnished** | 💩 | danger (rust/red) | "this drifts from the silvery way" — antipattern, do not do |

Reusing the success/danger color families means non-English readers still get "good/bad" from color alone; the English words + emojis add silvery's editorial voice on top.

### 6.4 Buttons

| Variant | Shape | Style | Use |
|---|---|---|---|
| Primary | Pill | Silver-blue fill, white text | Hero CTA, form submit |
| Secondary | Pill | Transparent bg, muted border | Secondary action |
| Ghost | Pill | Transparent, no border, text-only | Tertiary, nav |

- Text-only CTAs by default (no embedded icons on "Get started" and similar)
- Icons allowed only for real brand marks (GitHub logo) or essential UI (search)
- Hover: subtle chrome gleam sweep + border shift, no transform, no shadow

---

## 7. Voice

- **Precise, understated, developer-respecting**. Confident without hype.
- **Short sentences.** Em-dashes welcome.
- **Say**: "polished", "composable", "terminal-native", "Proudly terminal", "React for modern terminal apps"
- **Don't say**: "unlock", "revolutionary", "magical", "delightful" (over-used), "game-changing"
- **Tone reference**: iA Writer company voice — literate, restrained, respectful of the reader

---

## 8. Animation budget

**Exactly two animations on the whole site:**

1. **Unified diagonal chrome gleam sweep** across silver surfaces (wordmark + terminal bezel) — 1.5s, fires on page load and every 25s of idle
2. **Blinking cursor** at the end of the hero tagline — 1Hz blink, block character

That's it. Everything else is static.

Rejected: shimmer loops, parallax, hover transforms that scale/translate elements, fade-in-on-scroll, animated backgrounds, animated gradients, progress bars filling automatically.

---

## 9. Implementation order

Next steps for silvery.dev (in order):

### Phase 1 — tokens + fonts
1. Add `@import` for Rubik + Inter Tight + JetBrains Mono to VitePress theme's `custom.css`
2. Declare all tokens as CSS variables in `:root` and `.dark` (both modes)
3. Override VitePress default brand variables (`--vp-c-brand-*`) to use silvery tokens

### Phase 2 — logo
1. Design the `>_` icon as an SVG with two layers: container (silver, has chrome gradient) and glyph (cursor underscore)
2. Commit lowercase "silvery" wordmark in Rubik Bold at 3 target sizes
3. Replace `docs/public/logo.svg` with the new mark
4. Re-generate og-image with the new lockup

### Phase 3 — hero
1. Custom VitePress hero component that replaces the default `VPHome` hero
2. Left column typography block; right column silvery terminal component
3. Terminal component: chrome bezel + macOS title bar + ANSI-fidelity interior with 7-9 lines of hardcoded coding-agent content
4. Blinking cursor at end of tagline (CSS `animation: blink 1s steps(1) infinite`)

### Phase 4 — chrome gleam animation
1. Page-scoped diagonal gleam overlay that sweeps across viewport, masked to silver-surface elements via `background-clip` / `mix-blend-mode`
2. CSS keyframes, runs on page load + every 25s

### Phase 5 — components
1. Feature card custom theme — title in Rubik Medium, body in Inter Tight, `>` arrow link in JetBrains Mono
2. Ecosystem cards section — new component with real logos + captions
3. Callout plugin — Vitepress custom container for `info` / `tip` / `note` / `success` / `warning` / `danger` / `deprecated` / `shiny` / `tarnished`

### Phase 6 — propagation
- Update all docs pages to use `Silvery` (capital S) in prose; reserve `silvery` for logo-adjacent contexts
- Audit all existing docs for adherence to voice guidelines
- Replace any `→` arrow link with `>` in JetBrains Mono where appropriate

### Phase 7 — eventual package extraction (`@silvery/design`)
- When the silvery.dev theme is stable, extract tokens + components into `@silvery/design`
- Bind package to web (`@silvery/design/bindings/web`), later to terminal + canvas
- This is the full scope of the `km-silvery.design-system` bead

---

## 10. What Claude Design was good for

- Rapid exploration of color palettes, type scales, hero compositions
- Visualizing "would a mono wordmark work?" without building it
- Stress-testing ideas quickly (ag/ts chemistry — tried, rejected)
- Producing enough visual output to trigger taste reactions

## 11. What Claude Design was NOT good for

- Dependency graph: token changes don't cascade to dependent panels
- Self-report accuracy: frequently claimed completion of items it didn't actually render
- Maintaining locked decisions: buttons, padding, font sizes drift between cycles without explicit re-pinning
- Being the canonical source of truth

**Conclusion**: the exploration delivered. The implementation moves home.

---

## Session log

This doc was extracted from a ~3-hour iterative session on 2026-04-17. Key decisions were made in real time and the decision path (including reversals) is preserved above. The final state represents the user's approved direction, not every intermediate experiment.

Related bead: `km-silvery.design-system` — `@silvery/design` package architecture.
