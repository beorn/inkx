---
mentions:
  - km
id: "@km/all/drop-data-tags"
aliases:
  - km-all.drop-data-tags
  - km-all-drop-data-tags
created_by: claude:bjorns-2026-05-03
created_at: 2026-05-03T15:30:00Z
type: refactor
priority: P3
parent: "@km/all"
closeReason: "Shipped in commit 36752c4a6 (refactor(km-markdown,km-storage):
  dissolve data.tags into the links table). Mutations no longer write data.tags.
  Hashtag links land in the links table at parse time. The kmRefsTransform
  comment in ast2nodes.ts:58 references the priority-elevation path (kept for
  the legacy data.tags fallback in getNodePriority for test fixtures), not a new
  data.tags write."
---

# [x] Drop `data.tags` denormalization — tags are wikilinks @km/all #refactor #P3

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

## ⚠️ Prerequisite NOT satisfied today (per 2026-05-03 arch review)

The bead's plan assumes "the markdown serializer emits `#P1` / `#task`
wikilinks in the body so the `links` table picks them up automatically."
**That emission does NOT exist today.** Verified via grep:

- `packages/km-beads/src/migrate.ts:207-213` (`issueToMarkdown` body
  assembly) puts tags into the `content`, but those land as plain text
  in the H1 line — not as wikilinks parsed into the `links` table.
- No code in `packages/km-markdown/` emits `#P<n>` or `#<type>` from
  priority/type fields when serializing a bead.
- Therefore: **dropping `data.tags` reads today would break
  `bd list --priority P1`** (returns 0 rows) and any other
  filter-by-tag query backed by the `data.tags` array.

**Two consumer surfaces use `data.tags`** — the bead's first draft only
named one:

1. **Beads** (`packages/km-beads/src/mutations.ts:206`,
   `apps/km-cli/src/commands/show.ts:259`,
   `packages/km-agent/src/queries.ts:130`,
   `packages/km-beads/src/queries.ts:266`) — priority/type denormalization.
2. **Parser hashtag-tagging** (`packages/km-markdown/src/extensions/km-refs.ts:25,36`)
   — paragraph nodes get `data.tags` from inline `#tag` markers in their
   own content. This is unrelated to bead priority/type but uses the same
   field name. Don't conflate.

## Phased implementation

**Phase A — establish the wikilink emission:**

1. In `packages/km-beads/src/migrate.ts` (`issueToMarkdown`) and any
   other bead serializer, emit `#P<n>` for priority and `#<type>` for
   type as inline wikilinks (or hashtag-tagged inline props) so the
   parser picks them up and writes link rows.
2. Add a parser/serializer round-trip test asserting the `links` table
   contains `(host_id, href='#P1')` for any bead with priority P1.
3. Land Phase A as a single PR. `data.tags` reads still work — nothing
   regresses.

**Phase B — migrate readers to the `links` table:**

4. Inventory consumers of `data.tags` (the 4 beads-side readers above —
   the parser-side at `km-refs.ts:25,36` is **out of scope** for this
   bead, see "Out of scope" below).
5. Replace each beads-side reader with a `links` table query:
- "Is this bead tagged P1?" → `SELECT 1 FROM links WHERE host_id = ?
     AND href = '#P1'`
- "List all P1 beads" → `SELECT host_id FROM links WHERE href = '#P1'`
14. Verify `bd list --priority P1` returns the same set as before.

**Phase C — stop writing `data.tags` (beads-side only):**

7. Remove the priority/type sync at
   `packages/km-beads/src/mutations.ts:206`.
8. Existing rows keep their `data.tags` entries as fossils — harmless
   since no reader consumes them.

## Acceptance

- Phase A: round-trip test confirms `links` table contains `#P<n>` and
  `#<type>` rows for beads.
- Phase B: no beads-side code reads `data.tags`. `bd list --priority P1`
  parity confirmed.
- Phase C: beads-side mutations stop writing `data.tags`.
- Parser-side `data.tags` (km-refs.ts) is **not touched** by this bead.

## Out of scope

- The parser-side `data.tags` writer at
  `packages/km-markdown/src/extensions/km-refs.ts:25,36`. Different
  consumer (paragraph hashtag-tagging), different concept; if it should
  also be removed, file a separate bead.
- Removing the `data.tags` JSON entries from existing rows. Pure cleanup;
  defer to a follow-up like `@km/storage/data-fossil-removal`.
- The frontmatter `tags:` YAML list authored by the user. That stays —
  it is parsed into wikilinks at read time, not stored as a parallel
  list (after Phase A).

## Pairs with

- `@km/storage/deps-first-class` — same denormalization-vs-cache pattern,
  same fix shape.

## Related

- Tracking epic: `@km/all/path-name-id-redesign`.
- Origin: 2026-05-03 reframe — "tags don't exist as their own thing; they
  are wikilinks to sigil boards."

