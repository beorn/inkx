# Ref Model

km represents every reference — wikilinks, embeds, sigils, property links, external URLs — with **one canonical `Ref` type** plus a derived cache.

Design grounded in RFC 3986 (URI syntax), RFC 8288 (Web Linking / `rel`), and prior art from Obsidian, Logseq, Notion, and Datomic. The file is named `links.md` for user-facing continuity — the user-facing word for a clickable navigable reference remains "link"; inside km the data-model noun is `Ref`, which also covers embeds and property references.

## Three layers

```
1. Canonical:  Ref — inline AST node inside KNode.content
2. Cache:      refs table — materialized expansion of per-node refs, indexed
3. Hot path:   nodes.embed_of — column for sole-content embed predicate
```

The canonical layer is the source of truth. Cache and hot path are 100% rebuildable by re-parsing all content. The app relies on them being present, but they own no information the canonical layer doesn't.

## The Ref type

```typescript
type Ref = {
  href: string            // parsed target reference: "km:Note", "https://…", "mailto:…"
  rel: string             // semantic relation — RFC 8288; 'link' | 'embed' | <user-defined>
  alias?: string          // |alias display override
  md?: { form?: MdForm }  // notation used, for roundtrip fidelity
}

type MdForm = 'wiki' | 'mdlink' | 'autolink' | 'bare' | 'tag' | 'mention' | 'project'
```

Four fields. The ref's **host node is implicit** — it's whichever KNode owns the AST the ref lives in. Previously called `Link`; renamed to `Ref` to (a) avoid collision with silvery's `<Link>` UI component, (b) cover embeds and property refs honestly (an embed is a reference but not a "link" in the navigable-UI sense), and (c) align with the `refs` table name.

### `href` — parsed target, not raw notation

`href` is the **parsed target reference** — the target extracted from notation. `[[Note]]` → `km:Note`; `[text](url)` → `url`; `@Alice` → `km:Alice`. The notation (`[[…]]`, `[…](…)`, `@…`) is captured by `md.form` for roundtrip reconstruction.

Not called `URI` because wikilink text (`[[My Note#Section]]`) is not a valid RFC 3986 URI — reserved characters would need percent-encoding. `href` (like HTML) is honest: "target reference, whatever form it takes."

The resolver normalizes `href` into `to_id` in the cache; the canonical layer keeps `href` intact.

## URI scheme (for resolved internal references)

Although `href` may be any authored string, **resolved internal references** use the `km:` scheme:

```
km:<id>                   node by stable ULID
km:<name>                 node by name (resolves at parse time)
km:<name>#<section>       section heading anchor
km:<name>#^<block>        block anchor
km://<auth>/<path>        hierarchical — reserved for cross-vault federation

https://…  mailto:…       external references flow through unchanged
```

ULIDs (26-char base32) and human-readable names are syntactically disjoint — invariant: a valid ULID shall never match a user-creatable node name. The hierarchical `km://authority/path` form reserves space for federation (see Decker ADR 005 for prior art: `owner/repo#item` path-based addressing).

## `rel` taxonomy

`rel` is a freeform string — matches HTML `rel` and RFC 8288 extension relation types. Built-in values plus user-defined predicates.

| `rel`            | Meaning                                                                   |
|------------------|---------------------------------------------------------------------------|
| `link`           | Reference (default) — includes sigils (`#tag`, `@person`, `+project`)     |
| `embed`          | Inline content rendering (`![[Note]]`, `![](image.png)`)                  |
| `<user-defined>` | Typed predicate (`blocked-by`, `author`, `cites`, …) from property links  |

**Sigils are just node references.** `#tag`, `@person`, `+project` all have `rel='link'` — the notation is UX, captured by `md.form` in the AST. The "tag-ness" lives on the **target node**, not on the ref. See "Sigils and target kinds" below.

km does **not** support presentation and predicate simultaneously on one ref (e.g., `[blocked-by:: ![[Task]]]` is not a use case). Keeping `embed` as a `rel` value is simpler and matches decades of HTML convention.

Queries:

```sql
WHERE to_id = ?                         -- all references to X
WHERE to_id = ? AND rel = 'embed'       -- all embeds of X
WHERE rel = 'blocked-by' AND to_id = ?  -- all things blocked by X
```

## Markdown → Ref

| Notation               | `href`                | `rel`        | `md.form`  |
|------------------------|-----------------------|--------------|------------|
| `[[Note]]`             | `km:Note`             | `link`       | `wiki`     |
| `[[Note\|alias]]`      | `km:Note` + `alias`   | `link`       | `wiki`     |
| `[[Note#Section]]`     | `km:Note#Section`     | `link`       | `wiki`     |
| `[[Note^abc]]`         | `km:Note#^abc`        | `link`       | `wiki`     |
| `![[Note]]`            | `km:Note`             | `embed`      | `wiki`     |
| `![[image.png]]`       | `km:image.png`        | `embed`      | `wiki`     |
| `[t](https://x.com)`   | `https://x.com` + `t` | `link`       | `mdlink`   |
| `<https://x.com>`      | `https://x.com`       | `link`       | `autolink` |
| `https://x.com`        | `https://x.com`       | `link`       | `bare`     |
| `@Alice`               | `km:Alice`            | `link`       | `mention`  |
| `#foo`                 | `km:foo`              | `link`       | `tag`      |
| `+bar`                 | `km:bar`              | `link`       | `project`  |
| `[blocked-by:: [[X]]]` | `km:X`                | `blocked-by` | `wiki`     |
| `mailto:a@b.com`       | `mailto:a@b.com`      | `link`       | `autolink` |

`@Alice`, `#Alice`, `[[Alice]]` all resolve to **the same target** `km:Alice` with `rel='link'`. They differ only in `md.form` (preserves notation for roundtrip). Sigils are just shorthand for node references.

## Sigils and target kinds

Sigils don't describe the link — they describe how we **find or display** a node of a particular kind. The kind lives on the target:

```
#urgent   → km:urgent   (target node kind=tag)
@Alice    → km:Alice    (target node kind=person)
+cleanup  → km:cleanup  (target node kind=project)
[[Note]]  → km:Note     (target node has no special kind)
```

Rendering `#urgent` with a `#` prefix is driven by **target node kind**, not by the link's `rel`. All sigils have `rel='link'` — they're plain references. Backlinks for a tag node show everything that references it, regardless of notation.

This matches how Obsidian, Logseq, and Roam behave: tags are pages (Logseq treats `[[urgent]]` and `#urgent` as equivalent; Obsidian has tag pages; Roam uses `#[[urgent]]`). The notation is UX; the underlying reference is uniform. When `KNode.kind` ships, the serializer can auto-detect the right sigil prefix from the target node.

**Target kind** (e.g., `KNode.kind: 'tag' | 'person' | 'project' | null`) is deferred — parser currently preserves sigil notation via `md.form` in the AST for roundtrip.

## Cache: `refs` table

The `refs` table is a **materialized expansion** of per-node ref data — conceptually `SELECT n.id as in_id, ref.* FROM nodes n, parse_refs(n.content) ref`, materialized and indexed for query performance. When a node's content changes, its refs are re-extracted: `DELETE FROM refs WHERE in_id = ?`, then re-insert.

```sql
CREATE TABLE refs (
  in_id     TEXT NOT NULL,    -- host node id: the node whose content contains this ref
  to_href   TEXT NOT NULL,    -- parsed target reference (km:Note, https://…, mailto:…)
  to_id     TEXT,             -- resolved exact target node id — first match, NULL if broken/external
  to_ids    TEXT,             -- JSON array of ALL resolved target ids; length encodes state
  rel       TEXT NOT NULL     -- semantic relation (RFC 8288)
  -- alias TEXT              -- add when backlink display needs it without re-parsing source AST
);

CREATE INDEX idx_to_id      ON refs(to_id, rel);                  -- backlinks by target (first match)
CREATE INDEX idx_in_id      ON refs(in_id);                       -- outgoing
CREATE INDEX idx_to_href    ON refs(to_href);                     -- external URL backlinks
```

### Field semantics

| Field     | Always set? | Role                                                                   |
|-----------|-------------|------------------------------------------------------------------------|
| `in_id`   | yes         | Host node id. The ref is spatially **in** this node's content. A ref has no `from_href` — sources are always internal. |
| `to_href` | yes         | **Parsed target reference** — `km:Note`, `https://…`. Roundtrip anchor |
| `to_id`   | sometimes   | First resolved target (= `json_extract(to_ids, '$[0]')`). NULL when external or unresolved. Kept as a convenience for index-friendly queries |
| `to_ids`  | yes         | JSON array of all resolved target ids. Length encodes state: 0=broken, 1=resolved, N=ambiguous. See "Ambiguity as data" below |

**Why `in_id` and not `from_id`** — `in` describes containment and reads the same way regardless of direction: a link is *in* a paragraph, an embed is *in* a paragraph. `from` flips meaning between authorship direction (for links) and content-flow direction (for embeds), causing the counterintuitive "embed from_id points at the host while content flows the other way" confusion. `in_id` is also forward-compatible: when the inline AST is promoted to tree nodes, a Ref's `in_id` is literally its `parent_id` — same concept, no rename needed.

**`to_id` is the first resolved target.** If `[[Note#Heading]]` resolves, `to_id` is the heading node's id (headings are KNodes with their own ids). Backlinks to that specific heading are indexed via `idx_to_id`. For "backlinks to the whole note, including anchored ones", query joins `refs` with `nodes` ancestry — denormalize if hot.

**`to_ids` stores ambiguity as data.** See the dedicated section below.

**`to_name` (deferred):** normalized base name for unresolved-ref queries. Derivable from `to_href` — can be added as a stored generated column when the query demands it:
```sql
ALTER TABLE refs ADD COLUMN to_name TEXT
  GENERATED ALWAYS AS (...parse base from to_href...) STORED;
CREATE INDEX idx_unresolved ON refs(to_name) WHERE to_id IS NULL;
```

**What we're not storing** (YAGNI — add when a query demands them):
- Separate fragment columns — fragment lives inside `to_href`.
- `from_href` — source is always internal, `in_id` is enough.
- Ref `ordinal` — no current need for occurrence identity or source-order.
- Note-level vs anchor-level split — ancestry-walk works; denormalize if hot.

## Ambiguity as data

km makes **no uniqueness guarantee** on node names — multiple nodes can legitimately share a name (a folder `@office` and a section `@office` in the same vault, a person file `@alice.md` and a mention `@alice` inside a heading, etc.). Rather than resolving to "first match" silently, we **surface the ambiguity** and let the user disambiguate.

The shape: `to_ids` is a JSON array, and its length encodes the ref's resolution state.

```
json_array_length(to_ids) === 0   →  broken    (no match — dead ref)
json_array_length(to_ids) === 1   →  resolved  (unambiguous — navigate directly)
json_array_length(to_ids)  >  1   →  ambiguous (N candidates — disambiguate on interaction)
```

Queries stay trivial:

```sql
-- broken refs (reporting, fix workflow)
SELECT * FROM refs WHERE json_array_length(to_ids) = 0;

-- ambiguous refs (reporting, disambiguation workflow)
SELECT * FROM refs WHERE json_array_length(to_ids) > 1;

-- backlinks including ambiguous matches
SELECT * FROM refs WHERE EXISTS (
  SELECT 1 FROM json_each(refs.to_ids) WHERE value = ?
);
```

**Rendering responsibilities** (shared with km-tui):

- `length === 0` → broken visual (dashed `$error` underline)
- `length === 1` → resolved visual (link color + dotted underline)
- `length > 1`  → ambiguous visual (`$warning` color + dotted underline + optional superscript count)

**Interaction responsibilities**:

- `length === 1` click → navigate directly to `to_ids[0]`
- `length > 1`  click → open a PickerDialog with candidates (uses silvery's `PickerDialog` + `SelectList`)
- `length > 1`  hover → popover lists all candidates with `fs_path`/type/preview

**Ordering**: `to_ids` is a ranked list. The resolver decides the rank at write time (suggested: `fstype` priority, then `fs_path` depth, then alphabetical). `to_id` is always `to_ids[0]` — the first candidate.

**Consequence**: "broken" and "ambiguous" are not render-time heuristics or error states — they are **data**. A single SQL query answers "which refs need attention" across the entire vault. The user fixes ambiguity by renaming or adding disambiguators to their markdown, and the resolver's next pass re-materializes `to_ids` as a length-1 array.

## Normalization

Refs are only as good as the `to_href` they carry, and `to_href` is only as good as the **one** normalization function that produces it. Without this discipline the same visible text can end up stored as two different canonical references depending on which code path produced it — and every divergent key is a silently-broken ref.

```typescript
// Single source of truth for "what does this notation mean?"
function normalizeRefHref(form: MdForm, label: string): string
// e.g.
//   ('wiki',    'Note')           → 'km:Note'
//   ('wiki',    'Note#Section')   → 'km:Note#Section'
//   ('wiki',    'Note^abc')       → 'km:Note#^abc'
//   ('mention', '@Alice')         → 'km:Alice'
//   ('tag',     '#urgent')        → 'km:urgent'
//   ('project', '+cleanup')       → 'km:cleanup'
//   ('bare',    'https://…')      → 'https://…'
```

**Invariant**: every code path that writes a Ref (or produces the `name`/`title` fields that Refs will later resolve against) must route through this function. That includes:

- Markdown parse (`@km/markdown` → `ast2nodes.ts`)
- TUI inline-edit write path (`@km/storage` → `repo.ts:updateNode`)
- Import, sync, and change handlers
- Bulk migrations and backfills

Concrete bug this prevents: historically the parse path ran `slugify(title)` (which strips `@`/`+`/`#`) while the TUI write path wrote raw content (which preserves the sigil). The same visible heading `@office` ended up with `name='office'` or `name='@office'` depending on origin — and resolution silently disagreed with itself. With a single `normalizeRefHref` gate, that class of bug can't exist.

**Where the function lives**: `@km/core` or `@km/markdown`, exported so every writer can import it. It must be pure, synchronous, and deterministic — no DB access, no network, no stateful cache.

## Render invariant

**The renderer never resolves.** km-tui (and any other surface) renders refs by reading the `refs` row — specifically `to_ids` and `rel` — and picking a visual + interaction based on cardinality. It does not call `resolveByName`, does not re-parse `node.content` for refs, does not maintain its own name index, and does not cache resolution results across frames.

```typescript
// Render contract for any Ref surface
function renderRef(ref: RefRow): Styling {
  switch (ref.to_ids.length) {
    case 0: return BROKEN_STYLE
    case 1: return RESOLVED_STYLE(ref.to_ids[0], ref.rel)
    default: return AMBIGUOUS_STYLE(ref.to_ids, ref.rel)
  }
}
```

**Why this invariant matters**: render-time resolution has historically been where staleness bugs breed in km. Every closure-local cache, every parallel lookup path, every "resolve on demand" optimization creates a surface where the rendered state can disagree with the canonical state. By forcing all resolution into the mutation layer (write path) and making rendering a pure function of `refs`, the entire class of "why is this link sometimes styled and sometimes not?" bugs goes away.

**Consequence**: resolution only runs inside a mutation transaction, never inside a render frame. Affected write paths:

- Ref row insert (new content parsed) → compute `to_ids` against current nodes
- Target candidate change (node add / rename / move / delete) → find refs whose `to_href` normalizes to the affected key, recompute `to_ids` for each
- Bulk load / migration → single-pass rebuild of all rows

See `km-storage.link-model-canonical` and follow-up beads for implementation sequencing.

## Hot path: `nodes.embed_of`

```sql
ALTER TABLE nodes ADD COLUMN embed_of TEXT;  -- resolved id of sole-content embed target
```

Set when a node's content is **exactly one `Ref` with `rel='embed'` and nothing else**. NULL otherwise. Lets hot-path render code ask "is this a sole embed?" without joining `refs`. 100% derivable, recomputed on content change — same status as a DB index.

## Node-ref predicate

There is no "node link" type. A KNode *is a ref* iff its content contains exactly one `Ref` and nothing else — a recognition pattern:

```typescript
isNodeRef(node)    ⇔ node.content has exactly one Ref, nothing else
isNodeEmbed(node)  ⇔ isNodeRef(node) && that ref.rel === 'embed'
embedTarget(node)  ⇔ isNodeEmbed(node) ? ref.href : null
```

Markdown has no block-level link syntax — only inline. So "a ref as a node" is structurally just a node whose entire inline content is one `Ref`. `nodes.embed_of` caches the embed-only case.

## Recovery

Two-anchor design (`to_href` authored + `to_id` resolved) enables recovery from external edits:

| Scenario                                | Recovery path                                         |
|-----------------------------------------|-------------------------------------------------------|
| File renamed externally, inode tracked  | `to_id` still valid → rewrite `to_href` to new name  |
| File renamed, name still unique         | Parse name from `to_href` → re-resolve → re-set `to_id` |
| Cache wiped, markdown intact            | Re-parse all content → rebuild all columns            |
| Markdown corrupted, cache intact        | `to_id` still valid → reconstruct `to_href`           |
| Both lost                               | Mark broken; surface in UI                            |

**Real rename robustness** requires one of: rewrite-on-rename, stable IDs embedded in source, or alias/redirect history. km leans on all three: stable ULIDs in the cache, name parsed from `to_href` for lookup, and explicit rewrite on detected rename.

## Migration from old schema

| Old                          | New                                      |
|------------------------------|------------------------------------------|
| `nodes.symlink_to`           | `nodes.embed_of` (renamed)                |
| `links.source_id`            | `refs.in_id`                             |
| `links.target_name`          | `refs.to_href`                           |
| `links.target_id`            | `refs.to_id` (now first match) + `refs.to_ids` (JSON array, all matches) |
| `links.embedded` (bool)      | `refs.rel = 'embed'`                     |
| `links.relationship`         | `refs.rel`                               |
| `links.section`, `.block_id` | Fragment inside `refs.to_href`           |
| Vocab "symlink"              | "embed"                                  |
| Vocab "link" (data model)    | "ref" (data model); "link" stays for user-facing UI |

## Invariants

1. Canonical `Ref` has no host field — the host is the containing AST node.
2. **`refs` is an occurrence cache.** Each row is one parsed reference occurrence. `[[foo]] and [[foo]]` in the same node = 2 rows. Duplicates are valid. Backlink UIs should `SELECT DISTINCT in_id`; frequency queries use raw occurrences.
3. **FK behavior**: `in_id` cascades on delete (host gone → refs gone). `to_id` / `to_ids` clear on target delete (target gone → keep `to_href`, lose resolution); `to_ids` becomes `[]`.
4. `to_href` must be non-empty. Must not be overwritten with resolved target title — it preserves the authored reference.
5. `to_id` is always `json_extract(to_ids, '$[0]')`, or NULL when `to_ids` is empty. The two columns are consistent by construction — `to_id` is a convenience view over `to_ids`.
6. `rel` is a non-empty lowercase string.
7. `nodes.embed_of` caches `refs.to_id WHERE refs.in_id = node.id AND refs.rel = 'embed'` when the node has exactly one Ref (sole-content embed). NULL otherwise.
8. A valid ULID never matches a user-creatable node name (disambiguates `km:<id>` vs `km:<name>`).
9. Wiping `refs` + `embed_of` and rebuilding from re-parsing all content yields identical results.
10. The canonical model never reads from the cache. `refs` is downstream.
11. **Every writer goes through `normalizeRefHref`.** Parse, TUI edit, import, sync, backfill — any code path that produces a `Ref` or a node `name`/`title` that refs will resolve against must route through the single normalization function. See the Normalization section.
12. **The render path never calls `resolveByName`** or any render-time resolver. It reads `to_ids` and picks a style by cardinality. All resolution happens inside mutation transactions. See the Render invariant section.

## Deferred (not in this design)

- **Full source spans** (`pos_start`, `pos_end`) — deferred until incremental reparse demands them.
- **Cross-vault federation** (`km://user/vault/…`) — schema ready, resolver not. Needs real authority namespace semantics per RFC 3986.
- **Auto-create stub nodes** on unresolved references (Logseq pattern) — semantic shift, separate design.
- **Ref versioning** (pin a revision) — no current use case.
- **`KNode.kind` field** for sigil targets — needs its own design pass; parser currently treats all sigils uniformly.
- **`rel` namespacing enforcement** — convention suffices until the first cross-vault use case.

**Resolved (was deferred):** resolver ambiguity strategy — see "Ambiguity as data" above. `to_ids[]` represents the full match set; `to_ids.length > 1` renders as ambiguous and opens a picker on click; the user fixes the ambiguity in markdown, resolver re-materializes on next mutation.

See also: [data-model.md](data-model.md) for KNode structure, [glossary.md](../glossary.md) for term definitions. Review history: GPT-5.4 Pro deep research 2026-04-07 (original design); conversational extension 2026-04-15 (ambiguity-as-data, normalization, render invariant, `Link` → `Ref` rename, `from_id` → `in_id`).
