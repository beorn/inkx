---
id: "@km/beads/frontmatter-path-rename"
aliases:
  - km-beads.frontmatter-path-rename
  - km-beads-frontmatter-path-rename
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: feature
priority: P3
parent: "@km/beads"
---

# Rename frontmatter `id:` to `path:` (or remove) — value is a path, not an id @km/beads #task #P3

The bead frontmatter field currently called `id:` holds a path-form value (`@km/beads/foo`), not an id. Per the consistent path/name/id vocabulary established in `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`, this is a misnomer. Either rename to `path:` or remove the field entirely (the path is derivable from filename + parent walk).

## Decision: rename or remove?

**Lean: remove.** The path is derivable from the file's location on disk + name. Storing it in frontmatter creates the same staleness risk as `data.id`. The serializer can emit it for human-readable display (rendered preview), but it doesn't need to be the source of truth.

Counter-argument for `rename to path:`: makes the value easy to copy-paste into queries, useful for offline reading where the file's tree position isn't obvious. Mild ergonomic win.

This is a P3 cleanup — defer the decision until the resolver and `data.id-stop-writing` work has settled. Once `data.id` is no longer load-bearing, evaluate whether the frontmatter field carries any non-redundant information.

## If renaming

- Markdown serializer writes `path:` instead of `id:`.
- Bead loader (`packages/km-beads/src/migrate.ts`?, plus the `.md → KNode` parser) reads either `path:` or `id:` (legacy fallback) for one transitional release.
- Emit a deprecation warning when reading the legacy `id:` field.
- After ≥1 release with the warning, drop the `id:` reader.

## If removing entirely

- Serializer stops emitting the field on new writes. Existing `id:` entries stay (fossils).
- Loader stops reading the field. Bead identity is fully determined by:
  - File location on disk → path → walk → id
  - Frontmatter `aliases:` (legacy bd-form ids for resolver fallback)

## Acceptance (depends on which option lands)

- For both: `bd show @km/beads/foo` works on freshly created beads (without `id:` field) and on existing beads (with `id:` field, ignored).
- For remove: existing tests that grep `id: "@km/..."` in fresh beads stop passing (rewrite to grep `path:` if renamed, or drop the assertion if removed).
- For rename: deprecation warning fires when reading legacy `id:`.

## Related

- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`.
- Depends on: `@km/beads/data-id-stop-writing` landing first.
