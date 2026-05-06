---
aliases:
  - km-cli.migrate-to-import-bd
  - km-cli-migrate-to-import-bd
created_at: 2026-05-06T17:12:16.989Z
---

# Add `km import bd` as the canonical bd-import path #P3

Even if `km bd` is eventually retired, the import-from-bd path must survive. Make `km import bd` first-class.

## Goal

Register `bd import` functionality at `km import bd <vault>` (alongside the existing `km import asana`). The implementation already exists in `apps/km-cli/src/commands/bd-migrate.ts` (505 LOC, self-contained — imports from `@km/beads`, `@km/storage`, `loadKmBdConfig` only; zero references to other `bd-*` action handlers).

## Scope

- **Add** `km import bd` as a subcommand of the existing `importCommand` (in `apps/km-cli/src/commands/import.ts`). Wire it to call the same `migrateBeadsToMarkdown` engine that `bd migrate` uses.
- **Keep** `km bd migrate` as a transitional alias that delegates to `km import bd` (on-ramp ergonomics — bd users muscle-memory looking for `bd migrate`).
- **Add** `km import bd --export` (or `km export bd`) for the reverse direction (km → .beads/issues.jsonl). The current `bd export` lives in bd-migrate.ts.
- **Don't delete** `bd-migrate.ts` yet — it still backs `km bd migrate` until the on-ramp retires post-v2.

## Acceptance

- [ ] `km import bd <vault>` brings bd data into a km vault (matches current `bd migrate` behavior)
- [ ] `km import bd --help` discoverable from `km import --help`
- [ ] `km bd migrate` continues to work, delegates internally to the same engine
- [ ] Test that running both produces byte-identical state in a fresh vault (extend the bd⇔task equivalence property test or add a new fake-vault contract test)

## Why P3

The import path is critical for adoption (bd users can't migrate without it), but the current `bd migrate` works fine. This is a discoverability/canonical-surface fix — `km import bd` belongs alongside `km import asana` so a fresh km user finds it via `km import --help`.
