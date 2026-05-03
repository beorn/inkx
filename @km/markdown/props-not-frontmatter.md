---
id: "@km/markdown/props-not-frontmatter"
aliases:
  - km-markdown.props-not-frontmatter
  - km-markdown-props-not-frontmatter
created_by: claude:bjorns-2026-05-03
created_at: 2026-05-03T15:30:00Z
type: docs
priority: P3
parent: "@km/markdown"
---

# Vocabulary: "frontmatter" is markdown serialization, "props" is the data concept @km/markdown #docs #P3

Per the 2026-05-03 reframe of the path/name/id epic: in km's universal data
model, **there is no "frontmatter."** Frontmatter is a markdown
serialization concern — YAML between `---` fences in a `.md` file. The data
model has **props**: some first-class node fields (status, priority, due_at,
aliases, deps, …), the rest in `node.data` JSON.

This bead is a vocabulary sweep + light docs update so the right word is
used in the right place.

## Why

- The current code mixes the words: `data.frontmatter` keys, comments
  saying "frontmatter shape," variable names like `frontmatterFor(node)`.
  These leak markdown serialization vocab into layers above the parser.
- Conflating the two makes it harder to add other materializations (web
  UI form fields, future sync planes) — they don't have "frontmatter,"
  they have props rendered differently.
- Future Task / non-bead consumers shouldn't need to grok "what's a
  frontmatter" to use universal node props.

## Scope

### Renames (outside `@km/markdown`)

```
rg -n 'frontmatter' packages/km-* apps/km-* --type ts | grep -v 'km-markdown'
```

For each hit, judge:

- **Stays** — it's a markdown-serialization concern (e.g., the function
  that emits `---\n…\n---` fences during write-back).
- **Renames** — it's a data concept misnamed (e.g., `frontmatterFor(node)`
  that returns props, → `propsFor(node)`).

Likely renames (subject to grep verification):

- `data.frontmatter` JSON keys → `data.props`
- comments: "frontmatter shape" → "props shape"
- variable names: `frontmatterFields` → `propsFields`
- `parseFrontmatter` stays (it parses YAML between fences — that's
  literally frontmatter), but its return type rename to `Props`
  if it's currently `Frontmatter`.

### Docs

- `docs/design/model/storage.md` Names/Paths/IDs section already
  introduces "props" indirectly via the field reference. Add a paragraph
  near the top of the section saying explicitly:

  > **Vocabulary**: in km's data model, every node has *props* — some are
  > first-class fields (id, name, status, priority, …), others live in
  > `node.data` JSON. *Frontmatter* is one way props get serialized in
  > `.md` files (YAML between `---` fences); other materializations
  > render the same props differently. Use "props" in the data layer;
  > use "frontmatter" only when discussing markdown serialization
  > specifically.

- `docs/design/model/knode.md` — confirm field reference uses "field" or
  "prop," not "frontmatter."
- Package CLAUDE.mds — sweep for "frontmatter" outside `@km/markdown`
  context.

### Inside `@km/markdown`

The package legitimately uses "frontmatter" — `parseFrontmatter`,
`renderFrontmatter`, and friends are the parser/serializer for the YAML
fence. These stay. The boundary is: **the package can say "frontmatter,"
its callers say "props."**

## Acceptance

- `rg -n 'frontmatter' packages/km-* apps/km-* --type ts | grep -v
  'km-markdown'` shows only legitimate references (function imports from
  km-markdown, doc strings explaining the parser boundary).
- Renamed identifiers compile + tests pass.
- Storage.md contains the vocabulary paragraph above.

## Out of scope

- Inside `@km/markdown`, the parser surface (`parseFrontmatter`,
  `renderFrontmatter`) keeps its name. Boundary discipline, not internal
  rename.
- Removing the YAML fence syntax. Frontmatter as a serialization form
  stays; the rename is purely about what to call it outside the parser.

## Pairs with

- `@km/all/path-name-orthogonal-vocabulary` — same vocabulary-discipline
  axis. That bead covers id/name/path × tree/fs; this one covers
  props vs frontmatter.
- `@km/all/storage-doc-three-concepts` — sister docs bead.

## Related

- Tracking epic: `@km/all/path-name-id-redesign`.
- Origin: 2026-05-03 reframe — "in universal data model, 'frontmatter'
  doesn't exist."
