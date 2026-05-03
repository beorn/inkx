---
id: "@km/storage/extract-resolveref"
aliases:
  - km-storage.extract-resolveref
  - km-storage-extract-resolveref
created_by: claude:bjorns-2026-05-01
created_at: 2026-05-01T17:55:00Z
type: refactor
priority: P1
parent: "@km/storage"
---

# Universal `resolveRef` in @km/storage — replaces `resolveShortId` @km/storage #refactor #P1

The function currently called `resolveShortId` in `@km/beads/src/short-ids.ts`
performs a 4-step ladder. Per the 2026-05-03 reframe (see
`@km/all/path-name-id-redesign`), **all four steps are universal**, not
beads-specific:

- Step 1 (ULID direct match → `repo.getNode`) — universal.
- Step 2 (path-form via `fs_path` → `repo.resolveNode`) — universal.
- Step 3 (alias scan over `data.aliases`) — universal once aliases are
  promoted to a first-class node field. **Aliases are not bead-specific** —
  any node can have alternate names (cross-vault references, link rewrites,
  legacy import forms). See `@km/storage/aliases-first-class`.
- Step 4 (deprecated `data.id` json_extract fallback) — already deprecated;
  delete after test fixtures migrate (see `@km/beads/data-id-stop-writing` +
  `@km/storage/seed-file-node-helper`).

The "shortId" name is bd-jargon for the dotted-form id (`km-beads.foo`) and
no longer reflects what the function does. This bead extracts the resolver
to `@km/storage` as `resolveRef` — a single universal entry point for
"I have a user-supplied reference string, give me a node."

## Why

- Steps 1–3 work for **any** KNode — paragraph, folder, file, mdsection,
  bead. Bead-ness is incidental.
- The current colocation forces non-beads callers (km-cli `view`, km-tui
  `goto`, future task system, MCP plugins, etc.) to depend on `@km/beads`
  just to reuse the universal resolver.
- "shortId" as a concept does not exist in km's data model. Three handles
  (id, name, path) and one alias mechanism are all the resolver needs to
  know about. Renaming clarifies the surface.

## Universal `resolveRef` shape

```typescript
// packages/km-storage/src/repo/resolve-ref.ts
import type { KNode } from "@km/core"
import type { Repo } from "./repo.ts"

/**
 * Resolve a user-supplied reference string to a node.
 *
 * Accepts (in priority order):
 *   1. ULID (`01H5XJ...`)              — direct primary key match
 *   2. path-form (contains `/`)         — indexed fs_path lookup
 *   3. alias                            — exact match against node.aliases
 *
 * Returns null when no node matches. The deprecated `data.id`
 * json_extract fallback is NOT included; it lives elsewhere as a
 * tagged-deprecated helper until test fixtures migrate.
 */
export function resolveRef(repo: Repo, ref: string): KNode | null
```

Implementation lifts the 3-step ladder from `resolveShortId`. Step 3 reads
from `node.aliases` (after `@km/storage/aliases-first-class` promotes it
from `data.aliases` JSON) — same query shape, indexed seam.

## Acceptance

- `packages/km-storage/src/repo/resolve-ref.ts` exists and exports
  `resolveRef`.
- `@km/storage`'s public index re-exports `resolveRef`.
- `@km/beads/src/short-ids.ts`'s `resolveShortId` becomes a deprecated
  re-export of `resolveRef` for one transitional release; callers migrate.
- New tests in `packages/km-storage/tests/resolve-ref.test.ts` cover:
  - ULID match returns the node
  - path-form match returns the node
  - alias match returns the node (after `aliases-first-class` lands)
  - missing input returns null
- All existing resolver tests in
  `packages/km-beads/tests/resolve-id.property.test.ts` continue to pass.

## Out of scope

- Deprecated `data.id` json_extract fallback. Delete in
  `@km/beads/data-id-stop-writing` once test fixtures migrate to
  file-materialization (see `@km/storage/seed-file-node-helper`).
- Branded `Ref` type. YAGNI per `@km/all/id-name-path-code-cleanup`.
- Promoting `data.aliases` to first-class. Separate bead:
  `@km/storage/aliases-first-class`.

## Pairs with

- `@km/storage/aliases-first-class` (P2) — promotes `data.aliases` to a
  first-class node field; resolver alias step reads it generically.
- `@km/beads/data-id-stop-writing` (P2) — drops the writes that motivated
  the deprecated step-4 fallback.

## Related

- Tracking epic: `@km/all/path-name-id-redesign`.
- Origin: 2026-05-01 / 2026-05-03 layer audit during the path/name/id
  session. Earlier draft of this bead split the resolver into universal
  + beads-specific halves; the 2026-05-03 reframe collapsed that split
  because aliases are universal.
