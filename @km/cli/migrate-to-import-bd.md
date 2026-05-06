---
aliases:
  - km-cli.migrate-to-import-bd
  - km-cli-migrate-to-import-bd
created_at: 2026-05-06T17:12:16.989Z
closed_at: 2026-05-06T18:51:31.091Z
closeReason: "Shipped: 19aab221c (km import bd canonical) + 58c80f2c4 (delete
  bd-migrate.ts). New apps/km-cli/src/commands/import-bd.ts (519 LOC) registered
  as subcommand of km import alongside km import asana/csv. km bd migrate / km
  bd export deleted; bd --help has new Import section pointing at km import bd.
  bd-migrate.ts deleted. Self-contained move; engine functions unchanged in
  @km/beads. 859/859 km-cli tests pass."
---

# [x] Add `km import bd` (canonical) and delete `km bd migrate` #P3

Per user direction (2026-05-06): the canonical-and-only path is `km import bd`. `km bd migrate` is **deleted**, not kept as an on-ramp alias. `km bd --help` mentions `km import bd` in its examples/help text so bd users discover the new path.

## Goal

1. **Add** `km import bd <vault>` as a subcommand of the existing `importCommand` (alongside `km import asana`). Move the `migrateBeadsToMarkdown` engine call there.
2. **Add** `km import bd --export <path>` (or `km export bd <path>`) for the reverse direction (km → .beads/issues.jsonl).
3. **Delete** `migrateCommand` and `exportCommand` from `bd.ts` — they're replaced by the `km import bd` path.
4. **Delete** `bd-migrate.ts` — its functionality moves entirely into `import.ts` (or a new `import-bd.ts`).
5. **Update** `bd --help` examples/help text to reference `km import bd` for newcomers.

## Engine reuse

The `bd-migrate.ts` implementation is self-contained — imports from `@km/beads` (the package: `migrateBeadsToMarkdown`, `exportToBeads`, `recaptureFromExport`, `splitFrontmatter`, `bdIdToPathForm`, `Bead`, types), `@km/storage`, and `loadKmBdConfig`. Move the action handler into `apps/km-cli/src/commands/import.ts` (or split out `apps/km-cli/src/commands/import-bd.ts` if `import.ts` gets too large). Drop `loadKmBdConfig` cross-import; or move `bd-load-config.ts` into a non-bd location too if needed.

## Acceptance

- [ ] `km import bd <vault>` works with the same flag set as the legacy `bd migrate`
- [ ] `km import --help` lists `bd` alongside `asana`
- [ ] `km bd migrate` no longer exists (returns "unknown command" or similar)
- [ ] `km bd --help` mentions `km import bd <vault>` in the examples / help section
- [ ] Reverse direction works (`km import bd --export <path>` or equivalent)
- [ ] `bd-migrate.ts` is deleted
- [ ] `migrateCommand` + `exportCommand` are dropped from `bd.ts`
- [ ] Test: import a fixture .beads/issues.jsonl into a fresh vault; assert canonical layout

## Why P3

Critical for adoption (bd users can't migrate without it), but the existing `bd migrate` works fine — this is a discoverability + canonical-surface fix. `km import bd` belongs alongside `km import asana` so a fresh km user finds it via `km import --help`. Removing `bd migrate` enforces the "import once, then use bd or km" mental model.

