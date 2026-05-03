---
id: "@km/all/drop-shortid-concept"
aliases:
  - km-all.drop-shortid-concept
  - km-all-drop-shortid-concept
created_by: claude:bjorns-2026-05-03
created_at: 2026-05-03T15:30:00Z
type: refactor
priority: P2
parent: "@km/all"
---

# Drop the "shortId" concept — id, name, path, alias is sufficient @km/all #refactor #P2

Per the 2026-05-03 reframe: **"shortId" is not a concept in km's data model.**
The three handles are id (ULID), name (segment), path (composed) plus the
alias mechanism (an extra string that resolves to a node). The `shortId`
name is bd-jargon — bd called the human-readable id (`km-beads.foo`) the
"short id" to distinguish it from internal long ids. In km, the human-
readable id IS the path-form (`@km/beads/foo`); there is no separate
"short" id.

This bead removes the concept from the surface.

## Why

- **No conceptual home.** km's three-concept model (storage.md:761-867)
  names id, name, path. There's no fourth concept called "shortId" —
  every shortId today is one of (ULID, path-form, alias).
- **Vocabulary leak from bd.** Carrying the term forward in
  `generateShortId`, `generateCustomId`, `resolveShortId`, etc. confuses
  every reader who isn't fluent in bd legacy.
- **The bd CLI doesn't need it either.** `bd create` without `--id`/
  `--path` auto-generates a node `name` (e.g. `km-q5hji`) — that's just
  a name generator, not a separate handle type.

## Renames

| Today | After |
|---|---|
| `resolveShortId(input, opts)` | `resolveRef(repo, ref)` (in `@km/storage`, see `@km/storage/extract-resolveref`) |
| `generateShortId(prefix)` | `mintBeadName(prefix)` — returns a string used as `node.name`. Lives in the bd CLI module. |
| `generateCustomId(custom, prefix)` | `bdRefToPath(custom, prefix)` — converts user-typed bd-form `--id` to path-form. Lives in the bd CLI module (or `@km/migrate` if bd-import only). |
| `generateSubId(parentShortId, n)` | `mintSubBeadName(parentName, n)` — same lift, name-not-id terminology. |
| Variable name `shortId` | `name` (when it holds a `node.name`) or `ref` (when it accepts user input) |
| File `packages/km-beads/src/short-ids.ts` | Split: resolver to `@km/storage/resolve-ref.ts`; generators to `packages/km-beads/src/cli/mint-name.ts` (or wherever bd CLI lives). |

## Acceptance

- No `ShortId` / `shortId` identifier remains in non-test, non-deprecation
  code outside `@km/migrate` (where bd-form id translation lives).
- `resolveShortId` is a deprecated re-export of `resolveRef` for one
  transitional release; new callers use `resolveRef`.
- A grep gate (or oxlint rule) in `packages/km-infra` blocks
  reintroduction of `shortId` as a fresh identifier outside the migrate
  package.

## Sweep size (verified 2026-05-03 arch review)

- **`generateShortId` / `generateCustomId` / `generateSubId`**: zero
  external callers. Pure internal rename in `@km/beads`.
- **`resolveShortId`**: 2 external callers —
  `apps/km-cli/src/utils/resolve-task.ts:9` (comment only),
  `apps/km-cli/tests/resolve-task.test.ts:78`. Update both.

The full sweep is small. Most of the work is the rename inside
`@km/beads` itself; cross-package surface is minimal.

## Depends on

- `@km/storage/extract-resolveref` — universal resolver must exist before
  the rename sweep.

## Pairs with

- `@km/all/id-name-path-code-cleanup` — broader vocabulary sweep
  (id-vs-name-vs-path-vs-ref discipline). This bead is a focused subset.

## Out of scope

- Removing the bd-form id format (`km-beads.foo`). Stays for compat.
- Removing alias machinery. Aliases are universal (see
  `@km/storage/aliases-first-class`).

## Related

- Tracking epic: `@km/all/path-name-id-redesign`.
- Origin: 2026-05-03 reframe — "we don't need shortIds for anything; just
  name, path, id, and resolve."
