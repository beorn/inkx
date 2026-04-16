# Link Model

km represents every reference — wikilinks, embeds, sigils, external URLs — with **one canonical `KLink` type** plus a derived cache in the `links` table.

Design grounded in RFC 3986 (URI syntax), RFC 8288 (Web Linking / `rel`), and prior art from Obsidian, Dendron, Foam, Logseq. Naming follows the file-based PKM convention ("links", not "refs"/"edges"/"relations").

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
  rel: 'link' | 'embed'   // semantic relation — closed enum for v1
  alias?: string          // |alias display override
  md?: { form?: MdForm }  // notation used, for roundtrip fidelity
}

type MdForm = 'wiki' | 'mdlink' | 'autolink' | 'bare' | 'sigil'
```

`rel` is a closed enum for v1. Typed predicates (`blocked-by`, `author`, `cites`, …) from property links are deferred — when they land, `rel` widens to `string` and the normalizer enforces kebab-case. Every current call site is explicit about which of the two rels it emits.

The link's **host node is implicit** — it's whichever KNode owns the AST the link lives in. Named `KLink` following the `KNode` convention; avoids collision with silvery's `<Link>` UI component.

### `href` — parsed target, not raw notation

`href` is the **parsed target reference** — the target extracted from notation. `[[Note]]` → `km:Note`; `[text](url)` → `url`; `@Alice` → `km:Alice`. The notation (`[[…]]`, `[…](…)`, `@…`) is captured by `md.form` for roundtrip reconstruction.

The resolver normalizes `href` into a target node ID at runtime via the name index; the canonical layer keeps `href` intact.

## URI scheme

```
km:<name>                 node by name (resolved at runtime via name index)
km:<name>#<section>       section heading anchor
km:<name>#^<block>        block anchor
km:#<section>             self-reference — resolves to host node
km://<auth>/<path>        hierarchical — reserved for cross-vault federation

https://…  mailto:…       external references flow through unchanged
```

### Hierarchical names

`/` is a **path separator**, not an escapable character. `km:Project/Alpha` is a two-segment hierarchical name (matches Dendron/Foam convention). Segments are the atoms of the name index.

### Encoding

`km:` is an internal scheme optimized for readability, not strict RFC 3986 compliance. `normalizeLinkHref` encodes only the characters that would break parsing:

| char | encoding | why                                            |
|------|----------|------------------------------------------------|
| `?`  | `%3F`    | query delimiter                                |
| `#`  | `%23`    | fragment delimiter (unless it *is* the delimiter) |
| `%`  | `%25`    | escape for the above                           |
| `/`  | *unchanged* | path separator — hierarchical name segment |

Spaces, colons, apostrophes, and UTF-8 pass through raw. Names like `Project: Phase 1`, `Alice's notes`, or `研究` serialize as `km:Project: Phase 1`, `km:Alice's notes`, `km:研究`. Scheme-colon is only the first `:`; everything after is path. Inside fragments (`#…`), spaces are encoded to `%20`.

External URIs (`https://…`, `mailto:…`) pass through unchanged — they arrived already encoded.

## `rel` taxonomy

| `rel`    | Meaning                                                         |
|----------|-----------------------------------------------------------------|
| `link`   | Reference — includes plain links, sigils (`#tag`, `@person`, `+project`), external URLs |
| `embed`  | Inline content rendering (`![[Note]]`, `![](image.png)`)        |

**Sigils are just node references.** `#tag`, `@person`, `+project` all have `rel='link'` — the notation is UX, captured by `md.form`. The "tag-ness" lives on the **target node**, not on the link.

## Markdown → KLink

Complete rel↔notation mapping — **each notation produces exactly one rel**:

| Notation             | `href`                | `rel`    | `md.form`  |
|----------------------|-----------------------|----------|------------|
| `[[Note]]`           | `km:Note`             | `link`   | `wiki`     |
| `[[Note\|alias]]`    | `km:Note` + `alias`   | `link`   | `wiki`     |
| `[[Note#Section]]`   | `km:Note#Section`     | `link`   | `wiki`     |
| `[[Note^abc]]`       | `km:Note#^abc`        | `link`   | `wiki`     |
| `[[#Section]]`       | `km:#Section`         | `link`   | `wiki`     |
| `![[Note]]`          | `km:Note`             | `embed`  | `wiki`     |
| `![[image.png]]`     | `km:image.png`        | `embed`  | `wiki`     |
| `[t](https://x.com)` | `https://x.com` + `t` | `link`   | `mdlink`   |
| `<https://x.com>`    | `https://x.com`       | `link`   | `autolink` |
| `https://x.com`      | `https://x.com`       | `link`   | `bare`     |
| `@Alice`             | `km:Alice`            | `link`   | `sigil`    |
| `#foo`               | `km:foo`              | `link`   | `sigil`    |
| `+bar`               | `km:bar`              | `link`   | `sigil`    |

## Cache: `links` table

```sql
CREATE TABLE links (
  host_id TEXT NOT NULL,   -- node that hosts this link occurrence
  href    TEXT NOT NULL,   -- normalized authored locator (km:Note, https://…)
  rel     TEXT NOT NULL    -- 'link' | 'embed'
);

CREATE INDEX idx_links_host_id ON links(host_id);
CREATE INDEX idx_links_href    ON links(href);
CREATE UNIQUE INDEX idx_links_embed_one ON links(host_id) WHERE rel = 'embed';
```

Three columns. Resolution happens at runtime via the name index (`Map<name, nodeId[]>`), which is already built at startup in 55ms. The `links` table records what each node references; the name index tells you where those references point today.

**Column naming.** `host_id` mirrors the design language ("host node is implicit") and reads correctly for both link (host→target mention) and embed (host transcludes target) semantics. No conflict with `KNode.parent` (tree parent). When a cached `to_id` ships later, the pair reads `host_id, to_id, rel`.

### Why no `to_id` column?

- Resolution is runtime state — it changes when nodes are renamed/deleted without any link content changing.
- The name index is always current and naturally represents ambiguity (returns 0, 1, or N ids).
- Avoids stale cached resolution and the dual-path drift it creates.
- Add `to_id` as a cached column when a backlinks panel ships and profiling shows the name index lookup is too slow.

### Why `href` is needed

- **Broken links**: know what the dead reference was targeting without re-parsing source content.
- **External URLs**: `https://…` links have no target node.
- **Rename re-resolution**: find all links to the old name, re-resolve.
- **Debuggability**: "why is this link unresolved?" answerable from DB alone.

## Link resolution

Two pure stages: **parse**, then **resolve**. Shaped after WHATWG `URL` but closed to km's scheme and rel enum. Matches km's domain-object convention: plain data types + factory-created stateful resolvers, no classes.

### Parsing: `parseLinkHref`

```typescript
function parseLinkHref(href: string): KLinkRef  // total; throws on malformed input

type KLinkRef = {
  readonly scheme: string              // 'km' | 'https' | 'mailto' | …
  readonly isKm: boolean               // scheme === 'km'
  readonly isExternal: boolean         // !isKm
  readonly name: string                // lowercased hierarchical name for km; '' for external or self-ref
  readonly displayName: string         // original author casing, preserved for rendering
  readonly segments: readonly string[] // name split on '/'  ['project', 'alpha']
  readonly fragment: string | null     // raw fragment text, without leading '#'
  readonly anchor: KAnchor | null      // typed parse of the fragment
  readonly external: URL | null        // for non-km schemes, the WHATWG URL
}

type KAnchor =
  | { kind: 'section'; value: string }  // '#Section Name'  → { kind:'section', value:'Section Name' }
  | { kind: 'block';   value: string }  // '#^abc'          → { kind:'block',   value:'abc' }
```

External URIs (`https://…`, `mailto:…`) delegate to `new URL()`; `ref.external` is the parsed result.

Parse invariant: `parseLinkHref(stringifyLinkRef(ref))` deep-equals `ref`. Round-trip is total.

### Resolving: `createLinkResolver`

```typescript
function createLinkResolver(
  nameIndex: NameIndex,
  hostId: NodeId | null          // current host, for self-ref resolution
): KLinkResolver

type KLinkResolver = {
  resolve(ref: KLinkRef): KResolution
}

type KResolution =
  | { kind: 'external';  url: URL }
  | { kind: 'self';      host: NodeId;     anchor: KAnchor | null }
  | { kind: 'resolved';  target: NodeId;   anchor: KAnchor | null }
  | { kind: 'ambiguous'; targets: NodeId[]; anchor: KAnchor | null }
  | { kind: 'broken';    name: string }
```

Five cases, no overlap. Renderers and handlers switch on `kind` with no further logic.

### Name index

Built at startup from `nodes` (55ms typical); backs the resolver.

```typescript
type NameIndex = Map<string, NodeId[]>
// key = lowercased hierarchical name, e.g. "project/alpha" or "alice"
```

**Case-insensitive.** Keys are lowercased on insert and lookup; display uses the author's original casing from the node. `[[Alice]]` and `[[alice]]` resolve to the same target. Matches Obsidian, Dendron, and filesystem norms on macOS/Windows.

**Maintenance**:
- Startup: full scan.
- Node rename: O(1) — remove old entry, add new.
- Node create/delete: O(1) — single insert/remove.
- Bulk import: full rebuild.

**Lookup**: strict match only. `km:Alice` resolves via `get("alice")`; `km:Project/Alpha` via `get("project/alpha")`. **No base-name fallback** — if `Project/Alpha` isn't found, it's broken, even if an unambiguous `Alpha` exists. (Matches Dendron; prevents surprise resolution.)

### Render & interact

Callers never touch the name index or query `links`; they call `resolver.resolve(ref)` and switch on `kind`:

| `kind`     | rendering                                      | click                             |
|------------|------------------------------------------------|-----------------------------------|
| `external` | external link visual, external icon            | open in browser                   |
| `self`     | resolved visual (link color + dotted underline) | scroll to anchor in host          |
| `resolved` | resolved visual                                 | navigate to `target`              |
| `ambiguous`| ambiguous visual (`$warning` + superscript N)   | PickerDialog over `targets`       |
| `broken`   | broken visual (`$error` dashed underline)       | command offers "create note"      |

The render path **never calls `resolveByName` or the name index directly**. It consumes `KResolution`.

## Normalization

```typescript
function normalizeLinkHref(form: MdForm, label: string): string
```

**Invariants**:
- Every KLink writer routes through this function.
- Deterministic: same `(form, label)` → same `href`. No timestamps, no UUIDs, no Map-iteration-order dependence.
- Percent-encodes reserved characters per the Encoding section.

Since `rel` is a closed enum (`'link' | 'embed'`), the TypeScript type system enforces valid values — no runtime rel normalizer needed. When rel widens to include user-defined predicates, add `normalizeLinkRel` alongside.

Already implemented in `@km/markdown` under its previous name `normalizeRefHref`. **Must be renamed to `normalizeLinkHref` and wired into all write paths before schema migration.**

## Embed nodes

An **embed node** is a KNode whose sole purpose is transclusion — no content of its own. The term "embed" is used throughout — in markdown (`![[…]]`), in storage (`rel='embed'`), in the AST, and in TUI user-facing strings. One concept, one name.

**`embed_of` is runtime-materialized, not a DB column.** At load time, the loader populates `KNode.embed_of` from `SELECT host_id, href FROM links WHERE rel = 'embed'`, then resolves `href` via the name index. This keeps the `links` table as the single source of truth.

**Embed invariant**: a node with `embed_of` set must have empty content and exactly one `links` row with `rel='embed'`. The `idx_links_embed_one` partial unique index enforces the row count; STRICT mode enforces empty content and matching shape.

**Enforcement sites**:
- Parse time: `getEmbeddingText()` only recognizes sole-content `![[...]]`.
- Write time: `buildEmbedChild()` creates empty-content nodes with `embed_of`.

## Write protocol

When a node's content is edited, link-row maintenance is atomic:

```sql
BEGIN;
  DELETE FROM links WHERE host_id = ?;
  INSERT INTO links (host_id, href, rel) VALUES (?, ?, ?), …;
COMMIT;
```

No partial updates. No diff-based row edits. The cache is always in sync with the latest-parsed content.

## Migration

| Old                          | New                                      |
|------------------------------|------------------------------------------|
| `nodes.embed_of` (column)    | Runtime-materialized from `links` table  |
| `links.source_id`            | `links.host_id`                          |
| `links.target_name`          | `links.href`                             |
| `links.target_id`            | Dropped — resolved at runtime            |
| `links.embedded` (bool)      | `links.rel = 'embed'`                    |
| `links.relationship`         | `links.rel`                              |
| `links.section`, `.block_id` | Fragment inside `links.href`             |
| `Ref`, `normalizeRefHref`    | `KLink`, `normalizeLinkHref`             |

**Strategy**: bump data version → auto-rebuild from content re-parse on first open. No manual `.km/state.db` deletion required — the migration is transparent.

**Blocker**: do NOT ship until `normalizeLinkHref()` is wired into every write path (parser, undo/redo replay, programmatic construction sites). Audit first.

## Invariants

1. Canonical `KLink` has no host field — the host is the containing AST node.
2. **`links` is an occurrence cache.** Each row is one parsed link occurrence. `[[foo]] and [[foo]]` in the same node = 2 rows.
3. **FK behavior**: `host_id` cascades on delete (host gone → links gone).
4. `href` must be non-empty. Preserves the authored reference.
5. `rel` is `'link'` or `'embed'`. No other values in v1.
6. **Embed invariant**: node with `embed_of` must have empty content + exactly one `links` row with `rel='embed'`.
7. Wiping `links` and rebuilding from re-parsing all content yields identical results.
8. The canonical model never reads from the cache. `links` is downstream.
9. **Every writer goes through `normalizeLinkHref`.**
10. **The render path never calls `resolveByName`.** It reads `href` and resolves via name index by cardinality.
11. Name-index keys are lowercase; display preserves author casing.

## Deferred

- User-defined / typed rels (`blocked-by`, `author`, `cites`, …) and their property-link/frontmatter notation. Closed enum stays `'link' | 'embed'` until the rename and migration ship.
- Full source spans (`pos_start`, `pos_end`).
- Cross-vault federation (`km://…`).
- Auto-create stub nodes on unresolved references.
- `KNode.kind` field for sigil targets.
- `to_id` cached column + backlink index (add when profiling demands it).
- `link_targets` junction table for pre-resolved ambiguity.
- Base-name fallback resolution (rejected — ambiguity surprise > typing cost).

See also: [data-model.md](data-model.md), [glossary.md](../glossary.md). Review history: GPT-5.4 Pro 2026-04-07 (original), conversational 2026-04-15 (ambiguity, normalization, render invariant), GPT-5.4 Pro review 2026-04-16 (schema options evaluation), final simplification 2026-04-16 (3-column schema, runtime resolution, KLink naming), terminology + scope 2026-04-16 (host_id, symlink→embed unification, rel closed to `link|embed`, `/` as path separator, case-insensitive lookup, self-reference, determinism invariant).
