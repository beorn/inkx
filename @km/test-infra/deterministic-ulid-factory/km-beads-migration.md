---
aliases:
  - km-test-infra.deterministic-ulid-factory.km-beads-migration
  - km-test-infra-deterministic-ulid-factory-km-beads-migration
created_at: 2026-05-09T01:01:00.000Z
---

# Migrate km-beads call sites to the IdFactory seam #chore #P3

Parent: `@km/test-infra/deterministic-ulid-factory` (closed in 23a3db6cd) introduced the `IdFactory` injection seam in `@km/storage`. This sub-bead migrates `@km/beads`'s direct `ulid()` calls so bead-creation IDs become deterministic when tests pin the factory.

Call sites to migrate:

- `packages/km-beads/src/short-ids.ts:1` (import) + `:29` (`const id = ulid()`)
- `packages/km-beads/src/mutations.ts:7` (import) + `:27` (`const id = ulid()`) + `:115` (`id: ulid()`) + `:128` (`id: ulid()`)

Acceptance:
- Every direct `ulid()` call site in `packages/km-beads/src/` is replaced with `getIdFactory()()` (importing `getIdFactory` from `@km/storage`).
- `packages/km-beads/src/` no longer imports `ulid` from `"ulid"` for production code.
- `bun vitest run packages/km-beads/tests/` passes; `tsc --noEmit` 0 errors beyond baseline.

Smaller / orthogonal to the km-fs-mount migration; safe for a fresh agent to pick up — does not block any P0/P1 bead.
