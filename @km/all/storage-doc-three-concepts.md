---
id: "@km/all/storage-doc-three-concepts"
aliases:
  - km-all.storage-doc-three-concepts
  - km-all-storage-doc-three-concepts
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: docs
priority: P3
parent: "@km/all"
---

# Storage docs: lock in the path/name/id three-concept vocabulary @km/all #docs #P3

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

## Acceptance

- All canonical docs use path / name / id consistently.
- New code in `packages/km-beads/`, `packages/km-storage/` uses the three terms in comments + variable names per their precise meaning (`pathOf`, `byName`, `nodeId`).
- The `@km/all/path-derivation-helper` bead's API (`pathOf`) lands with this naming convention; this bead's doc updates set the precedent.

## Related

- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`.
- Depends on: implementation beads (`@km/beads/resolver-path-via-name-walk`, `@km/beads/data-id-stop-writing`, `@km/all/path-derivation-helper`) so the docs describe shipped state.
