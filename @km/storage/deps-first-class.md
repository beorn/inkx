---
mentions:
  - km
id: "@km/storage/deps-first-class"
aliases:
  - km-storage.deps-first-class
  - km-storage-deps-first-class
created_by: claude:bjorns-2026-05-03
created_at: 2026-05-03T15:30:00Z
type: refactor
priority: P2
parent: "@km/storage"
closeReason: "Shipped via commit 6e1c2f5ca (feat(km-markdown): merge frontmatter
  dependencies into inline blocked-by prop). Frontmatter dependencies now
  elevate to data.props['blocked-by'] which the deps table triggers index.
  ast2nodes.ts:922 acknowledges this elevation. Single source of truth (the deps
  table) — no more parallel write-only data.dependencies fossil for SQL reads."
---

# [x] Consolidate frontmatter `dependencies:` into the existing inline `blocked-by` index @km/storage #refactor #P2

Today, dependencies have two source-of-truth representations:

- `data.dependencies` — YAML-frontmatter `dependencies:` array on file beads
  (`packages/km-beads/src/migrate.ts:187-189`,
  `packages/km-beads/src/data-schema.ts:137`). **Round-trips for serialization
  but no SQL reads it.** Effectively a write-only fossil today.
- `data.props["blocked-by"]` — Logseq-style inline property. Indexed by the
  `deps` SQLite table (`packages/km-storage/src/db/schema.ts:117-172`) via
  triggers that read `data.props["blocked-by"]` JSON only.

Per the 2026-05-03 arch review: this is a **real divergence** (frontmatter
form is unindexed; inline form is indexed). But the simplest fix is **not** a
new column — the `deps` table already does what we need. The fix is to make
the YAML-frontmatter loader populate `data.props["blocked-by"]` so both
authoring forms feed the existing trigger-indexed path.

## Why

- Two parallel representations invite drift — `bd create --dependency
  @km/foo` (writes frontmatter) and an inline `blocked-by:: [[@km/foo]]`
  (writes prop) end up in different storage shapes; the trigger only
  catches the second.
- Logseq-style inline `blocked-by::` is the more general pattern (works
  on any block) and is already trigger-indexed.
- A new `node.deps` column would duplicate the existing `deps` table's
  job. **YAGNI** — extend the loader, not the schema.

## Implementation sketch

1. **Loader-side merge**: in the bead/frontmatter loader, when
   `data.dependencies: [target1, target2, ...]` is parsed, write each
   target into `data.props["blocked-by"]` in the inline-prop shape:

```json
{ "type": "list", "values": [
  { "type": "link", "target": "target1" },
  { "type": "link", "target": "target2" }
]}
```

(Match the shape the trigger at schema.ts:127-133 already expects.)
2. The existing INSERT/UPDATE triggers (`schema.ts:117-156`) then write
   the `deps` rows. Indexing is automatic.
3. **No schema change.** No new column. No new table.
4. Frontmatter `dependencies:` stays as a write-side affordance for
   YAML-first authoring; inline `blocked-by::` stays as the body-prose
   form. Both feed the same trigger-indexed `data.props["blocked-by"]`.

## Acceptance

- A bead with frontmatter `dependencies: [@km/foo]` produces a row in
  the `deps` table after `repo.sync()`.
- A bead with inline `blocked-by:: [[@km/foo]]` produces the same row.
- Round-trip test asserts `SELECT target FROM deps WHERE host_id = ?`
  returns the dep regardless of authoring form.
- No new schema column or table. The fix is in the loader, not the DB.

## Out of scope

- Removing the inline-prop syntax. Logseq-style props are universal and
  stay.
- Removing the frontmatter `dependencies:` syntax. Stays for YAML-first
  authoring; this bead just wires the parser to feed the existing index.
- A `node.deps` column or `node_deps` table. The arch review (2026-05-03)
  explicitly rejected this as YAGNI — the `deps` table already exists
  and serves the read pattern.

## Pairs with

- `@km/all/drop-data-tags` (P3) — same denormalization-vs-cache pattern.

## Related

- Tracking epic: `@km/all/path-name-id-redesign`.
- Origin: 2026-05-03 reframe.

