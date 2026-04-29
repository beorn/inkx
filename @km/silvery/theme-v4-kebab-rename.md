---
id: "@km/silvery/theme-v4-kebab-rename"
aliases:
  - km-silvery.theme-v4-kebab-rename
  - km-silvery-theme-v4-kebab-rename
created_by: Bjørn Stabell
created_at: 2026-04-19T17:59:03Z
closed_at: 2026-04-19T21:43:56Z
close_reason: Scope absorbed by the 2a/2b/2c/2d series (sterling-2a-data-layer →
  sterling-2d-release). The monolithic 'kebab rename' was too big for one
  session and conflated type design, component migration, consumer refactor, and
  release work. Superseded 2026-04-19.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-v4-kebab-rename
    depends_on_id: km-silvery.theme-v4
    type: parent-child
    created_at: 2026-04-19T10:59:03Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-silvery.theme-v4-kebab-rename
    depends_on_id: km-silvery.theme-v4-ansi16-hex
    type: blocks
    created_at: 2026-04-19T10:59:03Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Phase 2: Structured tokens + Material vocabulary migration @km/silvery #task #P2

blocks:: [[@km/silvery/theme-v4]], [[@km/silvery/theme-v4-ansi16-hex]]

REVISED 2026-04-19 (Pro review applied) — final decision is **Material/shadcn vocabulary + Primer grammar** with Pro-review refinements (info role, destructive intent, raised/overlay surface levels, contrast guardrails).

Canonical doc: hub/silvery/design/v10-terminal/design-system.md

## Target vocabulary (Material-aligned)

Roles:
- accent (interactive/brand emphasis)
- info (informational status — default-aliased to accent, semantically distinct)
- success
- warning
- error
- muted
- default

Intent (component layer, not base roles):
- destructive → aliases error by default
- priority/importance (TBD) → orthogonal axis for escalation

Surface levels: default / subtle / raised / overlay

## Renames

- primary → accent.bg (interactive) / brand (theme input, not public role)
- primaryfg/errorfg/etc. → <role>.fgOn (contrast-picked)
- muted → muted.fg
- mutedbg → surface.subtle
- error → error.fg / error.bg (KEEP 'error')
- warning → warning.fg / warning.bg (KEEP 'warning')
- success, info → same pattern
- disabledfg → disabled.fg
- inputborder → border.default
- focusborder → border.focus
- selectionbg → selection.bg
- cursorbg → cursor.bg

## Grammar (Primer-aligned)

- Prefix: fg-*, bg-*, border-*, cursor-*
- State suffix: -hover, -active, -selected, -focus
- Pair convention: role + fgOn
- Emphasis: -subtle, -muted, -emphasis, -raised, -overlay

## Structured form (nested JS) + flat form (derived projection)

Theme ships BOTH shapes, populated at derive time. Nested for JS APIs + type-safety; flat for $token strings + CSS vars.

## Derivation guardrails (new from Pro review)

- WCAG AA contrast required on every role pair, not best-effort
- Delta adaptation per hue/chroma/luminance (±0.04L fails on yellows, low-chroma)
- Per-role override in scheme object
- Never preserve palette identity at the cost of semantic legibility

## Full 24-state-variant matrix

Every interactive role gets -hover and -active.

## Execution

Public API break. Ship as silvery v0.19.0.

- Phase 2a: Add structured Theme shape with new roles (info, surface.raised, surface.overlay, destructive intent) as PRIMARY
- Phase 2b: /refactor migrate ~145 consumer sites camelCase → structured
- Phase 2c: Delete legacy camelCase + PRIMER_ALIASES + LEGACY_ALIASES

## Acceptance

- rg 'theme\.(primaryfg|mutedbg|selectionbg|inputborder|focusborder|cursorbg|popoverbg|surfacebg|inversebg|disabledfg)\b' apps packages vendor/silvery → 0 hits
- rg 'PRIMER_ALIASES|LEGACY_ALIASES' vendor/silvery/packages/ansi/src/style/style.ts → 0 hits
- Theme has nested (accent.hover.bg) + flat (flat['bg-accent-hover']) access
- Theme has info role (default alias to accent values)
- Theme has surface.raised + surface.overlay
- Derivation contrast-validates against WCAG AA
- 84 schemes still pass catalog test (may need per-role overrides for yellows)
- @km/tui visual tests pass