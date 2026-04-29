---
id: "@km/all/sterling"
aliases:
  - km-all.sterling
  - km-all-sterling
created_by: claude:5e447b66
created_at: 2026-04-24T23:12:15Z
---

# [ ] Sterling design system — tracking epic @km/all #task #P1

blocks:: [[@km/all]]

Consolidates all Sterling-related work across the codebase: design system data layer, derivation, UI consumer migration, package releases (0.18.x → 0.19.0 breaking → 0.20.0), public docs, storybook, adaptive variants (cursor, borders, surface), inline hex quantize, design-material reference impl, and remaining selection/cursor/inverse/link tokens that haven't been ported from the legacy theme yet.

## Why a tracking bead

Sterling work has accumulated in 13+ beads under `km-silvery.theme-v4` (epic) plus standalone `km-silvery.sterling-*` beads. Multiple sessions touch this work. A single `km-all.*` parent makes the surface visible cross-package (silvery + @km/tui + silvercode + future apps).

## Current state (2026-04-24)

**Closed**:
- sterling-2a-data-layer (Theme type + derivation + guardrails)
- sterling-2b-ui-components (@silvery/ui consumes new tokens)
- sterling-2c-@km/_orphan/migration (@km/tui ~145 call sites migrated)
- sterling-consumer-migration (@km/tui + ag-react renamed $primary/$muted to flat)
- sterling-derivation-adaptive (OKLCH state-variant derivation)
- sterling-preflight (D1-D6 decisions locked)
- sterling-prune-state-variants (cut meaningless fg.hover / fg.active)
- sterling-tests-legacy-sweep (silvery/tests/ ~140 uses gated on 0.20.0)
- publishconfig-exports-fix (0.19.1 republish via pnpm)
- theme-v4-ansi16-hex (Phase 1)
- theme-v4-kebab-rename (Phase 2)
- theme-v4-schemes-rescope (Phase 3 → @silvery/schemes)
- theme-v4-backdrop-standalone (Phase 6)

**In progress**:
- sterling-2d-release (0.18.x cleanup patch)
- sterling-2e-interior-migration (silvery interior + 0.19.0 breaking release)
- sterling-public-docs (silvery.dev for 0.19.0)

**Open**:
- sterling-storybook (interactive system explorer epic)
- theme-v4 (sub-epic — parent of most of above)
- design-package-rename (Phase 3b: @silvery/theme → @silvery/design)
- consolidate-design-demos
- sterling-package-tests-sweep (~137 uses, gated on 0.20.0 inlineSterlingTokens drop)
- sterling-cursor-adaptive (P3 bug — repairCursorBg pass)
- sterling-borders-adaptive (P3 bug — border-default contrast lift)
- sterling-render-strategy (P3 — pluggable RenderStrategy)
- sterling-surface-adaptive (P4 bug — bg-surface-overlay AA on light schemes)
- sterling-inline-hex-quantize (P4 — quantize per caps.colorLevel)
- sterling-design-material (P4 — Phase 5 reference impl)
- selection-theme-tokens (P3 — plumb existing legacy `selectionbg` through paintFrame; stopgap until below)
- (NEW) sterling-selection-tokens (proposed — add `bg-selected` / `fg-on-selected` / `bg-inverse` / `bg-link` / `fg-on-link` to Sterling so the legacy `selectionbg`/`selection`/`inverse`/`link` tokens can finally be retired)

Reference: apps/@km/tui/src/views/selection-style.ts:8-14 documents that selection / inverse / link have no Sterling equivalent in 0.19 and remain on legacy theme via deriveTheme().