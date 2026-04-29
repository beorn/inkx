---
id: "@km/silvery/theme-v4"
aliases:
  - km-silvery.theme-v4
  - km-silvery-theme-v4
created_by: Bjørn Stabell
created_at: 2026-04-19T17:59:02Z
closed_at: 2026-04-24T23:14:49Z
close_reason: Theme v4 delivered — rebranded as Sterling. Phases 1-3+6 closed;
  remaining open work (kill-theme-detect-package, theme-v4-stripInlineColors)
  re-parented directly to km-all.sterling tracking epic.
---

# [x] Theme v4 — Sterling design system (multi-target, structured tokens) @km/silvery #task #P2

blocks:: [[@km/all/sterling]]

Parent epic: Sterling design system for silvery.

Canonical plan: hub/silvery/design/v10-terminal/design-system.md (single source of truth)
Sub-plans: storybook-design.md, sterling-preflight.md (pending)
Related: backdrop-fade-plan.md (shipped), color-inherit-plan.md (adjacent)

## Status (2026-04-19)

### Shipped
- Phase 1: hex-only Theme — theme-v4-ansi16-hex
- Phase 3a: internal package rescope — theme-v4-schemes-rescope
- Phase 6: Backdrop standalone — theme-v4-backdrop-standalone (+ calibration in silvery main)

### In flight (Sterling Phase 2 — the big one)
Pre-flight → 2a → 2b → 2c → 2d. Each bead = one focused session.
- sterling-preflight (D1-D6 decisions)
- sterling-2a-data-layer (Theme type + derivation + guardrails, ADDITIVE)
- sterling-2b-ui-components (@silvery/ui consumes new tokens)
- sterling-2c-@km/_orphan/migration (batch-refactor ~145 @km/tui sites)
- sterling-2d-release (delete legacy, ship silvery 0.19.0 — BREAKING)

### Post-release
- design-package-rename (Phase 3b: @silvery/design + @silvery/schemes)
- sterling-public-docs (silvery.dev updates for 0.19.0)
- theme-v4-stripInlineColors (Phase 4, orthogonal)
- sterling-design-material (Phase 5, post-plateau reference impl)

### Storybook (parallel track, depends on 2a)
- sterling-storybook epic
  - sterling-storybook-mvp
  - sterling-storybook-full

## Critical path (7 serial + 2 parallel)

preflight → 2a → 2b → 2c → 2d → (design-package-rename + public-docs + storybook-mvp+full) → design-material

## Retired
- theme-v4-kebab-rename (closed 2026-04-19 — scope absorbed by 2a/2b/2c/2d)