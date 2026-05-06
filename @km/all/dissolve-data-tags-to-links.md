---
mentions:
  - km
id: "@km/all/dissolve-data-tags-to-links"
aliases:
  - km-all.dissolve-data-tags-to-links
  - km-all-dissolve-data-tags-to-links
created_by: claude:bjorns-2026-05-04
created_at: 2026-05-04T22:50:00Z
type: refactor
priority: P2
parent: "@km/all"
---

# Dissolve `data.tags` — hashtags belong in the `links` table @km/all #refactor #P2

Follow-on to `@km/all/path-name-id-redesign`. Same universal-data-model
logic that dissolved `shortId`, `data.id`, `data.tags`-write,
`data.dependencies`-frontmatter, and `nodes.priority`: hashtags are
links to sigil-prefixed nodes; they belong in the `links` table, not
in a parallel JSON cache.

## Why now

Per the user's framing (2026-05-04):

> "frontmatter tags - there is no such things as frontmatter at the tree level"
> "_allTags aggregation - do we need that?"
> "display in bd show and search results - do we need that?"
> "basically if we need tags can't we instead look it up in the links?"

All three concerns are real:

1. **Frontmatter tags as a parking field is dead reasoning** — we
   already dissolved "frontmatter" as a tree-level concept
   (`@km/all/props-not-frontmatter`). YAML `tags: [foo, bar]` parsed
   from the markdown layer should land in the `links` table as
   `(host_id, href='#foo', rel='link')` rows — same shape as inline
   `[[wikilink]]` rows. The "round-trip preservation" objection was
   leftover frontmatter-thinking.
2. **`_allTags` aggregation is dead code** — verified at
   `apps/km-tui/src/views/detail-pane-items.ts`: the field is in a
   list of fields to *hide*, not to display. No real consumer.
3. **Display in `bd show` and km-tui search** — derive at render time
   from a `links` table query (`WHERE host_id = ? AND href LIKE '#%'`).
   Cheap (indexed), single-source-of-truth, no cache to maintain.

## Scope

### Parser changes

- `packages/km-markdown/src/extensions/km-refs.ts`: stop writing
  `node.data.tags` from `extractAllRefs` output. Instead, emit
  `LinkExtraction` records for each `#tag` so the storage indexer
  writes link rows (`href='#foo'`, `rel='link'`).
- `packages/km-markdown/src/ast2nodes.ts`: drop the `_allTags`
  aggregation pass (~lines 1167-1187 — currently merges descendant
  tags into the file node's `data._allTags`).
- The existing `extractLinks(content, { tags: true })` regex pass at
  `packages/km-storage/src/markdown/extract-links.ts:72` already
  knows how to extract `#tag` patterns; the gap is wiring it for
  parsed nodes (currently only collapsed files run it).

### Reader changes

- `apps/km-cli/src/commands/show.ts:259`: replace
  `Array.isArray(data.tags) ? data.tags : []` with a links query for
  this node's `#%` hrefs.
- `packages/km-beads/src/queries.ts:289-296`: type extraction reads
  `data?.tags`. Replace with a links query for known type keywords.
- `packages/km-tui/src/views/SearchDialog.tsx`: search result rendering
  reads `result.tags` — needs the same treatment in the search index.
- `apps/km-tui/src/views/detail-pane-items.ts`: drop `_allTags` from
  the hidden-fields list once the field stops being written.

### Schema / migration

- No schema change needed (links table already exists, `idx_links_href`
  already indexed).
- One-shot rebuild: re-parse all .md files so existing `data.tags` JSON
  becomes `links` rows. Or: a migration step that does the conversion
  in SQL by walking `nodes.data` JSON.

### Round-trip

- For files originally authored with YAML `tags: [foo, bar]`: when
  serializing back to disk, decide between (a) emitting hashtags in
  body (`#foo #bar`), (b) re-emitting YAML `tags:`, (c) preserving
  authored form via a per-link `rel` value (`yaml-tag` vs `inline-tag`).
- Recommendation: (a) — the hashtag is the universal form. YAML `tags:`
  becomes a parser-time conversion. Users who prefer YAML lose strict
  preservation but gain consistency. Document the change.

## Acceptance

- `node.data.tags` is no longer written by the parser (verified by
  grep + a round-trip test).
- `data._allTags` is no longer written (grep verifies).
- `links` table contains `(host_id, href='#tag')` rows for every
  hashtag previously captured into `data.tags`.
- `bd show` displays tags via the links query — same rendering, new
  source.
- Search results show tags via the index that backs the links query.
- `bd list --priority P1` continues to work — already routes through
  FTS5 `#P1` query, unaffected.
- A round-trip test: parse → serialize → parse produces stable
  hashtag form (or stable YAML form, depending on chosen
  preservation strategy).

## Pairs with

- `@km/all/path-name-id-redesign` — the parent epic.
- `@km/storage/aliases-first-class` (shipped) — same indexed-table
  pattern. node_aliases ::= node_links for tags.

## Out of scope

- Re-introducing the `data.tags` field for any reason. The dissolution
  is total.
- Generalized `#pri/1` structured-tag form. Future option for `km tasks`
  but not part of this dissolution.

## Related

- 2026-05-04 conversation captured in session transcript:
  `f9eb64dc-d982-4a46-9a8e-da5fd882ac5f.jsonl`.
- Tracking epic close-out: when this bead lands, file the next
  follow-on epic (data-model dissolution arc) covering: drop
  `nodes.priority` hard cut (in progress wt2), drop `nodes.task_status`?
  drop `nodes.assigned_to`?

