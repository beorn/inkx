---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-purge-legacy-tokens"
aliases:
  - km-silvery.sterling-purge-legacy-tokens
  - km-silvery-sterling-purge-legacy-tokens
created_by: claude:5e447b66
created_at: 2026-04-24T23:24:05Z
closed_at: 2026-04-25T06:43:40Z
close_reason: "Phase D shipped: silvery 7d23f8e2 (0.21.0 — purge
  selection/inverse/link runtime emit) + km d075291b2 (km-tui dim list cleanup),
  pushed to origin/main. Tests: silvery 317 sterling, ansi targeted 28
  mono-tier-attrs all pass; km-tui 2521/2562 (2 pre-existing matchers failures,
  4 pre-existing border WCAG). Acceptance grep returns 0 in scope (remaining
  matches are HTML hyperlink Style.link, VariantName 'link', MonoAttr 'inverse'
  SGR — all unrelated to legacy theme tokens)."
started_at: 2026-04-25T06:21:08Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.sterling-purge-legacy-tokens
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:24:05Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.sterling-purge-legacy-tokens
    depends_on_id: km-silvery.selection-theme-tokens
    type: blocks
    created_at: 2026-04-24T16:24:06Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.sterling-purge-legacy-tokens
    depends_on_id: km-silvery.sterling-2e-interior-migration
    type: blocks
    created_at: 2026-04-24T16:24:07Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.sterling-purge-legacy-tokens
    depends_on_id: km-silvery.sterling-km-tui-selection-migration
    type: blocks
    created_at: 2026-04-24T16:24:06Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.sterling-purge-legacy-tokens
    depends_on_id: km-silvery.sterling-selection-tokens
    type: blocks
    created_at: 2026-04-24T16:24:06Z
    created_by: claude:5e447b66
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-all.sterling
      - type: link
        target: km-silvery.selection-theme-tokens
      - type: link
        target: km-silvery.sterling-2e-interior-migration
      - type: link
        target: km-silvery.sterling-km-tui-selection-migration
      - type: link
        target: km-silvery.sterling-selection-tokens
---

# [x] Phase D: Purge legacy selection/inverse/link tokens from Sterling theme schema (0.20.0 breaking) @km/silvery #task #P1 @claude:22c2717d

blocks:: [[@km/all/sterling]], [[@km/silvery/selection-theme-tokens]], [[@km/silvery/sterling-2e-interior-migration]], [[@km/silvery/sterling-km-tui-selection-migration]], [[@km/silvery/sterling-selection-tokens]]

DELETE all references to `selectionbg`, `selection`, `inversebg`, `inverse`, `link` from the Sterling theme schema and derivation paths. Tsc-error-driven sweep.

## Sites to delete

vendor/silvery/packages/theme/src/validate-theme.ts:25 — token name registration
vendor/silvery/packages/theme/src/generate.ts:33,52,76 — per-palette default derivation (REPLACED by bg-selected derivation in Phase A)
vendor/silvery/packages/ansi/src/theme/derive.ts:168-203 — selectionbg luminance contrast guard (PORTED to bg-selected in Phase A)
vendor/silvery/packages/ansi/src/theme/derived.ts:73-74 — token interface
vendor/silvery/packages/ansi/src/theme/types.ts — selectionBackground, selectionForeground fields
vendor/silvery/packages/ansi/src/sterling/inline.ts:66-67 — legacy → flat mapping shim (DELETE)
vendor/silvery/packages/ansi/src/theme/invariants.ts:236 — fallback chain themeAny['bg-selected'] ?? themeAny['selectionbg'] (REPLACE with direct bg-selected read)

## Acceptance (literal /complete criteria)

- `grep -rn '"selectionbg"|"selection"|"inversebg"|"inverse"|"link"' vendor/silvery/packages/theme vendor/silvery/packages/ansi --include='*.ts' | grep -v test | grep -v dist | wc -l` returns 0
- `grep -n 'themeAny\\["bg-selected"\\] ?? themeAny\\["selectionbg"\\]' vendor/silvery/packages/ansi/src/theme/invariants.ts | wc -l` returns 0
- selectionBackground/selectionForeground fields removed from ansi/theme/types.ts
- Sterling 219 tests + @km/tui 2500+ tests pass with SILVERY_STRICT=1
- 0.20.0 ship

## Order

- Update beads, examples, README, docs FIRST (per refactoring lessons)
- Delete legacy registrations
- Tsc errors guide all consumer cleanups
- DO NOT add @deprecated annotations — delete entirely

## Depends on

- sterling-selection-tokens (Phase A) — new tokens must exist
- selection-theme-tokens (Phase B) — paintFrame must read flat token, not legacy
- sterling-@km/_orphan/tui-selection-migration (Phase C) — @km/tui consumers must be migrated
- sterling-2e-interior-migration — 0.19.0 ships first (this is 0.20.0 breaking)

