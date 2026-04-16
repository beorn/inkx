# Link Model

km represents every reference — wikilinks, embeds, sigils, property links, external URLs — with **one canonical `KLink` type** plus a derived cache in the `links` table.

Design grounded in RFC 3986 (URI syntax), RFC 8288 (Web Linking / `rel`), and prior art from Obsidian, Dendron, Foam, Logseq. Naming follows the file-based PKM convention (Obsidian, Dendron, Foam, TiddlyWiki all use "links").

## Two layers

```
1. Canonical:  KLink — inline AST data inside KNode.content
2. Cache:      links table — materialized expansion of per-node links, indexed
```

The canonical layer is the source of truth. The cache is 100% rebuildable by re-parsing all content.

## The KLink type

```typescript
type KLink = {
  href: string            // parsed target reference: "km:Note", "https://…", "mailto:…"
  rel: string             // semantic relation — RFC 8288; 'link' | 'embed' | <user-defined>
  alias?: string          // |alias display override
  md?: { form?: MdForm }  // notation used, for roundtrip fidelity
}

type MdForm = 'wiki' | 'mdlink' | 'autolink' | 'bare' | 'tag' | 'sigil'
```

The link's **host node is implicit** — it's whichever KNode owns the AST the link lives in. Named `KLink` following the `KNode` convention; avoids collision with silvery's `<Link>` UI component.

### `href` — parsed target, not raw notation

`href` is the **parsed target reference** — the target extracted from notation. `[[Note]]` → `km:Note`; `[text](url)` → `url`; `@Alice` → `km:Alice`. The notation (`[[…]]`, `[…](…)`, `@…`) is captured by `md.form` for roundtrip reconstruction.

The resolver normalizes `href` into a target node ID at runtime via the name index; the canonical layer keeps `href` intact.

## URI scheme

```
km:<name>                 node by name (resolved at runtime via name index)
km:<name>#<section>       section heading anchor
km:<name>#^<block>        block anchor
km://<auth>/<path>        hierarchical — reserved for cross-vault federation

https://…  mailto:…       external references flow through unchanged
```

## `rel` taxonomy

| `rel`            | Meaning                                                                   |
|------------------|---------------------------------------------------------------------------|
| `link`           | Reference (default) — includes sigils (`#tag`, `@person`, `+project`)     |
| `embed`          | Inline content rendering (`![[Note]]`, `![](image.png)`)                  |
| `<user-defined>` | Typed predicate (`blocked-by`, `author`, `cites`, …) from property links  |

**Sigils are just node references.** `#tag`, `@person`, `+project` all have `rel='link'` — the notation is UX, captured by `md.form`. The "tag-ness" lives on the **target node**, not on the link.

## Markdown → KLink

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
| `@Alice`               | `km:Alice`            | `link`       | `sigil`    |
| `#foo`                 | `km:foo`              | `link`       | `sigil`    |
| `+bar`                 | `km:bar`              | `link`       | `sigil`    |
| `[blocked-by:: [[X]]]` | `km:X`                | `blocked-by` | `wiki`     |

## Cache: `links` table

```sql
CREATE TABLE links (
  in_id TEXT NOT NULL,     -- host node id
  href  TEXT NOT NULL,     -- normalized authored locator (km:Note, https://…)
  rel   TEXT NOT NULL      -- link | embed | blocked-by | …
);

CREATE INDEX idx_links_in_id ON links(in_id);
CREATE INDEX idx_links_href  ON links(href);
```

Three columns. Resolution happens at runtime via the name index (`Map<name, nodeId[]>`), which is already built at startup in 55ms. The `links` table records what each node references; the name index tells you where those references point today.

### Why no `to_id` column?

- Resolution is runtime state — it changes when nodes are renamed/deleted without any link content changing
- The name index is always current and naturally represents ambiguity (returns 0, 1, or N ids)
- Avoids stale cached resolution and the dual-path drift it creates
- Add `to_id` as a cached column when a backlinks panel ships and profiling shows the name index lookup is too slow

### Why `href` is needed

- **Broken links**: know what the dead reference was targeting without re-parsing source content
- **External URLs**: `https://…` links have no target node
- **Rename re-resolution**: find all links to the old name, re-resolve
- **Debuggability**: "why is this link unresolved?" answerable from DB alone

### Ambiguity

The name index naturally represents ambiguity:

```typescript
const name = extractName(link.href)  // "km:Alice" → "Alice"
const targets = nameIndex.get(name) ?? []
// targets.length: 0=broken, 1=resolved, >1=ambiguous
```

Rendering:
- `0` → broken visual (`$error` dashed underline)
- `1` → resolved visual (link color + dotted underline)
- `>1` → ambiguous visual (`$warning` + superscript count)

Interaction:
- `1` click → navigate to `targets[0]`
- `>1` click → PickerDialog with candidates

## Normalization

```typescript
function normalizeRefHref(form: MdForm, label: string): string
```

**Invariant**: every code path that writes a KLink must route through this function. Already implemented in `@km/markdown`. Not yet wired into all write paths — **must complete before migration**.

## Embed nodes

An **embed node** is a KNode whose sole purpose is transclusion — no content of its own.

**`embed_of` is runtime-materialized, not a DB column.** At load time, the loader populates `KNode.embed_of` from `SELECT in_id, href FROM links WHERE rel = 'embed'`, then resolves `href` via the name index. This keeps the `links` table as the single source of truth.

**Embed invariant**: a node with `embed_of` set must have empty content and exactly one `links` row with `rel='embed'`. STRICT mode enforces.

**Enforcement**:
- Parse time: `getEmbeddingText()` only recognizes sole-content `![[...]]`
- Write time: `buildEmbedChild()` creates empty-content nodes with `embed_of`
- Partial index: `CREATE UNIQUE INDEX idx_links_embed_one ON links(in_id) WHERE rel = 'embed'`

## Migration

| Old                          | New                                      |
|------------------------------|------------------------------------------|
| `nodes.embed_of` (column)   | Runtime-materialized from `links` table  |
| `links.source_id`           | `links.in_id`                            |
| `links.target_name`         | `links.href`                             |
| `links.target_id`           | Dropped — resolved at runtime            |
| `links.embedded` (bool)     | `links.rel = 'embed'`                    |
| `links.relationship`        | `links.rel`                              |
| `links.section`, `.block_id`| Fragment inside `links.href`             |

**Strategy**: bump data version → auto-rebuild from content re-parse. Do NOT ship until `normalizeRefHref()` is wired into every write path.

## Invariants

1. Canonical `KLink` has no host field — the host is the containing AST node.
2. **`links` is an occurrence cache.** Each row is one parsed link occurrence. `[[foo]] and [[foo]]` in the same node = 2 rows.
3. **FK behavior**: `in_id` cascades on delete (host gone → links gone).
4. `href` must be non-empty. Preserves the authored reference.
5. `rel` is a non-empty lowercase string.
6. **Embed invariant**: node with `embed_of` must have empty content + exactly one `links` row with `rel='embed'`.
7. Wiping `links` and rebuilding from re-parsing all content yields identical results.
8. The canonical model never reads from the cache. `links` is downstream.
9. **Every writer goes through `normalizeRefHref`.**
10. **The render path never calls `resolveByName`.** It reads `href` and resolves via name index by cardinality.

## Deferred

- Full source spans (`pos_start`, `pos_end`)
- Cross-vault federation (`km://…`)
- Auto-create stub nodes on unresolved references
- `KNode.kind` field for sigil targets
- `to_id` cached column + backlink index (add when profiling demands it)
- `link_targets` junction table for pre-resolved ambiguity (add when runtime resolution is insufficient)

See also: [data-model.md](data-model.md), [glossary.md](../glossary.md). Review history: GPT-5.4 Pro 2026-04-07 (original), conversational 2026-04-15 (ambiguity, normalization, render invariant), GPT-5.4 Pro review 2026-04-16 (schema options evaluation), final simplification 2026-04-16 (3-column schema, runtime resolution, KLink naming).
