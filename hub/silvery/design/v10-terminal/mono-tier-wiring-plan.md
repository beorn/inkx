# Mono-tier wiring — implementation plan

**Bead:** `km-silvery.mono-tier-wiring`

## Goal

At `colorLevel === "none"`, the silvery output phase emits SGR attrs (bold, dim,
italic, underline, inverse, strikethrough) per-cell based on the token that was
painting it. Colors are stripped; attrs communicate hierarchy.

## Current state (diagnosis)

The mono-attrs infrastructure is complete in `@silvery/ansi/theme/monochrome.ts`:

- `DEFAULT_MONO_ATTRS` — canonical per-token attrs mapping
- `deriveMonochromeTheme(theme)` — reserved-for-future per-theme override
- `monoAttrsFor(theme, token)` — resolve attrs for a specific token

**But nothing in the pipeline consumes it.** At mono tier today:

1. `parseColor("$primary")` (in `render-helpers.ts`) resolves the token to hex
   and returns an RGB value, same as at truecolor tier.
2. `getTextStyle(props)` builds a `Style` object with fg = RGB, attrs =
   whatever the user passed explicitly (bold/dim/italic/etc.).
3. The output phase emits fg SGR codes unconditionally — `caps.colorLevel` is
   only consulted for underline-related caps, never for fg/bg.

So a mono-tier terminal receives colored output **anyway** (if the term is lying
about its level) OR the colors are silently dropped by the terminal and the app
loses all hierarchy.

## Approach — Option C: render-time attrs injection

Picked C over A (per-cell token threading) and B (post-hoc hex → token
inference) because:

- **Minimal pipeline change.** The 5-phase pipeline already handles `attrs` per
  cell. We just need to inject mono attrs at the moment a `$token` resolves.
- **No cell-level token field.** Adding a `sourceToken` field to `Cell` costs
  memory everywhere and only matters at mono tier.
- **Fingerprint-compatible.** At mono tier, `parseColor("$primary")` returns
  `null` (strip color). The `Style.attrs` carries the hierarchy. Existing
  `styleEquals` / `colorEquals` work unchanged.
- **Colors strictly stripped.** The output phase already handles `fg === null`
  → SGR 39. No new output-phase branching needed.

## Implementation steps

### 1. Theme state carries colorLevel

Add `_activeColorLevel` module state to `@silvery/theme/state`:

```ts
let _activeColorLevel: "none" | "basic" | "256" | "truecolor" = "truecolor"
export function setActiveColorLevel(level: ...): void
export function getActiveColorLevel(): ...
```

The runtime (`createPipeline` in `measurer.ts`) sets this alongside the output
caps, so mono-tier terminals flip the switch before `render()` runs.

### 2. parseColor returns null at mono tier for $tokens

In `render-helpers.ts:parseColor()`, when the input starts with `$` AND
`getActiveColorLevel() === "none"`, return `null` instead of resolving to hex.
Non-token hex still passes through (returns RGB as before, but the output phase
never emits it once we gate the output phase on colorLevel).

### 3. Gate output-phase fg/bg on colorLevel

In `output-phase.ts`, at cell paint time (`styleTransition` + `styleToAnsi`),
when `ctx.caps.colorLevel === "none"`, skip fg/bg SGR codes entirely. The
`Style.fg` / `Style.bg` may still contain RGB values from non-token hex sources
— we ignore them at mono tier. This is the "strip color" half of the spec.

### 4. getTextStyle injects mono attrs from $token color props

In `render-helpers.ts:getTextStyle()`, when `getActiveColorLevel() === "none"`
AND `props.color` is a `$token`, look up `monoAttrsFor(theme, token)` and OR
those flags into the returned `Style.attrs`. Same for `backgroundColor` (most bg
tokens have `[]` attrs, so this is effectively a no-op for them, but the
mechanism is uniform).

`$primary` → `["bold"]` flag → `attrs.bold = true`.
`$muted` → `["dim"]` → `attrs.dim = true`.
`$error` → `["bold", "inverse"]` → `attrs.bold = true, attrs.inverse = true`.
`$link` → `["underline"]` → `attrs.underline = true`.

Explicit user attrs always OR-in (`<Text bold color="$muted">` → bold + dim).

### 5. Tests

New test file: `vendor/silvery/tests/features/mono-tier-attrs.test.tsx`

Test cases:
- `$primary` at colorLevel="none" → cell emits bold, no color
- `$muted` at colorLevel="none" → cell emits dim
- `$error` at colorLevel="none" → cell emits bold + inverse
- `$link` at colorLevel="none" → cell emits underline
- Non-token hex `"#FF0000"` at mono → emits no color, no attrs (pass-through)
- Realistic 50+ node fixture at SILVERY_STRICT=2 — regression safety

### 6. Regression — existing tests at truecolor / 256 / ansi16 stay green

Full suite: `bun run test:vendor`.

## Not in scope (de-escalated)

- Box border mono-attrs (`focusborder: ["bold"]`). Borders don't currently thread
  their color into an `attrs` field. Deferred — km doesn't rely on this and
  the primer tokens don't meaningfully differ in mono without attrs.
- Custom per-theme mono-attr overrides. `deriveMonochromeTheme` is passed the
  theme but currently ignores it; that's fine for v1.
- `backdrop-fade` mono branch already exists and is correct.

## Risk

The module-level `_activeColorLevel` mirrors the existing `_activeTheme`
pattern — both are global state that the runtime flips once per app. Tests that
rely on the default (truecolor) are unaffected. Tests that want to exercise
mono tier set it explicitly.
