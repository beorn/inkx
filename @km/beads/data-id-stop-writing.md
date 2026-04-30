---
id: "@km/beads/data-id-stop-writing"
aliases:
  - km-beads.data-id-stop-writing
  - km-beads-data-id-stop-writing
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: feature
priority: P2
parent: "@km/beads"
---

# Stop writing data.id (path is derivable, not stored) @km/beads #task #P2

Mutations stop writing `data.id` on insert/update. The path is composed from `(parent walk + name)` on demand by the markdown serializer and CLI display. Existing rows' `data.id` becomes a fossil; the resolver no longer reads it (handled by `@km/beads/resolver-path-via-name-walk`).

## Why

Per `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`: id, name, path are three distinct things. The path is composed from name segments + parent walk; storing it again in `data.id` creates a sync invariant. The class of bugs claim-loses-issue (d14054dd6) and close-drop-data-wipe (3309b3512) was caused by partial JSON updates wiping `data.id`. With `data.id` no longer load-bearing, those mutation paths simplify.

## Implementation

1. Find every write site in `packages/km-beads/src/mutations.ts` and `apps/km-cli/src/commands/bd.ts` that emits `data.id = …` in the write payload.
2. Remove. The `data` JSON keeps `aliases:` (for legacy bd-form fallback) and other fields, but `data.id` stops being written.
3. Existing rows' `data.id` values stay (fossils). Resolver doesn't read them (path resolution is via name-walk now).
4. Markdown serializer for bead frontmatter: emits `id: <derived-path>` from the path-derivation helper, not from `data.id`. (Frontmatter field name is misleading — it's actually a path. Renaming it is a separate bead: `@km/beads/frontmatter-path-rename`.)
5. The defensive `currentData` merge pattern (the d14054dd6 / 3309b3512 fix) stays in place — it's still right for OTHER preserved fields (aliases, mentions, tags) — but `data.id` is no longer the load-bearing case.

## Acceptance

- New beads: `select data from nodes where id = <new-bead-ulid>` does NOT include an `"id"` key in the JSON.
- Mutation tests: claim/close/drop on a bead — `data` JSON survives partial updates. `mutations.test.ts` invariants pass.
- Resolver: no test in `resolve-id.property.test.ts` depends on `data.id` being present.
- Migration tool: `km bd migrate` (re-importing) DOES write `data.id` for compat with downstream consumers — confirm no downstream depends on it; if none, drop the migrate write too.

## Depends on

- `@km/beads/resolver-path-via-name-walk` — must land first so the resolver isn't reading `data.id` anymore.

## Follow-up

- `@km/beads/data-id-fossil-removal` (P3, future) — once we're confident, run a one-shot migration to strip `data.id` from every existing row's `data` JSON. Pure cleanup.
