---
id: "@km/storage/seed-file-node-helper"
aliases:
  - km-storage.seed-file-node-helper
  - km-storage-seed-file-node-helper
created_by: claude:bjorns-2026-05-01
created_at: 2026-05-01T17:55:00Z
type: refactor
priority: P2
parent: "@km/storage"
---

# Universal `seedFileNode` test helper @km/storage #refactor #P2

Generalize the in-flight `seedBead()` test helper (currently local in
`packages/km-beads/tests/resolve-id.property.test.ts`) into a universal
`seedFileNode()` helper in `@km/storage/testing`. The "bead" framing is
incidental — the load-bearing work is materializing a fs node at a given
path with frontmatter.

## Why

Per the 2026-05-01 layer audit:

- The test fixture pattern `repo.addNode({ data: { id: ... } })` (raw
  insert without file materialization) creates a divergence between test
  reality and production. Production goes through `renderBeadFile` +
  `writeFileSync` + `repo.sync()`.
- The pending `seedBead()` helper materializes via the production path.
  That's good — it closes the divergence.
- But "bead" in the helper name is incidental: every fs-materialized node
  (memory file, contact, calendar entry, future task, etc.) needs the same
  shape. Naming it `seedBead` couples the test infrastructure to a single
  consumer.
- The pattern is already set: `createFakeRepo` is in
  `packages/km-storage/src/testing/`, not in `packages/km-beads/tests/`,
  precisely because test infrastructure should live with the package
  whose surface it exercises.

## Implementation

```typescript
// packages/km-storage/src/testing/seed-file-node.ts
import type { Repo } from "../repo/repo.ts"

export interface SeedFileNodeOptions {
  /** Frontmatter values to write into the file's `---` block. */
  frontmatter?: Record<string, unknown>
  /** Body content below the frontmatter. */
  body?: string
  /** Filesystem-materialization tier — "file" (default) or "folder". */
  fstype?: "file" | "folder"
}

/**
 * Seed a filesystem-materialized node via the production code path
 * (writeFileSync + repo.sync()). Mirrors what real km does on creation —
 * unlike raw `repo.addNode({ data: { id: ... } })` which can leave the
 * fs/db in inconsistent states that the resolver then has to paper over.
 *
 * Use this in tests instead of raw addNode-with-data.id seeding. The
 * `data.id` json_extract fallback in the resolver is scheduled for
 * deletion (see @km/beads/data-id-stop-writing); fixtures that depend on
 * it will break.
 */
export function seedFileNode(
  repo: Repo,
  path: string,
  options?: SeedFileNodeOptions,
): { nodeId: string; filepath: string }
```

## Acceptance

- `seedFileNode` exists in `@km/storage/src/testing/seed-file-node.ts`.
- Re-exported from `@km/storage` test surface.
- Beads gets a thin `seedBead` wrapper (5-10 lines) — see paired bead
  `@km/beads/seed-bead-as-thin-wrapper`.
- At least 1 existing test file migrates to use `seedFileNode` directly
  (proof the helper works for non-bead consumers).
- Round-trip test: `seedFileNode(repo, "@km/notes/foo")` then
  `repo.resolveNode("@km/notes/foo")` returns the seeded node.

## Pairs with

- `@km/beads/seed-bead-as-thin-wrapper` — beads-specific 5-line wrapper
  that defaults bead frontmatter (type=task, priority=P2, etc.).

## Out of scope

- Migrating all existing test files. Some can stay on raw addNode for
  now; they'll break once the data.id fallback is removed in
  `@km/beads/data-id-stop-writing`.

## Related

- Origin: 2026-05-01 layer audit; pending sub-task of
  `@km/beads/path-name-id-test-bolster`.
- Tracking epic: `@km/all/path-name-id-redesign`.
