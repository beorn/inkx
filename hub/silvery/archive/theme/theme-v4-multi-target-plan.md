# Theme v4 — multi-target, kebab-only, @silvery/theme rescoped

**Context**: After v3 plumbing landed (kebab state-variants, one ThemeProvider, AgNode theme cascade, WCAG gate, deriveFields helper), the theme system still has legacy debris: camelCase Theme fields, a half-shim `@silvery/theme` package, ANSI-slot name strings leaking into Theme objects. The user now wants the theme system to work across **multiple render targets** (terminal, canvas, DOM) — color schemes should be a valid *inspiration source* for the web too, not terminal-only.

## Guiding principle (new)

**Theme objects are pure semantic + hex.** No ANSI-slot name strings (`"yellow"`, `"blueBright"`). No camelCase accidents (`primaryfg`, `mutedbg`). Just kebab semantic tokens with hex values. Terminal output quantizes hex → ANSI at paint time (already implemented in `@silvery/ansi/style`); web/canvas consumes hex directly.

This unlocks:

- **Web apps can use silvery's 84 schemes as a color library** — `import { catppuccinMocha } from "@silvery/theme/schemes"` + `deriveTheme(catppuccinMocha)` → CSS-compatible hex map.
- **Canvas renderers** use the same Theme shape, no tier-specific branches.
- **Theme authoring** shrinks: one codepath for all targets.

## Phases

### Phase 1 — Kill ANSI-slot name strings in Theme objects (preparatory)

Today `deriveAnsi16Theme(palette)` returns strings like `{primary: "yellow", accent: "blueBright"}`. These are only valid in terminal contexts with truecolor-disabled output. On web/canvas they'd render as CSS colors (maybe?), with wrong appearance for bright variants.

**Fix**: deriveAnsi16Theme returns HEX strings (the scheme's specific yellow/blue/etc.) exactly like deriveTruecolorTheme. The "ANSI16 tier" behavior lives ENTIRELY in the output phase — quantize hex to nearest ANSI slot at paint time (already works in the pipeline for the 256 tier; extend to ansi16).

Scope:
- `vendor/silvery/packages/ansi/src/theme/derive.ts` — `deriveAnsi16Theme` returns hex like deriveTruecolorTheme
- `vendor/silvery/packages/ansi/src/theme/default-schemes.ts` — hard-coded ANSI16 themes become hex
- `vendor/silvery/packages/theme/src/generate.ts` — algorithmic generator produces hex
- `vendor/silvery/packages/theme/src/schemes/index.ts` — static ANSI16 themes (if any) become hex
- Tests that assert against slot-name strings (`theme.primary === "yellow"`) — update to hex

Acceptance:
- `rg "theme\\.\\w+\\s*===?\\s*\"(red|green|blue|yellow|magenta|cyan|black|white)(Bright)?\"" vendor/silvery` → 0 hits
- Existing visual tests still pass (quantization at output produces correct ANSI16 rendering)
- Dark scheme: `deriveAnsi16Theme(nord).primary` is a `#...` hex, not `"yellow"`

**Uses `/refactor plan` approach.** Single session, single commit per logical change, verify with vitest.

### Phase 2 — Polaris grammar + Material vocabulary (migration)

**Design decision (resolved 2026-04-19, refined same session):** silvery has web-ambitions, but "cross-platform consensus" doesn't equal "strict Polaris." Surveyed major systems:

- **"error" vs "critical"**: Material 3, Carbon, Tailwind, shadcn/ui, Radix, Chakra, Ant Design, Claude Design all use **error**. Polaris is the outlier.
- **Grammar** (`fg-*`/`bg-*`/`-hover`/`-active`): Polaris, Material, Tailwind, shadcn all agree.
- **Pair convention** (`bg-X` + `fg-on-X`): Material, Polaris, shadcn (as `-foreground`).
- **Interactive state matrix** (`bg-fill-<role>-hover/-active`): Polaris + Material.

**Target: Polaris grammar + Material/shadcn vocabulary.** Best ergonomics (familiar names) + best logic (composable grammar) + broadest ecosystem recognition.

**Target naming (refined):**

| Old | New |
|---|---|
| `primary` | `bg-fill-accent` (interactive) / `$brand` (identity) |
| `primaryfg` | `fg-on-accent` (per-role, not unified) |
| `muted` | `fg-muted` (KEEP — Material/shadcn/ecosystem use "muted") |
| `mutedbg` | `bg-surface-secondary` |
| `error` | `fg-error` / `bg-fill-error` (KEEP "error" — industry standard) |
| `errorfg` | `fg-on-error` |
| `warning` | `fg-warning` / `bg-fill-warning` (KEEP "warning") |
| `success` | `fg-success` / `bg-fill-success` |
| `info` | `fg-info` / `bg-fill-info` |
| `disabledfg` | `fg-disabled` |
| `inputborder` | `border-default` |
| `focusborder` | `border-focus` |
| `selectionbg` | `bg-selected` |
| `cursorbg` | `cursor-fill` |

**Full 24-state-variant matrix (expand from 8):**

Every interactive role gets `-hover` and `-active`:
- `bg-surface`, `bg-surface-hover`, `bg-surface-active`
- `bg-fill-accent/-hover/-active`
- `bg-fill-critical/-hover/-active`
- `bg-fill-caution/-hover/-active`
- `bg-fill-success/-hover/-active`
- `bg-fill-info/-hover/-active`
- `fg-link/-hover/-active`
- `fg-accent/-hover/-active`
- plus `$brand-hover/-active` (already have)

Derivation stays OKLCH `±0.04L` / `±0.08L` by default; individual schemes can override per-state if needed.

**PRIMER_ALIASES deletes entirely** — no compat bridge. Break-then-fix: tsc + tests guide consumers (~145 sites).

Scope: ~145 call sites (`theme.primaryfg`, `theme.mutedbg`, etc.) across apps/km-tui, @silvery/ag-react, @silvery/ag-term. Also Theme type definition, deriveFields, default-schemes, generate.ts, schemes/index.ts.

Acceptance:
- `rg "theme\\.(primaryfg|mutedbg|selectionbg|inputborder|focusborder|cursorbg|popoverbg|surfacebg|inversebg|disabledfg)\\b" apps packages vendor/silvery --glob '!**/dist/**'` → 0 hits
- `rg "PRIMER_ALIASES|LEGACY_ALIASES" vendor/silvery/packages/ansi/src/style/style.ts` → 0 hits (empty table deleted)
- All Theme fields use kebab-dash notation
- 84 schemes still pass WCAG catalog test
- km-tui visual tests still pass (cursor highlighting, selection tint)

**Uses `/refactor migrate` — batch-refactor is 90% mechanical.** One session, break-then-fix, tsc guides consumers.

### Phase 3 — Rescope `@silvery/theme` package (multi-target positioning)

Today `@silvery/theme` is mostly a re-export shim + scheme catalog + workbench CLI:
- deriveTheme, resolveThemeColor, hexToRgb, blend, brighten, ... — ALL re-exported from `@silvery/ansi` or `@silvery/color`
- builtinPalettes (84 schemes) — THIS is the real content
- theme CLI (list/preview/inspect) — workbench app
- React ThemeContext + useTheme — react integration

Issue: "@silvery/theme" sounds like "the theme system" but actually the math lives in `@silvery/color` and the derivation lives in `@silvery/ansi`. Confusing.

**Decision**: Rename + rescope `@silvery/theme` → `@silvery/schemes` (optional — could also keep the name with a cleaner charter). Core contents:
- `builtinPalettes` — 84 color schemes (the "inspiration library")
- scheme catalog types (ColorScheme, palette definitions)
- CLI for browsing (`bunx @silvery/schemes inspect <name>`)

MOVE out:
- React integration → `@silvery/ag-react` (already has ThemeProvider; ThemeContext + useTheme joins)
- Builder API (`createTheme`, `quickTheme`, `presetTheme`) → `@silvery/ansi` or `@silvery/theme` depending on whether it's "schema builder" or "derivation helper"
- auto-generate, generators — derivation utilities → `@silvery/ansi`
- detectTheme — already re-export, just drop the re-export

Keep the `@silvery/theme` barrel as a compat façade for ONE release (re-exports from new homes) then delete.

Acceptance:
- `@silvery/theme` package is ≤ 10 source files (catalog + CLI)
- `rg "re-exported from|re-export" vendor/silvery/packages/theme/src/*.ts --glob '!**/dist/**'` → 0 remaining re-exports
- No new circular deps
- Web consumers can `import { catppuccinMocha } from "@silvery/schemes"` and get a valid ColorScheme (hex-only)

**Uses `/refactor plan` — architectural, phased, needs careful file moves + import updates.**

### Phase 4 — km-tui `stripInlineColors` tidy-up

From the earlier colorOverride purge: `InlineRenderContext.stripInlineColors` boolean + passes to leaves. Works but adds a prop to every call site of inline text rendering. Could possibly be derived from context (e.g. when the row is the cursor row). Small.

Acceptance:
- grep `stripInlineColors` ≤ current count (baseline)
- Either eliminate the prop OR document the pattern in selection-style.ts

**Minor. Might be fine as-is. `/refactor plan` with a small scope.**

### Phase 5 — Typography variants: unregister API

Today `<ThemeProvider tokens={{ variants: { hero: {...} } }}>` merges extra variants on top. No way to REMOVE a built-in variant. Probably never needed in practice — keeping the 12 built-ins as fixed is fine. Decision: **SKIPPED** unless there's a real use case.

### Phase 6 — `<Backdrop>` standalone polish

Verify `<Backdrop>` works outside of `<ModalDialog>` (standalone overlay wrapper). Current state: reads ThemeProvider's rootBg via the AgNode walk in ag.ts, so should work. Add a test to lock in.

Acceptance:
- New test: `<Backdrop fade={0.6}><App /></Backdrop>` in isolation → fg+bg blend toward rootBg-derived neutral for the Backdrop's region
- Docs confirm standalone use pattern

**Minor. Single test + doc paragraph.**

## Execution order

1. **Phase 1** — Kill ANSI-slot strings in Theme first (preparatory for multi-target)
2. **Phase 2** — Kebab rename (now all fields are consistent, migration is easy)
3. **Phase 3** — @silvery/theme rescope (now that derivation is stable)
4. **Phase 4** — stripInlineColors (small, after Phase 2 stabilizes km-tui)
5. **Phase 6** — Backdrop test + doc (orthogonal; can ship anytime)
6. (Phase 5 skipped)

Multi-target validation runs at the end: a minimal web consumer imports catppuccin-mocha + deriveTheme and logs the Theme. Should be all hex, no ANSI names, no camelCase.

## Beads

Parent: `km-silvery.theme-v4` (P2)
Children:
- `km-silvery.theme-v4-ansi16-hex` (Phase 1)
- `km-silvery.theme-v4-kebab-rename` (Phase 2, migration)
- `km-silvery.theme-v4-schemes-rescope` (Phase 3)
- `km-silvery.theme-v4-stripInlineColors` (Phase 4)
- `km-silvery.theme-v4-backdrop-standalone` (Phase 6)

## Retrospective slot (fill at end)

- Lines touched: TBD
- Tests added: TBD
- API-breaking changes shipped: TBD
- Was it worth it: TBD

Written 2026-04-19. Revised when phases complete.
