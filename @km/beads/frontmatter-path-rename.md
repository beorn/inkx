---
mentions:
  - km
id: "@km/beads/frontmatter-path-rename"
aliases:
  - km-beads.frontmatter-path-rename
  - km-beads-frontmatter-path-rename
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: feature
priority: P3
parent: "@km/beads"
closeReason: "Shipped together with data-id-stop-writing:
  mutations.ts:renderBeadFile + renderInboxCapture + migrate.ts emit YAML
  frontmatter with NO 'id:' or 'path:' field — only 'aliases' and 'created_at'.
  The file's path on disk IS the canonical id; storing it in YAML duplicated the
  location. Decision was 'remove entirely', not 'rename to path:'."
---

# [x] Drop the redundant `id:` field from bead YAML — path is the file location @km/beads #task #P3

The bead-frontmatter YAML field currently called `id:` holds a path-form
value (`@km/beads/foo`), which is redundant with the file's location on
disk. Per the 2026-05-03 reframe (see `@km/all/path-name-id-redesign`):

- "Frontmatter" is a markdown serialization concern, not a data-model
  concept (see `@km/markdown/props-not-frontmatter`).
- The data model has props (id, name, path, status, …); some are
  serialized as YAML keys, some as inline body markers, some derived.
- Path is a derived prop — composed by parent-walk over names. Storing
  it in YAML duplicates the file's on-disk location.

**Decision: remove the `id:` YAML field.** Don't rename to `path:`. The
field carries no information the file's location doesn't already provide.

## Why remove (not rename)

- The path is derivable from the file's location on disk + name. Storing
  it in YAML creates the same staleness risk as `data.id`.
- "Renaming to path:" would imply the YAML key is authoritative — but it
  isn't; the file location is. Two sources of truth for path is the bug
  this whole epic was started to address.
- Counter-argument (originally cited): "easier to copy-paste from
  rendered preview." Weak — rendered preview can show derived path as
  display-only metadata; users copy from URL bars or path columns, not
  from YAML.

## Implementation

- Serializer stops emitting the `id:` YAML field on new writes. Existing
  entries stay as fossils — harmless.
- Loader stops reading the `id:` YAML field into `data.id`. Node
  identity is determined by:
  - File location on disk → path (derived) → resolver delegation to id
  - `aliases:` YAML field (universal alias mechanism, see
    `@km/storage/aliases-first-class`) — for legacy bd-form ids in
    imported vaults
- Tests that grep `id: "@km/..."` in fresh beads either drop the
  assertion or rewrite to assert the absence of the field.

### Existing `data.id` reads to migrate (per 2026-05-03 arch review)

Three production code paths currently read `data.id`:

1. `packages/km-storage/src/repo/loader.ts:1189` — canonical-id stamping
   during file ingest.
2. `packages/km-storage/src/repo/repo.ts:1416` — bead-related lookup.
3. `packages/km-storage/src/repo/move-with-refs.ts:281` — rename/move
   alias-preservation snapshot.

When the loader stops populating `data.id` from the YAML field, these
three readers degrade. The fix is to derive the canonical id from the
file's location on disk (`fs_path` → strip `./` and `.md`) at each read
site instead. **This is part of the paired `data-id-stop-writing` work**
— ship together.

## Acceptance

- `bd show @km/beads/foo` works on freshly created beads (no `id:` field)
  and on existing beads (with `id:` field, ignored).
- New beads' `.md` files do not contain an `id:` YAML key.
- Existing tests pass.

## Pairs with

- `@km/beads/data-id-stop-writing` (P2) — must ship together. The
  serializer's emit of the `id:` YAML field is what motivated `data.id`
  in the first place; both go away in one PR.
- `@km/markdown/props-not-frontmatter` (P3) — establishes the vocabulary
  this bead operates under.

## Related

- Tracking epic: `@km/all/path-name-id-redesign`.
- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`,
  reframed 2026-05-03.

