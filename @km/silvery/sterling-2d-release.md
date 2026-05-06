---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-2d-release"
aliases:
  - km-silvery.sterling-2d-release
  - km-silvery-sterling-2d-release
created_by: claude:4274df30
created_at: 2026-04-19T21:43:02Z
closed_at: 2026-04-25T06:19:30Z
close_reason: Shipped 2026-04-20 as silvery 0.18.1 (commits 67bf8ec8, c6d1e29a,
  008164e6, 0644940e, cf73071b — all pushed) + km submodule bump (2c52b5d71).
  All acceptance criteria met. Closing now since 2e (0.20.0) just landed and
  2d's transitional 0.18.x window is over.
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.sterling-2d-release
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:12:56Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.sterling-2d-release
    depends_on_id: km-silvery.sterling-2c-km-migration
    type: blocks
    created_at: 2026-04-19T14:43:02Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: "@km/silvery/sterling"
      - type: link
        target: km-silvery.sterling-2c-km-migration
---

# [x] Sterling 2d: internal cleanup (0.18.x patch — not breaking) @km/silvery #task #P1 @claude:4274df30

blocks:: [[@km/silvery/sterling]], [[@km/silvery/sterling-2c-km-migration]]

REVISED 2026-04-19 after release agent pre-flight audit revealed checklist was over-optimistic. The interior of silvery (reconciler, pipeline, Text resolver, css.ts, cli.ts, ThemeExplorer Vue, @km/tui theme.ts) has 81 live accesses to single-hex role fields (theme.primary/fg/bg/muted/etc.) that 2b never migrated.

Original 2d intent was to delete ALL legacy Theme fields + ship silvery 0.19.0 breaking. That's now split into two beads:

## This bead (2d) — internal cleanup, silvery 0.18.x patch

Non-breaking. Pure internal cleanup of the Sterling augmentation layer now that Sterling ships the full Theme directly:

1. Delete vendor/silvery/packages/theme/src/sterling/augment.ts
2. Inline its flat-token write into deriveTheme + default-schemes paths (so legacy Theme ships WITH Sterling flat tokens baked in)
3. Delete LEGACY_ALIASES (style.ts) + PRIMER_ALIASES_FOR_MONO (monochrome.ts) — dead code once Sterling flats are on Theme
4. Update 7 consumers of augmentWithSterlingFlat to use the inlined path
5. @km/tui theme.ts: use the inlined path (no augment wrapper)
6. Update the 4 residual concat-kebab accesses in invariants.ts (visibility checks)
7. CHANGELOG entry as 'internal cleanup, no API break'
8. Version bump: 0.18.x → 0.18.next (patch)

This is ~300 LOC delete, no external-consumer break. Semver 0.18.next patch.

## New bead @km/silvery/sterling-2e-interior-migration — the REAL breaking release

Captures the deferred work:

- Migrate 81 single-hex role-field accesses across 20 interior files to Sterling Theme shape
- Rewrite invariants.ts CONTRAST_PAIRS + theme-contrast.test.ts to Sterling flat keys
- Migrate ag-react Text color resolver + host-config
- Migrate ag-term backdrop/decoration/render-box/cascade-predicates
- Migrate @silvery/theme css.ts + cli.ts
- Migrate docs ThemeExplorer.vue + 16 @km/tui theme.ts accesses
- Redefine Theme = Sterling's Theme (delete legacy Theme interface entirely)
- CHANGELOG BREAKING entry
- Version bump: 0.18.x → 0.19.0

~2000 LOC, 3-5 focused sessions.

## Acceptance (for THIS bead — 2d internal cleanup)

- rg 'augmentWithSterlingFlat' vendor/silvery/packages/ apps/ → 0 hits
- rg 'LEGACY_ALIASES|PRIMER_ALIASES_FOR_MONO' vendor/silvery/packages/ → 0 hits
- vendor/silvery/packages/theme/src/sterling/augment.ts no longer exists
- Sterling tests 219/219 green
- bun run test:ci green
- @km/tui test suite green
- silvery version bumped to 0.18.next (NOT 0.19.0)
- CHANGELOG notes 'internal cleanup, non-breaking'

Executed-By: claude:2505996f reviewed 2d prep agent's audit + accepted path 2

