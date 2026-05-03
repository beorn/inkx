---
id: "@km/all/drop-data-tags"
aliases:
  - km-all.drop-data-tags
  - km-all-drop-data-tags
created_by: claude:bjorns-2026-05-03
created_at: 2026-05-03T15:30:00Z
type: refactor
priority: P3
parent: "@km/all"
---

# Drop `data.tags` denormalization — tags are wikilinks @km/all #refactor #P3

Today `mutations.ts:190` syncs `data.tags = ["P1", "task"]` from priority/type
changes — a denormalization for fast filtering. Per the 2026-05-03 reframe:
**tags are not a separate concept in km's universal data model.** A
hashtag like `#P1` is a wikilink to a node named `#P1`. The `links` table
already indexes wikilinks; queries like "all P1 beads" are
`SELECT host_id FROM links WHERE href = '#P1'`.

## Why

- **No parallel-derivation.** `data.tags` is a cache derived from
  priority/type fields. Caches can drift; the canonical state is the
  field. Anything that needs "tags for filter" can compute from
  fields-as-wikilinks via the `links` table.
- **Tags are universal already.** Any node can have hashtag wikilinks in
  its content; the indexer captures them. The `data.tags` writer is
  bead-specific code that mirrors a subset (priority + type) into a
  separate JSON list, only because beads' frontmatter uses YAML keys
  rather than inline `#tag` markers.
- **The user's framing**: in the universal data model, "tags" doesn't
  exist as its own thing — it's just links to other sigil-prefixed nodes
  (`#tag` is a link to a node named `#tag`).

## Implementation sketch

1. Inventory consumers of `data.tags`:
   - `grep -rn 'data\.tags\|data\["tags"\]' packages/ apps/` — find every
     reader.
2. For each reader, replace with a `links` table query:
   - "Is this bead tagged P1?" → `SELECT 1 FROM links WHERE host_id = ?
     AND href = '#P1'`
   - "List all P1 beads" → `SELECT host_id FROM links WHERE href = '#P1'`
3. Stop writing `data.tags`:
   - Remove the sync from `packages/km-beads/src/mutations.ts:190`.
   - The implicit "priority P1 → emit a `#P1` wikilink" rule stays: when
     priority/type are written, the markdown serializer emits `#P1` /
     `#task` in the body (or as inline props), so the `links` table picks
     them up automatically. (Confirm during implementation that the
     serializer does this; if not, add it.)
4. Migration: existing rows with `data.tags` keep the JSON entry as a
   fossil — no read paths consume it after this bead, so it's harmless.

## Acceptance

- No code reads `data.tags` after this bead.
- No code writes `data.tags` after this bead.
- `bd list --priority P1` (or equivalent) returns the same set as before,
  via the `links` table.
- A test asserts that priority/type changes update the link rows so the
  indexed query stays in sync.

## Out of scope

- Removing the `data.tags` JSON entries from existing rows. Pure cleanup;
  defer to a follow-up like `@km/storage/data-fossil-removal`.
- The frontmatter `tags:` YAML list authored by the user. That stays —
  but is parsed as wikilinks at read time, not stored as a parallel list.

## Pairs with

- `@km/storage/deps-first-class` — same denormalization-vs-cache pattern,
  same fix shape.

## Related

- Tracking epic: `@km/all/path-name-id-redesign`.
- Origin: 2026-05-03 reframe — "tags don't exist as their own thing; they
  are wikilinks to sigil boards."
