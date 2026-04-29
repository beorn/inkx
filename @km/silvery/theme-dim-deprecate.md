---
id: "@km/silvery/theme-dim-deprecate"
aliases:
  - km-silvery.theme-dim-deprecate
  - km-silvery-theme-dim-deprecate
created_by: Bjørn Stabell
created_at: 2026-04-18T06:07:35Z
closed_at: 2026-04-18T18:27:20Z
close_reason: "Shipped in v0.18.0: Phase 1 — @deprecated markers on
  StyleProps.dim + .dimColor. Phase 1b — internal silvery component migrations:
  Divider→$border, ProgressBar→$muted, Tooltip→<Small>, PickerList→$muted,
  TextInput placeholders→$muted/$border, PickerDialog
  placeholder/divider→$muted/$border, EditContextDisplay placeholder→$muted,
  ModalDialog brackets+footer→$muted, Table headers/separators→$muted/$border,
  TextArea placeholder/disabled→$muted/$disabledfg, ErrorBoundary stack→$muted.
  Typography.<Small> retains dimColor internally (canonical realization site).
  Phase 2 (remove props from public types) deferred to next silvery major."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-dim-deprecate
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T23:08:02Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Deprecate dimColor prop on Text/Box — route everything through $faint / $muted / $disabledfg tokens @km/silvery #task #P3

blocks:: [[@km/silvery/design-system]]

dim/dimColor is a rendering detail, not a design primitive. Unreliable across terminals, and every semantic use case is covered by a token ($text-subdued for fine print, $text-secondary for meta, $text-disabled for inactive, $border-default for divider lines).

## Principle

Truecolor never emits SGR 2. Tokens resolve to pre-dimmed hex values at derivation time; SGR 2 only appears at ANSI 16 / monochrome tiers where it's the only way to express intermediate intensity.

## Phase 1 — mark deprecated

- Add @deprecated JSDoc on dimColor in TextProps, BoxProps
- TypeScript surfaces warning to all consumers
- Migrate <Small> preset to $text-subdued (pre-dimmed hex at truecolor)
- Grep vendor/silvery/packages/ag-react/src/ui/ for internal dimColor usage; replace with tokens
- Grep @km/tui + other apps for dimColor usage; replace with tokens

## Phase 2 — remove (next silvery major)

- Remove dimColor from public TextProps / BoxProps entirely
- Internal renderer realization (ANSI 16 tier emits SGR 2 as token concrete form) lives inside derive.ts / output phase, not as a prop
- No escape hatch in public API — if edge cases surface, expose via monochrome theme attrs

## Acceptance

- [ ] <Small> uses $text-subdued
- [ ] dimColor marked @deprecated on TextProps/BoxProps
- [ ] All internal silvery usages migrated to tokens (divider, progressbar, selectlist disabled)
- [ ] @km/tui migrated
- [ ] Remove in next major: dimColor prop dropped

Full context: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Parent: @km/silvery/design-system