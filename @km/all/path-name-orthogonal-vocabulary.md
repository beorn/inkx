---
id: "@km/all/path-name-orthogonal-vocabulary"
aliases:
  - km-all.path-name-orthogonal-vocabulary
  - km-all-path-name-orthogonal-vocabulary
created_by: claude:bjorns-2026-05-01
created_at: 2026-05-01T17:55:00Z
type: docs
priority: P3
parent: "@km/all"
---

# Path / name orthogonal vocabulary — tree vs fs as a 2×2 @km/all #docs #P3

Per 2026-05-01 user observation: name and path are most cleanly modeled as
**tree-model concepts** with **fs-materialized counterparts**, rather than
"name (segment) vs path (composed)" being the orthogonal axis. This bead
documents the 2×2 and renames the helpers to match.

## The 2×2

|  | **Tree (logical)** | **FS (materialized)** |
|---|---|---|
| **segment** | tree-name — `node.name` | fs-name — basename on disk (`foo.md` for files; `foo` for folders) |
| **composed** | tree-path — `KTree.path(tree, id)` parent walk | fs-path — `node.fs_path` cache (`./@km/beads/foo.md`) |

The previous "name vs path" framing collapses two distinct axes:
1. **Segment vs composed** — a single label vs a sequence of labels
2. **Tree vs fs** — the logical structure vs the on-disk materialization

The 2×2 keeps both axes explicit. The tree-row is the canonical model
(what the data IS); the fs-row is the materialization (how it's mirrored
to disk for human editing).

## Current state

| Cell | Today's primitive |
|---|---|
| tree-name | `node.name` (KNode field) — ✓ canonical |
| tree-path | `KTree.path(tree, id)` — ✓ canonical (shipped 2026-04-30) |
| fs-path | `node.fs_path` (storage column, cached from OS) — ✓ canonical |
| fs-name | implicit — derived ad-hoc via `basename(node.fs_path)` in callers |

`pathOf(node)` lives in the **wrong cell**: it reads from `fs_path` (the FS
side) and strips the FS-isms (`./` prefix, `.md` extension) to return what
is conceptually *tree-path computed via the fs cache*. That's a translation
across the orthogonal axis, not a clean primitive.

## Changes

### 1. Rename `pathOf` → `fsPathOf`

The function reads `node.fs_path` and strips `./` and `.md` — that is
literally `fsPathOf`, not `treePathOf`. (Earlier drafts of this bead
proposed `treePathOf`; the arch agent corrected this on 2026-05-03 — see
the path-name-id-redesign tracking epic.) The pure tree-walk version is
already shipped as `KTree.path(tree, id)` in `@km/tree`.

After the rename:

- `fsPathOf(node)` — returns the user-facing path-form derived from the
  fs cache. O(1) read of `node.fs_path` plus the strip.
- `KTree.path(tree, id)` — pure parent walk, cache-free. Already shipped.
- A future `treePathOf(node)` is intentionally NOT introduced — there is
  no consumer today, and `KTree.path()` covers every callsite that needs
  the cache-free version.

Site count: 6 callers migrated to `pathOf` in commit `c8c98bfd1`. One
more sweep flips them to `fsPathOf`.

### 2. Add `fsNameOf(node)`

Closes the implicit corner. Returns:

- `foo.md` for files (fstype = "file")
- `foo` for folders (fstype = "folder")
- `null` for non-fs-materialized nodes (paragraph, mdsection inline, etc.)

Backed by `basename(node.fs_path)` initially. Replaces ~5 inline
`basename(fs_path)` callsites (grep target similar to the prior
`pathOf` migration).

### 3. Document the 2×2 in canonical docs

- `docs/design/model/storage.md` Names/Paths/IDs section gains the 2×2 table.
- `docs/design/model/knode.md` references the orthogonality at the
  `name` and `fs_path` field reference entries.
- Package CLAUDE.mds for `@km/core` and `@km/storage` mention the 2×2 as
  the canonical mental model.

### 4. Vocabulary discipline: "frontmatter" is not a data-model concept

Per the 2026-05-03 reframe: in km's universal data model, **there is no
"frontmatter."** Frontmatter is a markdown serialization concern (YAML
between `---` fences in a `.md` file). The data model has **props** —
some first-class node fields, some in `node.data` JSON.

Code outside `@km/markdown` that refers to "frontmatter" as a data
concept (variable names, comments, doc strings) renames to "props." The
markdown package's `parseFrontmatter` etc. stay (parser concerns are
fine), but the *result* of parsing is props, not frontmatter.

This is captured in detail in the sister bead
`@km/all/props-not-frontmatter`.

### 5. (deferred) `treeNameOf(node)`

Trivial accessor for `node.name`. YAGNI — direct field access works.

### 6. (deferred) `fsNameOf(node)`

Per the 2026-05-03 arch review: only **one** caller of inline
`basename(node.fs_path)` exists in the codebase
(`packages/km-fs-mount/src/watch/change-handlers.ts:580`). YAGNI for now —
introduce only when a second consumer materializes. The 2×2 doc still
names the cell ("fs-name = basename on disk"); just don't ship a helper
yet.

## Acceptance

- `fsPathOf` exists in `@km/core`; `pathOf` becomes a `@deprecated`
  re-export for one transitional release. (Corrected 2026-05-03: the
  rename target is `fsPathOf`, NOT `treePathOf` — `pathOf` reads
  `fs_path` and strips, so it's the fs-cache reader, not a tree walker.
  `KTree.path()` is the cache-free tree walker; already shipped.)
- A `treePathOf` helper is intentionally NOT introduced. No consumer.
- `fsNameOf` is **deferred** until a second caller materializes (only
  one inline `basename(fs_path)` exists today).
- Storage.md, knode.md, and the two CLAUDE.mds carry the 2×2 vocabulary.
- A grep gate (oxlint rule or shell check) blocks reintroduction of inline
  `fs_path.replace(...)` patterns (the 6-site fix that already shipped).

## Out of scope

- Branded types (`TreePath`, `FsPath`, `TreeName`, `FsName`). YAGNI per
  `@km/all/id-name-path-code-cleanup`.
- Dropping `fs_path` entirely. Already decided NO in the dropped
  `@km/storage/drop-fs-path-derive-from-name`.

## Pairs with

- `@km/all/storage-doc-three-concepts` — same vocabulary discipline,
  different axis. The three-concept model (id / name / path) describes
  *which kind of handle* you're holding; this 2×2 describes *which
  materialization plane* the path/name lives on. They're complementary.
- `@km/all/id-name-path-code-cleanup` — the function-name rename sweep.

## Related

- Origin: 2026-05-01 user observation during the path/name/id session.
- Tracking epic: `@km/all/path-name-id-redesign`.
