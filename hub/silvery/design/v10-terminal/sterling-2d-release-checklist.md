# Sterling 2d — silvery 0.19.0 release checklist

**Status**: prep (2026-04-19). Execute when both `sterling-2c-km-migration` and `sterling-derivation-adaptive` + `sterling-prune-state-variants` have landed.

**Bead**: `km-silvery.sterling-2d-release`.

Goal: delete every legacy compat alias, ship silvery 0.19.0 with a clean Theme shape, publish CHANGELOG + migration notes. One atomic breaking release.

---

## Pre-flight (verify before starting)

- [ ] `sterling-2c-km-migration` closed — `rg 'theme\.(primaryfg|mutedbg|selectionbg|inputborder|focusborder|cursorbg|popoverbg|surfacebg|inversebg|disabledfg)\b' apps/km-tui/src/` → 0 hits
- [ ] `sterling-derivation-adaptive` closed — `theme.warning.active.bg` stays in yellow family (not `#FFFFFF`) on catppuccin-frappe
- [ ] `sterling-prune-state-variants` closed — `theme.error.hover` is `undefined` in TypeScript
- [ ] All 84 catalog schemes pass WCAG AA strict
- [ ] `bun run test:fast` green
- [ ] `bun run test:vendor` has no NEW failures beyond the pre-existing baseline
- [ ] km-tui storybook launches + scheme cycle works — no white-out

## Delete sweep

### A. @silvery/theme legacy Theme fields

- [ ] Remove from `vendor/silvery/packages/ansi/src/theme/types.ts` (legacy `Theme` type):
  - `primaryfg`, `mutedbg`, `selectionbg`, `inputborder`, `focusborder`, `cursorbg`, `popoverbg`, `surfacebg`, `inversebg`, `disabledfg`
  - `primary`, `muted`, `surface`, `popover`, `inverse`, `cursor`, `border`, `link`, `focus`, `brand` as single-hex fields (now live as structured Sterling roles)
- [ ] Remove `PRIMER_ALIASES` table entirely (`vendor/silvery/packages/ansi/src/style/style.ts`)
- [ ] Remove `LEGACY_ALIASES` table entirely
- [ ] Remove `augmentWithSterlingFlat()` — Sterling IS the Theme now, no augmentation needed

### B. @silvery/theme legacy derivation

- [ ] `vendor/silvery/packages/ansi/src/theme/derive.ts` — delete the legacy `deriveTheme` that produced camelCase Theme. Sterling's `deriveFromScheme` is canonical.
- [ ] `vendor/silvery/packages/ansi/src/theme/default-schemes.ts` — delete hardcoded legacy defaults. Sterling's `defaults()` replaces them.
- [ ] `vendor/silvery/packages/theme/src/generate.ts` — delete if it still exists post-Phase 3a
- [ ] `vendor/silvery/packages/theme/src/schemes/index.ts` — migrate any remaining augmentation-side exports

### C. Theme type surface

- [ ] `@silvery/theme`'s exported `Theme` type = Sterling's `Theme` (intersection of FlatTokens & Roles — no legacy fields)
- [ ] Legacy `ThemeProvider` prop type `theme: Theme` continues to work; just `Theme` is now Sterling-shaped
- [ ] TS surface diff should be: ~50 legacy keys removed, structured role objects unchanged, flat keys unchanged

### D. Consumer cleanup

- [ ] `vendor/silvery/packages/ag-react/src/ui/components/*` — should not reference any legacy token name after 2b migration; sweep to confirm
- [ ] `vendor/silvery/packages/ag-term/src/pipeline/*` — audit for any remaining legacy Theme field access
- [ ] `apps/km-tui/src/*` — sweep confirmed zero in 2c, re-verify
- [ ] Test fixtures — any hardcoded legacy Theme shape gets migrated

## Version + changelog

### package.json bumps

- [ ] `vendor/silvery/package.json` (root) 0.18.x → **0.19.0**
- [ ] Every `vendor/silvery/packages/*/package.json` — bump to 0.19.0 if they're versioned in sync (check `vendor/silvery/scripts/version-check.ts`)

### CHANGELOG entries

`vendor/silvery/CHANGELOG.md`:

```markdown
## 0.19.0 — Sterling

**BREAKING** — silvery's design system is now named Sterling (`@silvery/theme`
exports `sterling` alongside the existing runtime APIs). Legacy camelCase
Theme fields are removed; structured Sterling roles + flat tokens are the
only supported shape.

### Breaking changes

- `Theme` type shape changed. Legacy fields removed: `primaryfg`, `mutedbg`,
  `selectionbg`, `inputborder`, `focusborder`, `cursorbg`, `popoverbg`,
  `surfacebg`, `inversebg`, `disabledfg`, and single-hex `primary`/`muted`/
  `surface`/`popover`/`inverse`/`cursor`/`border`/`link`/`focus`/`brand`.
- `PRIMER_ALIASES` + `LEGACY_ALIASES` tables deleted. Old `$token` strings
  that relied on alias fallback no longer resolve.
- `fg.hover` / `fg.active` tokens removed for non-link roles (`error`,
  `warning`, `success`, `info`, `muted`). Only `accent` + `link` (and all
  `bg.*` roles) retain state variants.
- Derivation: state variants now use adaptive OKLCH L-shift (direction
  follows the token's own luminance, not `scheme.dark`). Previous naive
  ±0.04L / ±0.08L upward shift is gone.

### Migration

Token rename map (most common):

| Old | New |
|---|---|
| `theme.primaryfg` | `theme["fg-on-accent"]` |
| `theme.mutedbg` | `theme["bg-surface-subtle"]` |
| `theme.primary` (color) | `theme["fg-accent"]` |
| `theme.primary` (bg) | `theme["bg-accent"]` |
| `theme.focusborder` | `theme["border-focus"]` |
| `theme.inputborder` | `theme["border-default"]` |
| `$selection-bg` | `$bg-selected` |
| `$popover-bg` | `$bg-overlay` |
| `$focusborder` | `$border-focus` |

Full map: [design-system.md Appendix C](...).

### Added

- `sterling` design system exports: 84 schemes × OKLCH-preservative derivation
  + WCAG AA contrast guardrails + adaptive state-variant shifts
- `pickColorLevel(theme, level)` — pre-quantize Theme hex leaves to a color tier
- `run({ colorLevel })` — programmatic override for auto-detection
- `quantizeHex(hex, level)` — hex-in/hex-out primitive for preview surfaces
- Sterling Storybook at `bun run example:storybook` — 3-pane interactive explorer

### Deprecated

- `@silvery/theme` barrel — will rename to `@silvery/design` + `@silvery/schemes` in a future release (tracked as bead `km-silvery.design-package-rename`). This release keeps the barrel name to minimize churn.
```

## Publish

- [ ] `bun run fix` green
- [ ] `bun run test:ci` green (the comprehensive suite)
- [ ] Git tag `silvery-v0.19.0` on silvery main
- [ ] `bun run build` in each package under vendor/silvery/packages/
- [ ] `pnpm publish` from each package directory (NOT `npm publish` — per vendor/CLAUDE.md)
- [ ] GitHub release on `github.com/beorn/silvery` with CHANGELOG excerpt

## km bump

- [ ] `git submodule update --remote vendor/silvery` — picks up 0.19.0
- [ ] `bun run test:ci` on km — all green
- [ ] Commit `chore(silvery): bump — 0.19.0 Sterling breaking release` with pointer update

## Post-release

- [ ] Unblocks `design-package-rename` — starts @silvery/theme → @silvery/design + @silvery/schemes split
- [ ] Unblocks `sterling-public-docs` — update the 12 silvery.dev pages
- [ ] Unblocks `sterling-storybook-full` — extensions to the MVP
- [ ] Promote `hub/silvery/launch/sterling-introduction.md` → `vendor/silvery/docs/blog/sterling-introduction.md` as the launch-announcement post

## Verification (run after publish)

```bash
# Legacy gone
rg 'PRIMER_ALIASES|LEGACY_ALIASES' vendor/silvery/packages/ | wc -l  # → 0
rg 'primaryfg|mutedbg|selectionbg|inputborder|focusborder|cursorbg|popoverbg|surfacebg|inversebg|disabledfg' vendor/silvery/packages/ apps/ --glob '!*.md' | wc -l  # → 0 or only in legitimate places (tests that EXPECT the rename)
rg 'augmentWithSterlingFlat' vendor/silvery/packages/ | wc -l  # → 0

# Theme type has no legacy fields
cat vendor/silvery/packages/ansi/src/theme/types.ts | grep -E '(primaryfg|mutedbg|selectionbg)'  # → empty

# New state-variant grammar enforced
bun -e "
import { sterling } from '@silvery/theme'
import { nord } from '@silvery/theme/schemes'
const t = sterling.deriveFromScheme(nord)
if (t.error?.hover) process.exit(1)  // should be undefined
if (!t.accent?.hover?.fg) process.exit(1)  // should exist (link-like)
console.log('OK')
"

# Version published
npm view @silvery/theme version  # → 0.19.0
npm view silvery version  # → 0.19.0
```

## Risk register

| Risk | Mitigation |
|---|---|
| Consumer outside km (if any exist) breaks on upgrade | Version-pin warning in CHANGELOG; keep a migration script in `vendor/silvery/scripts/migrate-to-sterling.ts` if there's a publicly-exposed consumer |
| `augmentWithSterlingFlat` removal breaks a corner of the pipeline that still depended on the augmented legacy Theme | tsc catches; 2b should have migrated all @silvery/ui consumers; verify with full test:vendor |
| tmux / iTerm2 users miss the Kitty graphics backdrop fallback | Not a 0.19.0 concern — already shipped as capability-gated |
| npm publish fails on provenance or token | See vendor/CLAUDE.md §npm; use `pnpm publish` not `npm publish`; OIDC provenance auto-configured |

---

## Summary

One commit, one tag, one release. Deletes ~300 LOC of compat shims. Simplifies the Theme type surface by ~50 legacy fields. Ships the complete Sterling story.

Do it when 2c + derivation-adaptive + prune-state-variants are all closed with green acceptance commands.
