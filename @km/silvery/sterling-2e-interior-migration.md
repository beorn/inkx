---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-2e-interior-migration"
aliases:
  - km-silvery.sterling-2e-interior-migration
  - km-silvery-sterling-2e-interior-migration
created_by: claude:4274df30
created_at: 2026-04-20T04:08:11Z
closed_at: 2026-04-25T06:19:51Z
close_reason: "Phase 2e shipped: silvery 7ef96bb4 (0.20.0 — Sterling is THE
  Theme) + km 9f4d2f836 (submodule bump), both pushed. Decision: option B2 —
  added fg/bg as top-level Sterling Theme tokens (mirroring
  scheme.foreground/background). 0.19.2 was already on npm so bumped to 0.20.0
  directly. Tests: silvery ansi+theme 1444 pass / 4 pre-existing border failures
  (sterling-borders-adaptive); km-tui 2523/2523. Type-system surgery: legacy
  Theme interface deleted; export type Theme = SterlingTheme. Files touched: 24
  in silvery (versions + intra-pkg deps + types/inline/derive/generate boundary
  casts + ThemeProvider variants cast)."
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.sterling-2e-interior-migration
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:12:57Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.sterling-2e-interior-migration
    depends_on_id: km-silvery.sterling-2d-release
    type: blocks
    created_at: 2026-04-19T21:08:11Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: "@km/silvery/sterling"
      - type: link
        target: km-silvery.sterling-2d-release
---

# [x] Sterling 2e: Migrate silvery interior + ship 0.19.0 breaking release @km/silvery #task #P1 @claude:4274df30

blocks:: [[@km/silvery/sterling]], [[@km/silvery/sterling-2d-release]]

Captures the deferred work from 2d's audit 2026-04-19. The 2d cleanup (0.18.x patch) was the surface removal; this is the deep migration that actually justifies the 0.19.0 breaking version bump.

## Scope (~2000 LOC, 3-5 sessions)

Migrate 81 live accesses to single-hex role fields (theme.primary/fg/bg/muted/etc.) across 20 interior silvery + km files to Sterling Theme shape:

### Silvery runtime (breaks type-level consumers if naively deleted)

1. vendor/silvery/packages/ansi/src/theme/invariants.ts — CONTRAST_PAIRS table (29 pairs) use concat-kebab field names; rewrite to Sterling flat keys
2. vendor/silvery/tests/theme-contrast.test.ts — entire suite tests legacy Theme field access; rewrite to Sterling
3. vendor/silvery/packages/ansi/src/theme/derive.ts — truecolor + ansi16 paths set primaryfg/accentfg/errorfg/etc.; emit Sterling structured roles instead
4. vendor/silvery/packages/ansi/src/theme/default-schemes.ts — hardcoded legacy defaults; migrate to Sterling
5. vendor/silvery/packages/ag-react/src/components/Text.tsx — Text color resolver reads theme.primary/muted/link; switch to $fg-accent / $fg-muted / $fg-link
6. vendor/silvery/packages/ag-react/src/reconciler/host-config.ts — single-hex role reads
7. vendor/silvery/packages/ag-term/src/pipeline/backdrop-phase.ts
8. vendor/silvery/packages/ag-term/src/pipeline/decoration-phase.ts
9. vendor/silvery/packages/ag-term/src/pipeline/render-box.ts
10. vendor/silvery/packages/ag-term/src/pipeline/cascade-predicates.ts

### Theme tooling

11. vendor/silvery/packages/theme/src/css.ts — CSS variable exporter
12. vendor/silvery/packages/theme/src/cli.ts — 13 accesses (theme CLI output)
13. vendor/silvery/docs/.vitepress/components/ThemeExplorer.vue — 8 uses

### @km/tui consumer (the other half)

14. apps/@km/tui/src/theme.ts — 16 accesses (primary, fg, link, muted, selection, inverse, error, warning, success, border, bg) — the ones 2c couldn't migrate because Sterling didn't ship equivalents yet

### Final shape

15. Redefine Theme type: remove legacy Theme interface from vendor/silvery/packages/ansi/src/theme/types.ts; Theme = Sterling's Theme (intersection FlatTokens & Roles)
16. Delete any remaining compat shims

## Approach

/refactor plan — phased, one file-family per session:

- Phase A: invariants + theme-contrast tests (tight + self-contained)
- Phase B: ag-react interior (Text, host-config)
- Phase C: ag-term pipeline (backdrop/decoration/render-box/cascade-predicates)
- Phase D: theme tooling (css.ts, cli.ts, ThemeExplorer.vue)
- Phase E: @km/tui theme.ts final migration + Theme type deletion + CHANGELOG + 0.19.0 bump

## Acceptance (for the release)

- Theme type has no legacy Theme interface
- rg 'theme\.(primary|muted|error|warning|success|info|accent|fg|bg|link|border|surface|popover|inverse|cursor)\b' vendor/silvery/packages/ apps/ — 0 hits (or only in tests migrated to structured form)
- Sterling is THE Theme (no alongside)
- bun run test:ci green
- CHANGELOG has proper BREAKING section + full migration map
- silvery version bumped to 0.19.0

## Dependencies

- BLOCKED on: sterling-2d-release (the 0.18.x cleanup must land first — simplifies the surface before migrating the interior)
- BLOCKS: design-package-rename (once Theme type is Sterling-only, the @silvery/theme → @silvery/design rename is mostly a renaming job)

