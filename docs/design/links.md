# Link Model

km represents every reference — wikilinks, embeds, sigils, property links, external URLs — with **one canonical `Link` type** plus a derived cache.

Design grounded in RFC 3986 (URI syntax), RFC 8288 (Web Linking / `rel`), and prior art from Obsidian, Logseq, Notion, and Datomic.

## Three layers

```
1. Canonical:  Link — inline AST node inside KNode.content
2. Cache:      refs table — materialized expansion of per-node links, indexed
3. Hot path:   nodes.embed_of — column for sole-content embed predicate
```

The canonical layer is the source of truth. Cache and hot path are 100% rebuildable by re-parsing all content. The app relies on them being present, but they own no information the canonical layer doesn't.

## The Link type

```typescript
type Link = {
  href: string            // parsed target reference: "km:Note", "https://…", "mailto:…"
  rel: string             // semantic relation — RFC 8288; 'link' | 'embed' | <user-defined>
  alias?: string          // |alias display override
  md?: { form?: MdForm }  // notation used, for roundtrip fidelity
}

type MdForm = 'wiki' | 'mdlink' | 'autolink' | 'bare' | 'tag' | 'mention' | 'project'
```

Four fields. The link's **source is implicit** — it's whichever KNode owns the AST the link lives in.

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

**Sigils are just node references.** `#tag`, `@person`, `+project` all have `rel='link'` — the notation is UX, captured by `md.form` in the AST. The "tag-ness" lives on the **target node**, not on the link. See "Sigils and target kinds" below.

km does **not** support presentation and predicate simultaneously on one link (e.g., `[blocked-by:: ![[Task]]]` is not a use case). Keeping `embed` as a `rel` value is simpler and matches decades of HTML convention.

Queries:

```sql
WHERE to_id = ?                         -- all references to X
WHERE to_id = ? AND rel = 'embed'       -- all embeds of X
WHERE rel = 'blocked-by' AND to_id = ?  -- all things blocked by X
```

## Markdown → Link

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

The `refs` table is a **materialized expansion** of per-node link data — conceptually `SELECT n.id as from_id, link.* FROM nodes n, parse_links(n.content) link`, materialized and indexed for query performance. When a node's content changes, its refs are re-extracted: `DELETE FROM refs WHERE from_id = ?`, then re-insert.

```sql
CREATE TABLE refs (
  from_id   TEXT NOT NULL,    -- containing node id
  to_href   TEXT NOT NULL,    -- parsed target reference (km:Note, https://…, mailto:…)
  to_id     TEXT,             -- resolved exact target node id — heading, block, or note
  rel       TEXT NOT NULL     -- semantic relation (RFC 8288)
  -- alias TEXT              -- add when backlink display needs it without re-parsing source AST
);

CREATE INDEX idx_to_id      ON refs(to_id, rel);                  -- backlinks by target
CREATE INDEX idx_from_id    ON refs(from_id);                     -- outgoing
CREATE INDEX idx_to_href    ON refs(to_href);                     -- external URL backlinks
```

### Field semantics

| Field     | Always set? | Role                                                                   |
|-----------|-------------|------------------------------------------------------------------------|
| `from_id` | yes         | Containing node id. Source is always internal — no `from_href` needed  |
| `to_href` | yes         | **Parsed target reference** — `km:Note`, `https://…`. Roundtrip anchor |
| `to_id`   | sometimes   | Resolved exact target node. NULL when external or unresolved           |

**`to_id` is the exact resolved target.** If `[[Note#Heading]]` resolves, `to_id` is the heading node's id (headings are KNodes with their own ids). Backlinks to that specific heading are indexed. For "backlinks to the whole note, including anchored ones", query joins `refs` with `nodes` ancestry — denormalize if hot.

**`to_name` (deferred):** normalized base name for unresolved-link queries. Derivable from `to_href` — can be added as a stored generated column when the query demands it:
```sql
ALTER TABLE refs ADD COLUMN to_name TEXT
  GENERATED ALWAYS AS (...parse base from to_href...) STORED;
CREATE INDEX idx_unresolved ON refs(to_name) WHERE to_id IS NULL;
```

**What we're not storing** (YAGNI — add when a query demands them):
- Separate fragment columns — fragment lives inside `to_href`.
- `from_href` — source is always internal, `from_id` is enough.
- Link `ordinal` — no current need for occurrence identity or source-order.
- Note-level vs anchor-level split — ancestry-walk works; denormalize if hot.

## Hot path: `nodes.embed_of`

```sql
ALTER TABLE nodes ADD COLUMN embed_of TEXT;  -- resolved id of sole-content embed target
```

Set when a node's content is **exactly one `Link` with `rel='embed'` and nothing else**. NULL otherwise. Lets hot-path render code ask "is this a sole embed?" without joining `refs`. 100% derivable, recomputed on content change — same status as a DB index.

## Node-link predicate

There is no "node link" type. A KNode *is a link* iff its content contains exactly one `Link` and nothing else — a recognition pattern:

```typescript
isNodeLink(node)   ⇔ node.content has exactly one Link, nothing else
isNodeEmbed(node)  ⇔ isNodeLink(node) && that link.rel === 'embed'
embedTarget(node)  ⇔ isNodeEmbed(node) ? link.href : null
```

Markdown has no block-level link syntax — only inline. So "a link as a node" is structurally just a node whose entire inline content is one `Link`. `nodes.embed_of` caches the embed-only case.

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
| `links.source_id`            | `refs.from_id`                           |
| `links.target_name`          | `refs.to_href`                           |
| `links.target_id`            | `refs.to_id` (now exact target)          |
| `links.embedded` (bool)      | `refs.rel = 'embed'`                     |
| `links.relationship`         | `refs.rel`                               |
| `links.section`, `.block_id` | Fragment inside `refs.to_href`           |
| Vocab "symlink"              | "embed"                                  |

## Invariants

1. Canonical `Link` has no source field — source is the containing AST node.
2. **`refs` is an occurrence cache.** Each row is one parsed reference occurrence. `[[foo]] and [[foo]]` in the same node = 2 rows. Duplicates are valid. Backlink UIs should `SELECT DISTINCT from_id`; frequency queries use raw occurrences.
3. **FK behavior**: `from_id` cascades on delete (source gone → refs gone). `to_id` sets NULL on delete (target gone → keep `to_href`, lose resolution).
4. `to_href` must be non-empty. Must not be overwritten with resolved target title — it preserves the authored reference.
5. `rel` is a non-empty lowercase string.
6. `nodes.embed_of` caches `refs.to_id WHERE refs.from_id = node.id AND refs.rel = 'embed'` when the node has exactly one Link (sole-content embed). NULL otherwise.
7. A valid ULID never matches a user-creatable node name (disambiguates `km:<id>` vs `km:<name>`).
8. Wiping `refs` + `embed_of` and rebuilding from re-parsing all content yields identical results.
9. The canonical model never reads from the cache. `refs` is downstream.

## Deferred (not in this design)

- **Full source spans** (`pos_start`, `pos_end`) — deferred until incremental reparse demands them.
- **Cross-vault federation** (`km://user/vault/…`) — schema ready, resolver not. Needs real authority namespace semantics per RFC 3986.
- **Auto-create stub nodes** on unresolved references (Logseq pattern) — semantic shift, separate design.
- **Link versioning** (pin a revision) — no current use case.
- **`KNode.kind` field** for sigil targets — needs its own design pass; parser currently treats all sigils uniformly.
- **`rel` namespacing enforcement** — convention suffices until the first cross-vault use case.
- **Resolver ambiguity strategy** — at scale (100k+ nodes), name collisions will happen. Needs documented resolution strategy: first match, nearest scope, or error on ambiguity.

See also: [data-model.md](data-model.md) for KNode structure, [glossary.md](../glossary.md) for term definitions. Review: `/tmp/km-link-review.md` (GPT-5.4 Pro deep research, 2026-04-07).
