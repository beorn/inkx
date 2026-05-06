---
aliases:
  - km-cli.bd-doctor-retire
  - km-cli-bd-doctor-retire
created_at: 2026-05-06T17:12:18.925Z
closed_at: 2026-05-06T17:39:18.190Z
closeReason: "Shipped: deleted bd-doctor.ts entirely (138 LOC). User confirmed
  sole vault was already migrated, so the one-shot migrate-to-beads-root tool is
  dead code. Dropped attachDoctorCommands from bd.ts. 854/854 km-cli tests pass,
  0 tsc errors. Original commit that introduced it: 2d3a5d707 (2026-04-28)."
---

# [x] Retire km bd doctor (138 LOC). It's a one-time vault-layout migration tool (single subcommand: migrate-to-beads-root). Move it under km doctor migrate-to-beads-root, drop attachDoctorCommands from bd.ts. Keep the escape hatch one tier deeper instead of deleting. #P3

Confirmed by file inspection: `bd-doctor.ts` (138 LOC) has exactly ONE subcommand — `migrate-to-beads-root` — which moves legacy `<vault>/mem/` → `<beadsRoot>/@memory/` and `<vault>/imports/<src>-<date>/*` into the canonical beads-root layout. It's purely one-time vault-layout migration.

## Goal

Move `migrate-to-beads-root` to a more natural home and drop `km bd doctor` entirely.

## Two reasonable destinations

1. **Under `km import bd`**: it's migration-related and runs once per vault. `km import bd --layout-fix` or a sibling `km import bd-fix-layout` keeps it adjacent to the import flow.
2. **Under `km doctor`**: vault-layout repair is a "doctor" concern. `km doctor migrate-to-beads-root` keeps the verb consistent with km's own doctor.

User leaning: option 1 (it's migration-related). Default to option 1 unless the design review finds counter-arguments.

## Implementation

- Move `doctorMigrateToBeadsRootCommand` from `bd-doctor.ts` into either `import.ts` (option 1) or `doctor.ts` (option 2)
- Drop `attachDoctorCommands(bdCommand)` from `bd.ts`
- Delete `bd-doctor.ts`
- Update help text + docs

## Acceptance

- [ ] `km bd doctor migrate-to-beads-root` no longer exists OR continues to work as an on-ramp alias
- [ ] Either `km import bd-fix-layout` or `km doctor migrate-to-beads-root` works
- [ ] Once-per-vault migration still functions correctly (test on a synthetic legacy-layout vault)

## Why P3

Single-shot migration tool. Few users will ever run it. Cleanup, not a critical path.

