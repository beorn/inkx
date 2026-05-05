---
mentions:
  - km
id: "@km/all/storage-doc-three-concepts"
aliases:
  - km-all.storage-doc-three-concepts
  - km-all-storage-doc-three-concepts
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: docs
priority: P3
parent: "@km/all"
closeReason: "Shipped: docs/design/model/storage.md:768 establishes 'three
  concepts. None of them are equal to each other' as the source-of-truth
  section. Acceptance grep returns no real conflations — only intentional retro
  entries and one CLAUDE.md line that describes alignment (not equation) between
  path-form and frontmatter id. Vocabulary is consistent across docs/."
---

# [x] Storage docs: lock in the path/name/id three-concept vocabulary @km/all #docs #P3

Update canonical docs to use path/name/id consistently — never conflate ("the path is the id", "id is the name", etc.). The three-concept distinction is already in `docs/design/model/storage.md:761-767`; downstream docs and code comments need to align.

## Why

Per the 2026-04-30 design discussion, the user explicitly corrected:

> "perhaps we should just talk about it in terms of paths, names, and ids - consistently"
> "there is no 'the path is the id' or the 'id is the name'"
> "those are different things"

The /arch agent and the lead conflated these multiple times during the design discussion. Locking the vocabulary in the docs prevents future drift.

## Files to update

- **`docs/design/model/storage.md:373-378`** — ID Strategy table: clarify that the table describes the *id* column's value shape, not the path. Memory mode `path:line` is one form of the id (still an opaque internal handle), not a reference TO the path.
- **`docs/design/model/storage.md:761-787`** — Names, Paths, and IDs: this section IS the source of truth. Confirm it's accurate; cross-link from other sections that touch identity.
- **`docs/design/model/knode.md:13`** — KNode field reference: `id: string (ULID)` stays correct. Add a one-line note that `name` is the path *segment*, and that the full path is composed by walking parent chain.
- **`docs/design/model/knode.md:44`** — KNode shape diagram: `name: string ← slug/identifier` should be reframed as "name: string ← path segment (slug)".
- **`packages/km-storage/CLAUDE.md`** — add the three-concept invariant near the top: "id (ULID, opaque, stable), name (segment, per-parent unique for path-resolvable types), path (composed via parent-walk for human-facing display)."
- **`packages/km-beads/CLAUDE.md`** — if it exists, mirror the three-concept block.
- **CLAUDE.md (root)** — search for any conflations in the "Vault structure & sigil syntax" section; ensure each example uses the right term.

## Anti-conflation patterns to grep and fix

- `the path is the id` (or variants like "id = path", "path-as-id")
- `id is the name` (or "name = id")
- "node id" used to mean "path" in CLI output / docs
- `node.id` mentioned where the doc actually means the path-form

Acceptance grep:

```
rg -n "(path.*is.*id|id.*is.*path|path-as-id|id-as-path)" docs/ packages/*/CLAUDE.md CLAUDE.md
```

Should return only the .claude/arch-decisions/2026-04-30-*.md retro (which intentionally records the user's correction) and any quoted user-message verbatim.

## Additions from /pro 4-leg review (2026-04-30)

The /pro review surfaced four additional doc topics this bead should cover:

### 1. `fstype` vs `type` distinction

These are two orthogonal columns and the docs conflate them in places. Make
the distinction explicit:

- **`type`** — the markdown shape: `h` (heading), `p` (paragraph), `code`,
  `quote`, etc. Tells the parser/serializer what to render.
- **`fstype`** — the filesystem materialization tier: `repo`, `folder`,
  `file`, `mdsection`, or NULL (for unanchored blocks). Tells the sync layer
  whether and where to write to disk.

A node's `(type, fstype)` pair is what lets storage answer "is this a
backlinkable target?" (`fstype IS NOT NULL`) versus "what content tag does
the markdown serializer use?" (`type`). The `parent-name-unique-partial`
constraint partials by `fstype IS NOT NULL` precisely because of this split.

### 2. Anchor handling story (`file#section`)

The `[[@km/beads/foo#Goals]]` syntax addresses an mdsection inside a file.
Document:

- Resolution order: `@km/beads/foo` resolves to the file node (fstype=file),
  then `#Goals` is a secondary lookup against the file's mdsection children
  by name.
- mdsections share the file's `fs_path` — they're addressed via `(file,
  section-name)` not via a separate `fs_path` row.
- The file node's `fs_path` ends in `.md`; mdsection children's `fs_path` is
  NULL (or the file's path — confirm in code which it is and document).
- Backlink semantics: a wikilink to `@km/beads/foo#Goals` records the
  href against the **file** as host_id. Section-level backlinks are out of
  scope for v1; the resolver currently treats `#section` as a hint for
  display, not a separate target.

### 3. Slug stability invariant (titles do NOT auto-rename)

Document an explicit invariant: changing a node's display title (heading
content) **does not** rename the file. The `name` column (which is the slug
/ path segment) is decoupled from the title. Renames happen only via:

- `bd move <old-path> <new-path>` (or `move-with-refs`)
- Filesystem rename detected by the watcher
- Explicit `repo.renameNode(id, newName)` calls

This is load-bearing for content references — wikilinks pointing at a path
keep working when the user edits the title, and break (or trigger
`@km/all/rename-content-cascade`) only when the slug actually changes.

### 4. Slug case-normalization invariant

Slugs are stored case-preserved but resolved case-insensitive (per
`docs/design/model/klink.md` — wikilink resolution is case-insensitive).
Document:

- `nodes.name` stores the slug as authored (e.g., `Foo`, `FOO`, `foo` — all
  preserved verbatim).
- The resolver lower-cases both the input and the indexed name on lookup.
- The `parent-name-unique-partial` constraint enforces case-sensitive
  uniqueness at the SQL layer; case-collisions are detected at file-creation
  time by the OS filesystem on case-insensitive systems (macOS default,
  Windows) and pass through on case-sensitive systems (Linux).

### 5. Formalize `fs_path` as canonical cache (per dropped `drop-fs-path-derive-from-name`)

The /pro review reflected on whether to drop the `fs_path` column entirely.
Verdict: **keep it, document it as a canonical cache**. Reasoning:

- The OS filesystem owns file paths; km mirrors to `fs_path` for O(log N)
  queries via `idx_nodes_fs_path`.
- Recomputing path-form on every resolve via recursive CTE is O(depth) per
  query — measurable hit on hot paths.
- Watcher / reconciler / move-detection all need a stable column to compare
  against on file events.
- The duplication concern that motivated dropping it applies to `data.id`
  (which the resolver no longer reads — fully redundant), NOT to `fs_path`
  (which remains the only column carrying the materialized path).

Document `fs_path` as: "Cached materialized path-form, mirrored from the
filesystem on each sync. Never the source of truth — that's the actual file
location on disk. Read for fast indexed lookup; write only when the OS
filesystem confirms the move."

## Acceptance

- All canonical docs use path / name / id consistently.
- New code in `packages/km-beads/`, `packages/km-storage/` uses the three terms in comments + variable names per their precise meaning (`pathOf`, `byName`, `nodeId`).
- The `@km/all/path-derivation-helper` bead's API (`pathOf`) lands with this naming convention; this bead's doc updates set the precedent.
- The five /pro additions above are reflected in `docs/design/model/storage.md`.

## Related

- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`.
- Depends on: implementation beads (`@km/beads/resolver-path-via-name-walk`, `@km/beads/data-id-stop-writing`, `@km/all/path-derivation-helper`) so the docs describe shipped state.
- Pairs with: `@km/storage/parent-name-unique-partial` (referenced in the additions above).

