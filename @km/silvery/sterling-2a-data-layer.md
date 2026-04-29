---
id: "@km/silvery/sterling-2a-data-layer"
aliases:
  - km-silvery.sterling-2a-data-layer
  - km-silvery-sterling-2a-data-layer
created_by: claude:4274df30
created_at: 2026-04-19T21:42:37Z
closed_at: 2026-04-19T22:48:21Z
close_reason: Shipped at vendor/silvery ffe72837. 196/196 Sterling tests pass,
  all 84 catalog schemes pass WCAG AA strict. Three clarifications emerged
  during impl (muted uses 3:1 AA-Large gate; accent.fg may diverge from
  accent.bg after auto-lift in light schemes; autoLift uses binary-search via
  ensureContrast). Unblocks sterling-2b, sterling-storybook-mvp.
---

# [x] Sterling Phase 2a: Theme type + derivation + guardrails (additive) @km/silvery #task #P2 @claude:4274df30

blocks:: [[@km/silvery/sterling-preflight]], [[@km/silvery/theme-v4]]

Add new Sterling Theme shape as ADDITIVE — old camelCase keeps working until Phase 2d.

## New code
- @silvery/design/src/tokens.ts — DesignSystem, Theme, ThemeShape types + FlatToken union
- @silvery/design/src/sterling.ts — the sterling export
- @silvery/design/src/derive.ts — preservative derivation from ColorScheme with OKLCH guardrails
- @silvery/design/src/contrast.ts — WCAG AA validation + adaptive lightening
- @silvery/design/src/flatten.ts — populateFlat(theme) writes flat-key projections

## Acceptance
- sterling.deriveFromScheme(nord) returns Theme with BOTH theme.accent.fg AND theme['fg-accent'] on same object, same string reference
- theme.info exists (default aliases accent values, distinct slot)
- theme.surface.raised + theme.surface.overlay exist
- All 84 schemes pass build-time catalog contrast test (runs in CI)
- Legacy Theme fields still present, consumers unbroken
- theme.derivationTrace exposes the scheme → token path for the storybook

DEPENDS: sterling-preflight
BLOCKS: sterling-2b, sterling-storybook-mvp
Parent: @km/silvery/theme-v4