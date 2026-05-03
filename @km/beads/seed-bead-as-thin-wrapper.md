---
id: "@km/beads/seed-bead-as-thin-wrapper"
aliases:
  - km-beads.seed-bead-as-thin-wrapper
  - km-beads-seed-bead-as-thin-wrapper
created_by: claude:bjorns-2026-05-01
created_at: 2026-05-01T17:55:00Z
type: refactor
priority: P3
parent: "@km/beads"
---

# `seedBead` becomes a 5-line wrapper around universal `seedFileNode` @km/beads #refactor #P3

Once `@km/storage/seed-file-node-helper` lands, the beads-side helper
shrinks to a thin wrapper that defaults bead-specific frontmatter
(type, priority, status, etc.) and delegates the materialization to the
universal helper.

## Why

The current `seedBead` (in-flight, local in
`packages/km-beads/tests/resolve-id.property.test.ts`) does two things:

1. Materialize a file at a given path — **universal** (extracted in
   paired bead).
2. Stamp bd-CLI-conventional props (`type: task`, `priority: P2`, etc.) —
   **bd-CLI-specific** (per the 2026-05-03 reframe: "beads" in km is the
   `km bd` CLI surface, not a data-model layer; the props themselves are
   universal task fields, but the bd CLI's defaults for them are its own).

Splitting them lets the universal half serve memories, contacts, future
tasks, etc., while the beads-specific frontmatter defaults stay in beads
where they belong.

## Implementation

```typescript
// packages/km-beads/src/testing/seed-bead.ts (or wherever beads test
// helpers will live — could be src/testing or just tests/helpers)
import { seedFileNode } from "@km/storage/testing"
import type { Repo } from "@km/storage"

export interface SeedBeadOptions {
  title?: string
  type?: "task" | "bug" | "feature" | "epic"
  priority?: "P0" | "P1" | "P2" | "P3" | "P4"
  status?: "open" | "in-progress" | "blocked" | "closed"
}

/**
 * Seed a bead via the universal `seedFileNode` helper, defaulting the
 * frontmatter shape that bd-style beads expect.
 */
export function seedBead(
  repo: Repo,
  path: string,
  options?: SeedBeadOptions,
): { nodeId: string; filepath: string } {
  return seedFileNode(repo, path, {
    frontmatter: {
      type: options?.type ?? "task",
      priority: options?.priority ?? "P2",
      ...(options?.status && { status: options.status }),
    },
    body: options?.title ? `# ${options.title}\n` : "",
    fstype: "file",
  })
}
```

## Acceptance

- `seedBead` reduces to ≤15 lines (excluding type definitions).
- All 3 test files currently using raw addNode-with-data.id migrate to
  `seedBead`:
  - `apps/km-cli/tests/resolve-task.test.ts`
  - `apps/km-cli/tests/bd-close-resolver-symmetry.test.ts`
  - One more from the `@km/beads/path-name-id-test-bolster` audit
- Tests still pass.
- Once this bead lands, the resolver's step-4 `data.id` json_extract
  compat fallback becomes deletable — see `@km/beads/data-id-stop-writing`.

## Depends on

- `@km/storage/seed-file-node-helper` (P2) — must land first.

## Pairs with

- `@km/beads/data-id-stop-writing` — once fixtures migrate to
  file-materialization, the deprecated step-4 resolver fallback (and the
  `data.id` JSON write) can be removed.

## Related

- Tracking epic: `@km/all/path-name-id-redesign`.
- Origin: 2026-05-01 layer audit.
